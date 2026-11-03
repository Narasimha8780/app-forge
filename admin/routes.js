const express = require('express');
const { authMiddleware } = require('../routes/auth');
const User = require('../models/User');
const { getCollection, ObjectId } = require('../config/db');
const router = express.Router();
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const statuses = ['new','contacted','in_progress','resolved'];
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.use(authMiddleware);
router.use(wrap(async(req,res,next)=>{
  const user=await User.findById(req.user.userId);
  if (!user || user.role !== 'admin') return res.status(403).json({success:false,error:'Administrator access required.'});
  req.admin=user; next();
}));
const supportOf = row => ({status: statuses.includes(row.support?.status) ? row.support.status : 'new', notes: row.support?.notes || '', updatedAt: row.support?.updatedAt || null, updatedBy: row.support?.updatedBy || null});
function present(row,kind) {
  const common={id:String(row._id),email:row.email,createdAt:row.createdAt,support:supportOf(row)};
  return kind==='users' ? {...common,name:[row.firstName,row.lastName].filter(Boolean).join(' '),username:row.username,phone:row.mobile,role:row.role==='admin'?'admin':'user'} : {...common,name:row.name,phone:row.phone,subject:row.subject,message:row.message,preferredCloud:row.preferredCloud};
}
router.get('/me',(req,res)=>res.json({success:true,name:req.admin.firstName, standalone: Boolean(req.app.locals.standaloneAdmin), appUrl: process.env.APP_PUBLIC_URL || ''}));
router.get('/overview',wrap(async(req,res)=>{
  const [users,contacts]=await Promise.all(['users','contacts'].map(async kind=>(await getCollection(kind).find({})).toArray()));
  const week=Date.now()-7*86400000;
  res.json({success:true,metrics:{users:users.length,contacts:contacts.length,newUsers:users.filter(u=>supportOf(u).status==='new').length,openContacts:contacts.filter(c=>supportOf(c).status!=='resolved').length,registrationsThisWeek:users.filter(u=>Date.parse(u.createdAt)>=week).length}});
}));
router.get('/:kind',wrap(async(req,res)=>{
  const {kind}=req.params;if(!['users','contacts'].includes(kind))return res.sendStatus(404);
  const {q='',status='',page='1'}=req.query;
  if(typeof q!=='string'||q.length>200||typeof status!=='string'||(status&&!statuses.includes(status))||typeof page!=='string'||!/^\d{1,6}$/.test(page)||Number(page)<1)return res.status(400).json({success:false,error:'Invalid search, status or page.'});
  const rows=(await (await getCollection(kind).find({})).toArray()).map(r=>present(r,kind)).filter(r=>(!status||r.support.status===status)&&(!q||[r.name,r.email,r.username,r.subject].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())))).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')||a.id.localeCompare(b.id));
  const offset=(Number(page)-1)*20;
  res.json({success:true,items:rows.slice(offset,offset+20),total:rows.length,page:Number(page),pageSize:20});
}));
router.patch('/:kind/:id/support',wrap(async(req,res)=>{
  const {kind,id}=req.params;if(!['users','contacts'].includes(kind)||! /^[a-f\d]{24}$/i.test(id))return res.sendStatus(404);
  const {status,notes,expectedUpdatedAt}=req.body;
  if(!statuses.includes(status)||typeof notes!=='string'||notes.length>4000||!(expectedUpdatedAt===null||typeof expectedUpdatedAt==='string'))return res.status(400).json({success:false,error:'Provide a valid status, notes (up to 4000 characters), and record version.'});
  const col=getCollection(kind), row=await col.findOne({$or:[{_id:id},{_id:new ObjectId(id)}]});
  if(!row)return res.status(404).json({success:false,error:'Record not found.'});
  if(supportOf(row).updatedAt!==expectedUpdatedAt)return res.status(409).json({success:false,error:'Another administrator updated this record. Refresh before saving.'});
  const now=new Date(Math.max(Date.now(), (Date.parse(row.updatedAt) || 0) + 1)).toISOString();
  // Match the previously-read document version to prevent lost concurrent updates.
  const query={_id:row._id, updatedAt:row.updatedAt};
  const support={status,notes:notes.trim(),updatedAt:now,updatedBy:String(req.admin._id)};
  const result=await col.updateOne(query,{$set:{support,updatedAt:now}});
  if(!result.matchedCount)return res.status(409).json({success:false,error:'Record changed. Refresh before saving.'});
  res.json({success:true,item:present({...row,support},kind)});
}));
module.exports=router;
