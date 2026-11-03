'use strict';
const $=id=>document.getElementById(id);
const token=localStorage.getItem('devmatrix_token')||localStorage.getItem('appforge_token');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={new:'New',contacted:'Contacted',in_progress:'In progress',resolved:'Resolved'};
let kind='users',page=1,items=[],selected,busy=false,generation=0;
const date=value=>value?new Date(value).toLocaleString(): '—';
async function api(path,options={}){
  const response=await fetch('/api/admin'+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token}});
  let data;try{data=await response.json();}catch{throw Error('Unable to load support records. Try again.');}
  if(!response.ok)throw Error(data.error||'Request failed.');return data;
}
function accessError(message){$('accessStatus').hidden=false;$('accessStatus').textContent=message;}
async function load(){
  const run=++generation;$('rows').innerHTML='<tr><td colspan="5">Loading records…</td></tr>';
  try{
    const [overview,result]=await Promise.all([api('/overview'),api('/'+kind+'?'+new URLSearchParams({q:$('search').value,status:$('status').value,page}))]);
    if(run!==generation)return;
    $('accessStatus').hidden=true;$('dashboard').hidden=false;
    const m=overview.metrics;for(const [id,value] of Object.entries({metricUsers:m.users,metricNew:m.newUsers,metricOpen:m.openContacts,metricWeek:m.registrationsThisWeek}))$(id).textContent=value;
    items=result.items;$('recordCount').textContent=result.total+' records';$('pageLabel').textContent='Page '+page+' of '+Math.max(1,Math.ceil(result.total/20));$('previous').disabled=page<=1;$('next').disabled=page*20>=result.total;
    $('rows').innerHTML=items.length?items.map((r,i)=>`<tr><td><strong>${esc(r.name)}</strong><small>${esc(r.email)}</small></td><td>${esc(kind==='users'?'@'+r.username:r.subject)}<small>${esc(kind==='users'?(r.role==='admin'?'Administrator':'Registered user'):r.preferredCloud)}</small></td><td>${esc(date(r.createdAt))}</td><td><span class="badge ${esc(r.support.status)}">${esc(labels[r.support.status])}</span></td><td><button data-record="${i}">View record →</button></td></tr>`).join(''):'<tr><td colspan="5">No records match these filters.</td></tr>';
  }catch(e){if(run!==generation)return;$('dashboard').hidden=true;accessError(e.message+' Sign in with an administrator account to continue.');}
}
$('rows').addEventListener('click',e=>{const button=e.target.closest('[data-record]');if(!button)return;selected=items[Number(button.dataset.record)];$('detailTitle').textContent=selected.name;$('recordDetails').innerHTML=`<p><strong>Email</strong> · ${esc(selected.email)}</p><p><strong>Phone</strong> · ${esc(selected.phone||'Not provided')}</p><p><strong>Received</strong> · ${esc(date(selected.createdAt))}</p>`+(kind==='contacts'?`<p><strong>${esc(selected.subject)}</strong></p><p>${esc(selected.message)}</p><p>Cloud preference: ${esc(selected.preferredCloud)}</p>`:`<p>Username: ${esc(selected.username)}</p><p>New registrations start here so your team can offer onboarding help.</p>`);$('recordStatus').value=selected.support.status;$('notes').value=selected.support.notes;$('lastUpdated').textContent=selected.support.updatedAt?'Last follow-up update: '+date(selected.support.updatedAt):'No follow-up recorded yet.';$('saveStatus').textContent='';$('detail').showModal();});
$('closeDetail').addEventListener('click',()=>{if(!busy)$('detail').close();});
$('detail').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('supportForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;$('saveRecord').disabled=true;$('saveStatus').textContent='Saving…';try{await api(`/${kind}/${selected.id}/support`,{method:'PATCH',body:JSON.stringify({status:$('recordStatus').value,notes:$('notes').value,expectedUpdatedAt:selected.support.updatedAt})});$('detail').close();await load();}catch(error){$('saveStatus').textContent=error.message;}finally{busy=false;$('saveRecord').disabled=false;}});
document.querySelectorAll('[data-kind]').forEach(button=>button.addEventListener('click',()=>{kind=button.dataset.kind;page=1;$('search').value='';$('status').value='';document.querySelectorAll('[data-kind]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-current',b===button?'page':'false');});$('listTitle').textContent=kind==='users'?'New users & onboarding':'Contact enquiries';$('listHint').textContent=kind==='users'?'Reach out personally and help users get their first app ready.':'Review questions, track responses and keep every follow-up in one place.';$('contextHeading').textContent=kind==='users'?'Account':'Enquiry';load();}));
$('filters').addEventListener('submit',e=>{e.preventDefault();page=1;load();});$('refresh').addEventListener('click',load);$('previous').addEventListener('click',()=>{if(page>1){page--;load();}});$('next').addEventListener('click',()=>{page++;load();});
$('signOut').addEventListener('click',()=>{for(const key of ['devmatrix_token','devmatrix_user','appforge_token','appforge_user'])localStorage.removeItem(key);location.href='/auth';});
if(token)load();else accessError('Sign in at /auth with an administrator account, then return to /admin.');
