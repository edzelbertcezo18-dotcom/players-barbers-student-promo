const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const CODES_FILE = path.join(DATA_DIR, 'codes.json');

const CONFIG = {
  business: 'PLAYERS BARBERS',
  location: '2nd floor, MAGIC MALL ANNEX URDANETA, PANGASINAN',
  facebook: 'https://www.facebook.com/p/Players-Barbers-Magic-Mall-Urdaneta-City-61589989845447/',
  price: '₱200',
  reward: 'FREE HAIRCUT after completing the required stamps',
  stamps: 5,
  schools: [
    'Urdaneta City University',
    'Pangasinan State University',
    'University of Eastern Pangasinan',
    'University of Pangasinan',
    'Lyceum-Northwestern University',
    'Urdaneta City National High School',
    'International Colleges for Excellence',
    'Others'
  ]
};

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CODES_FILE)) fs.writeFileSync(CODES_FILE, '[]');

function loadCodes() {
  try { return JSON.parse(fs.readFileSync(CODES_FILE, 'utf8')); }
  catch { return []; }
}
function saveCodes(codes) { fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2)); }
function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body='';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function makeCode(existing) {
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code='';
  do { code=''; for(let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)]; }
  while(existing.some(x=>x.code===code));
  return code;
}
function serve(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return json(res, 403, {error:'Forbidden'});
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, {error:'Not found'});
    const ext = path.extname(file).toLowerCase();
    const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
    res.writeHead(200, {'Content-Type':types[ext] || 'application/octet-stream'});
    res.end(data);
  });
}

http.createServer(async (req,res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && u.pathname === '/api/config') return json(res,200,CONFIG);

  if (req.method === 'POST' && u.pathname === '/api/generate-code') {
    try {
      const body=await readBody(req);
      if (!CONFIG.schools.includes(body.school)) return json(res,400,{error:'Please select a valid school.'});
      const codes=loadCodes();
      const record={code:makeCode(codes), school:body.school, createdAt:new Date().toISOString(), status:'unused', usedAt:null};
      codes.push(record); saveCodes(codes);
      return json(res,200,{code:record.code, school:record.school});
    } catch { return json(res,400,{error:'Invalid request.'}); }
  }

  if (req.method === 'POST' && u.pathname === '/api/check-code') {
    try {
      const body=await readBody(req);
      const code=String(body.code||'').trim().toUpperCase();
      if (!code) return json(res,400,{valid:false,error:'Enter a promo code.'});
      const codes=loadCodes();
      const record=codes.find(x=>x.code===code);
      if (!record) return json(res,200,{valid:false,status:'invalid',message:'INVALID CODE — No matching promo code found.'});
      if (record.status==='used') return json(res,200,{valid:false,status:'used',school:record.school,usedAt:record.usedAt,message:'CODE ALREADY USED'});
      return json(res,200,{valid:true,status:'unused',school:record.school,createdAt:record.createdAt,message:'VALID CODE — Confirm the student ID and Facebook follow with the customer.'});
    } catch { return json(res,400,{valid:false,error:'Invalid request.'}); }
  }

  if (req.method === 'POST' && u.pathname === '/api/use-code') {
    try {
      const body=await readBody(req);
      const code=String(body.code||'').trim().toUpperCase();
      const codes=loadCodes();
      const record=codes.find(x=>x.code===code);
      if (!record) return json(res,404,{success:false,message:'Invalid code.'});
      if (record.status==='used') return json(res,409,{success:false,message:'This code has already been used.'});
      record.status='used'; record.usedAt=new Date().toISOString(); saveCodes(codes);
      return json(res,200,{success:true,school:record.school,message:'Code confirmed and marked as USED.'});
    } catch { return json(res,400,{success:false,error:'Invalid request.'}); }
  }

  if (req.method === 'GET') return serve(req,res,u.pathname);
  return json(res,405,{error:'Method not allowed'});
}).listen(PORT,'0.0.0.0',()=>console.log(`PLAYERS BARBERS site running on port ${PORT}`));
