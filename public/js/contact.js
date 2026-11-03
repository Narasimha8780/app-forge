'use strict';
document.getElementById('contactForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,button=form.querySelector('button'),status=document.getElementById('contactStatus');button.disabled=true;status.textContent='Sending your enquiry…';
  try{const response=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to send. Please try again.');form.reset();status.textContent=data.message;}catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
