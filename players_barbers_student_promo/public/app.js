fetch('/api/config').then(r=>r.json()).then(cfg=>{
  const fbBtn=document.getElementById('fbBtn'), schoolSelect=document.getElementById('schoolSelect'), schoolError=document.getElementById('schoolError'), codeBtn=document.getElementById('codeBtn'), codeBox=document.getElementById('codeBox'), promoCode=document.getElementById('promoCode'), followError=document.getElementById('followError');
  fbBtn.href=cfg.facebook;
  schoolSelect.addEventListener('change',()=>{ schoolError.hidden=true; followError.hidden=true; codeBtn.disabled=!schoolSelect.value; });
  fbBtn.addEventListener('click',e=>{ if(!schoolSelect.value){e.preventDefault();schoolError.hidden=false;schoolSelect.focus();} });
  codeBtn.addEventListener('click',async()=>{
    if(!schoolSelect.value){followError.hidden=false;schoolSelect.focus();return;}
    codeBtn.disabled=true; codeBtn.textContent='GENERATING CODE…';
    try {
      const r=await fetch('/api/generate-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({school:schoolSelect.value})});
      const data=await r.json(); if(!r.ok) throw new Error(data.error||'Unable to generate code.');
      promoCode.textContent=data.code; codeBox.hidden=false; codeBtn.textContent='CODE GENERATED ✓';
    } catch(err) { followError.textContent=err.message; followError.hidden=false; codeBtn.disabled=false; codeBtn.textContent='I FOLLOWED THE PAGE — GET MY CODE'; }
  });
}).catch(()=>{});
