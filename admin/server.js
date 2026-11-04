require('dotenv').config();
const express=require('express');
const helmet=require('helmet');
const {rateLimit}=require('express-rate-limit');
const path=require('node:path');
const {connectDB,pingDB,closeDB,getStatus}=require('../config/db');
const app=express();
app.locals.standaloneAdmin=true;
app.disable('x-powered-by');
app.set('trust proxy',Number(process.env.TRUST_PROXY_HOPS||1));
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],connectSrc:["'self'"],upgradeInsecureRequests:process.env.NODE_ENV==='production'?[]:null}}}));
app.use(express.json({limit:'16kb'}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false,message:{success:false,error:'Too many sign-in attempts. Please try again later.'}}));
// The standalone service exposes sign-in, not public registration or app APIs.
app.use('/api/auth',(req,res,next)=>{
  if((req.method==='POST'&&req.path==='/login')||(req.method==='GET'&&req.path==='/me'))return next();
  res.status(404).json({success:false,error:'Endpoint not found'});
},require('../routes/auth').router);
app.use('/api/admin',require('./routes'));
app.get('/api/health',async(req,res)=>{try{await pingDB();res.json({status:'online',service:'devmatrix-admin',database:{engine:getStatus().engine,connected:true}});}catch{res.status(503).json({status:'unavailable'});}});
app.get('/auth',(req,res)=>res.sendFile(path.join(__dirname,'public/login.html')));
app.get('/favicon.svg',(req,res)=>res.sendFile(path.join(__dirname,'../public/favicon.svg')));
app.get('/',(req,res)=>res.redirect('/admin/'));
app.use('/admin',express.static(path.join(__dirname,'public')));
app.use((req,res)=>res.status(404).json({success:false,error:'Endpoint not found'}));
app.use((err,req,res,next)=>{const status=err.status||500;if(status>=500)console.error('[Admin request error]',err.name);res.status(status).json({success:false,error:status>=500?'Unable to complete request. Please try again.':err.message});});
async function startServer(port=process.env.PORT||8080){
  if(process.env.NODE_ENV==='production'&&(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32))throw Error('Set JWT_SECRET to a stable random secret of at least 32 characters');
  await connectDB();return new Promise((resolve,reject)=>{const server=app.listen(port,'0.0.0.0',()=>resolve(server));server.on('error',reject);});
}
if(require.main===module){let server;startServer().then(s=>{server=s;console.log('CloudOps Admin listening on port '+s.address().port);}).catch(async()=>{console.error('Admin startup failed. Check database and signing configuration.');await closeDB().catch(()=>{});process.exit(1);});
  const shutdown=()=>{const timer=setTimeout(()=>process.exit(1),9000);timer.unref();if(server)server.close(async()=>{await closeDB();process.exit(0);});};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
module.exports={app,startServer};
