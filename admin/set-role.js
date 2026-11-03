// Operator-only role assignment; never exposed over HTTP.
require('dotenv').config();
const { connectDB, closeDB } = require('../config/db');
const User = require('../models/User');
(async()=>{
  const [username,role]=process.argv.slice(2);
  if(!username||!['admin','user'].includes(role))throw Error('Usage: node admin/set-role.js <existing-username> <admin|user>');
  await connectDB();const user=await User.findByUsername(username);
  if(!user)throw Error('Register this user first.');
  const result=await User.collection().updateOne({_id:user._id},{$set:{role,updatedAt:new Date().toISOString()}});
  if(!result.matchedCount)throw Error('User was not updated.');
  console.log('Account role updated to '+role+'.');
})().catch(err=>{console.error(err.message);process.exitCode=1;}).finally(()=>closeDB());
