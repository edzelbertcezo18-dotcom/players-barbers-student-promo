const input=document.getElementById('staffCode');
const checkBtn=document.getElementById('checkBtn');
const result=document.getElementById('result');
const confirmArea=document.getElementById('confirmArea');
const useBtn=document.getElementById('useBtn');
let currentCode='';
let dashboardData={history:[],bySchool:[]};

function show(msg,cls){result.className='check-result '+cls;result.innerHTML=msg;result.hidden=false;}
async function check(){
  const code=input.value.trim().toUpperCase();
  if(!code){show('ENTER A PROMO CODE.','bad');confirmArea.hidden=true;return;}
  checkBtn.disabled=true;
  try{
    const r=await fetch('/api/check-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
    const d=await r.json();currentCode=code;
    if(d.valid){show(`<strong>✓ VALID CODE</strong><br>School: <strong>${escapeHtml(d.school)}</strong><br><small>Confirm student ID + Facebook follow before using.</small>`,'good');confirmArea.hidden=false;useBtn.disabled=false;}
    else{show(`<strong>${d.status==='used'?'⚠ CODE ALREADY USED':'✕ INVALID CODE'}</strong><br>${escapeHtml(d.message||'')}${d.school?`<br>School: <strong>${escapeHtml(d.school)}</strong>`:''}`,'bad');confirmArea.hidden=true;}
  }catch{show('Unable to check code. Make sure the server is running.','bad');confirmArea.hidden=true;}
  finally{checkBtn.disabled=false;}
}
checkBtn.addEventListener('click',check);
input.addEventListener('keydown',e=>{if(e.key==='Enter')check();});
useBtn.addEventListener('click',async()=>{
  if(!currentCode)return;useBtn.disabled=true;
  try{
    const r=await fetch('/api/use-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:currentCode})});
    const d=await r.json();
    if(d.success){show('<strong>✓ CONFIRMED — CODE MARKED AS USED</strong><br>Student may now avail the promo.','good');confirmArea.hidden=true;input.value='';currentCode='';await loadDashboard();}
    else show(escapeHtml(d.message||'Could not mark code as used.'),'bad');
  }catch{show('Unable to confirm code.','bad');}
  finally{useBtn.disabled=false;}
});

document.getElementById('refreshBtn').addEventListener('click',loadDashboard);
document.getElementById('historySearch').addEventListener('input',renderHistory);
document.getElementById('statusFilter').addEventListener('change',renderHistory);
document.getElementById('schoolFilter').addEventListener('change',renderHistory);
document.getElementById('exportBtn').addEventListener('click',exportCsv);

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString();}
async function loadDashboard(){
  const msg=document.getElementById('dashboardMessage');msg.textContent='Updating results…';
  try{
    const r=await fetch('/api/stats',{cache:'no-store'});if(!r.ok)throw new Error('Could not load dashboard');
    dashboardData=await r.json();
    document.getElementById('totalClaimed').textContent=dashboardData.totals.claimed;
    document.getElementById('totalRedeemed').textContent=dashboardData.totals.redeemed;
    document.getElementById('totalUnused').textContent=dashboardData.totals.unused;
    document.getElementById('totalSchools').textContent=dashboardData.totals.schools;
    renderSchools();populateSchoolFilter();renderHistory();msg.textContent='Updated '+new Date().toLocaleTimeString();
  }catch{msg.textContent='Could not load results. Check that the server is running and try refreshing.';}
}
function renderSchools(){
  const root=document.getElementById('schoolTally');const rows=dashboardData.bySchool.filter(x=>x.claimed>0);
  if(!rows.length){root.innerHTML='<p>No promo codes have been claimed yet.</p>';return;}
  const max=Math.max(1,...rows.map(x=>x.redeemed));
  root.innerHTML=rows.map(x=>`<div class="school-row"><div class="school-row-top"><span>${escapeHtml(x.school)}</span><strong>${x.redeemed} redeemed</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(x.redeemed/max*100)}%"></div></div><small>${x.claimed} claimed · ${x.unused} not redeemed</small></div>`).join('');
}
function populateSchoolFilter(){
  const select=document.getElementById('schoolFilter');const old=select.value;const schools=[...new Set(dashboardData.history.map(x=>x.school).filter(Boolean))].sort();
  select.innerHTML='<option value="all">All schools</option>'+schools.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  if(schools.includes(old))select.value=old;
}
function filteredHistory(){
  const q=document.getElementById('historySearch').value.trim().toLowerCase();const status=document.getElementById('statusFilter').value;const school=document.getElementById('schoolFilter').value;
  return dashboardData.history.filter(x=>{
    const isUsed=x.status==='used';
    return (!q||String(x.code||'').toLowerCase().includes(q)||String(x.school||'').toLowerCase().includes(q))&&
      (status==='all'||(status==='used'&&isUsed)||(status==='unused'&&!isUsed))&&(school==='all'||x.school===school);
  });
}
function renderHistory(){
  const rows=filteredHistory();const body=document.getElementById('historyRows');
  if(!rows.length)body.innerHTML='<tr><td colspan="5">No matching records.</td></tr>';
  else body.innerHTML=rows.map(x=>`<tr><td class="mono">${escapeHtml(x.code)}</td><td>${escapeHtml(x.school||'—')}</td><td><span class="status-pill ${x.status==='used'?'status-used':'status-unused'}">${x.status==='used'?'REDEEMED':'UNUSED'}</span></td><td>${escapeHtml(fmtDate(x.createdAt))}</td><td>${escapeHtml(fmtDate(x.usedAt))}</td></tr>`).join('');
  document.getElementById('historyCount').textContent=`Showing ${rows.length} of ${dashboardData.history.length} codes`;
}
function exportCsv(){
  const rows=filteredHistory();const cols=['code','school','status','createdAt','usedAt'];
  const csv=[cols.join(','),...rows.map(x=>cols.map(k=>'"'+String(x[k]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='players-barbers-promo-report.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
loadDashboard();
