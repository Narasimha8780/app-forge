'use strict';
document.getElementById('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target,button=form.querySelector('button'),status=document.getElementById('loginStatus');button.disabled=true;status.textContent='Signing in…';
  try{
    const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))}),data=await r.json();if(!r.ok)throw Error(data.error||'Sign-in failed.');
    const access=await fetch('/api/admin/me',{headers:{Authorization:'Bearer '+data.token}});if(!access.ok)throw Error('This account does not have administrator access. Contact your operator.');
    localStorage.setItem('devmatrix_token',data.token);location.href='/admin/';
  }catch(err){status.textContent=err.message;}finally{button.disabled=false;}
});
