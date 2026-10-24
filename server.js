'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = path.join(ROOT, 'club-data.json');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const APP_FILE = path.join(ROOT, 'index.html');
const ALLOWED = new Set(['gt_manager_v3', 'gt_training_sessions_v1']);
const MAX_BODY = 18 * 1024 * 1024;

let fileConfig = {};
if (fs.existsSync(CONFIG_FILE)) {
  try { fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { console.error('Could not parse config.json:', e.message); }
}
// Hosting environments should use secret environment variables; local config.json remains supported.
const config = {
  ...fileConfig,
  ownerPassword: process.env.OWNER_PASSWORD || fileConfig.ownerPassword,
  viewerPassword: process.env.VIEWER_PASSWORD || fileConfig.viewerPassword,
  ownerLanguage: process.env.OWNER_LANGUAGE || fileConfig.ownerLanguage
};
if (!config.ownerPassword || String(config.ownerPassword).startsWith('CHANGE-')) {
  console.error('SECURITY STOP: Set OWNER_PASSWORD environment variable or set ownerPassword in config.json.');
  process.exit(1);
}
if (!config.viewerPassword) console.warn('VIEWER_PASSWORD is not set; viewer login may be unavailable.');
let state = { updated_at: 0, values: {} };
try { const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); if (saved && saved.values) state = saved; } catch (_) {}
// ---- Sessions survive server restarts (stored on disk as hashes, never as raw tokens) ----
const SESSIONS_FILE = path.join(ROOT, 'sessions.json');
const SESSION_MS = 12 * 60 * 60 * 1000;
const sessionStore = new Map();
const sid = t => crypto.createHash('sha256').update(String(t)).digest('hex');
try { const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); const now = Date.now(); Object.entries(raw).forEach(([k, s]) => { if (s && s.expires > now && (s.role === 'owner' || s.role === 'viewer')) sessionStore.set(k, s); }); } catch (_) {}
function flushSessions() { try { const now = Date.now(), out = {}; sessionStore.forEach((s, k) => { if (s.expires > now) out[k] = s; }); const tmp = SESSIONS_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 }); fs.renameSync(tmp, SESSIONS_FILE); } catch (e) { console.error('Could not save sessions:', e.message); } }
function saveSessions() { flushSessions(); }
function getSess(t) { return sessionStore.get(sid(t)); }
function setSess(t, s) { sessionStore.set(sid(t), s); saveSessions(); }
function delSess(t) { sessionStore.delete(sid(t)); saveSessions(); }
process.on('exit', flushSessions);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
const safeEqual = (a,b) => { const x=Buffer.from(String(a)), y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); };
function parseCookies(req){const out={};(req.headers.cookie||'').split(';').forEach(p=>{const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())});return out;}
function roleOf(req){const token=parseCookies(req).tb_session;const sess=token&&getSess(token);if(!sess)return null;const now=Date.now();if(sess.expires<now){delSess(token);return null;}if(sess.expires-now<SESSION_MS-60*60*1000){sess.expires=now+SESSION_MS;saveSessions();req.tbRenew=token;}return sess.role;}
function send(res,status,body,type='text/plain; charset=utf-8',headers={}){res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store',...headers});res.end(body);}
function json(res,status,obj,headers={}){send(res,status,JSON.stringify(obj),'application/json; charset=utf-8',headers);}
function persist(){const tmp=DATA_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,DATA_FILE);}
function loginPage(message='', mode='login') { return `<!doctype html><html lang="bn"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thunderbolts FC · Secure Access</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at top,#143c4c,#020a15 60%);font:16px Arial,sans-serif;color:#edf5ff}.box{width:min(92vw,430px);background:#07172a;border:1px solid #21445e;border-radius:18px;padding:28px;box-shadow:0 20px 70px #0008}h1{font-size:23px;margin:10px 0 8px}p{color:#a5b7ce;line-height:1.5;font-size:13px}label{display:block;margin:16px 0 7px;color:#a5b7ce;font-size:12px;font-weight:bold}select,input{width:100%;padding:12px;background:#020d1b;border:1px solid #24445e;border-radius:8px;color:#fff}button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:8px;background:#d5ff28;color:#081321;font-weight:900;cursor:pointer}.secondary{background:#173149;color:#eaf5ff;margin-top:10px}.err{color:#ff9aa8}.badge{color:#d5ff28;font-size:11px;letter-spacing:2px;font-weight:900}.hidden{display:none}.note{font-size:12px;color:#91a8bf}</style><div class="box"><div class="badge">⚡ GHILATOLY THUNDERBOLTS</div><h1 id="title">${mode==='register'?'সদস্য অ্যাকাউন্ট তৈরি':'Club Manager Access'}</h1><p>সদস্যরা ফোন নম্বর ও ৬ সংখ্যার পাসওয়ার্ড দিয়ে অ্যাকাউন্ট খুলতে পারবেন। সদস্যদের অ্যাকাউন্ট শুধু View-only; Owner-ই ডেটা পরিবর্তন করতে পারবেন।</p>${message?`<p class="err">${message}</p>`:''}<section id="loginPanel" class="${mode==='register'?'hidden':''}"><form method="post" action="/login" autocomplete="on"><label for="role">অ্যাক্সেস</label><select id="role" name="role" onchange="toggleFields()"><option value="viewer">ক্লাব সদস্য · View only</option><option value="owner">Club owner · Edit data</option></select><div id="memberFields"><label for="phone">ফোন নম্বর</label><input id="phone" name="phone" type="tel" placeholder="01XXXXXXXXX বা +8801XXXXXXXXX" autocomplete="username"><label for="memberPassword">৬ সংখ্যার পাসওয়ার্ড</label><input id="memberPassword" name="memberPassword" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="current-password"></div><div id="ownerFields" class="hidden"><label for="password">Owner Password</label><input id="password" name="password" type="password" autocomplete="current-password"></div><button type="submit">SIGN IN</button></form><button class="secondary" type="button" onclick="showRegister()">নতুন সদস্য? অ্যাকাউন্ট খোলো</button></section><section id="registerPanel" class="${mode==='register'?'':'hidden'}"><form id="registerForm"><label for="regPhone">ফোন নম্বর</label><input id="regPhone" name="phone" type="tel" placeholder="01XXXXXXXXX বা +8801XXXXXXXXX" autocomplete="tel" required><label for="regPassword">৬ সংখ্যার পাসওয়ার্ড তৈরি করুন</label><input id="regPassword" name="password" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password" required><label for="confirmPassword">পাসওয়ার্ড আবার লিখুন</label><input id="confirmPassword" name="confirmPassword" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password" required><button type="submit">অ্যাকাউন্ট তৈরি করুন</button><p id="regStatus" aria-live="polite"></p></form><button class="secondary" type="button" onclick="showLogin()">আগে অ্যাকাউন্ট আছে? লগইন</button></section><p class="note">SMS OTP লাগবে না। পাসওয়ার্ড ঠিক ৬টি সংখ্যা হবে। ফোন নম্বর OTP দিয়ে যাচাই করা হয় না, তাই কেবল নিজের নম্বর দিন। সহজ পাসওয়ার্ড যেমন 123456 ব্যবহার করবেন না।</p><p>Club data is stored on the club owner's laptop.</p></div><script>function toggleFields(){let owner=document.getElementById('role').value==='owner';document.getElementById('memberFields').classList.toggle('hidden',owner);document.getElementById('ownerFields').classList.toggle('hidden',!owner);document.getElementById('phone').required=!owner;document.getElementById('memberPassword').required=!owner;document.getElementById('password').required=owner}function showRegister(){document.getElementById('loginPanel').classList.add('hidden');document.getElementById('registerPanel').classList.remove('hidden');document.getElementById('title').textContent='সদস্য অ্যাকাউন্ট তৈরি'}function showLogin(){document.getElementById('registerPanel').classList.add('hidden');document.getElementById('loginPanel').classList.remove('hidden');document.getElementById('title').textContent='Club Manager Access'}async function postForm(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});let j={};try{j=await r.json()}catch(_){}if(!r.ok)throw new Error(j.error||'অনুরোধটি সম্পন্ন হয়নি।');return j}document.getElementById('registerForm').addEventListener('submit',async e=>{e.preventDefault();const status=document.getElementById('regStatus'),phone=document.getElementById('regPhone').value.trim(),password=document.getElementById('regPassword').value,confirmPassword=document.getElementById('confirmPassword').value;if(!/^\d{6}$/.test(password)){status.textContent='পাসওয়ার্ড ঠিক ৬টি সংখ্যা হতে হবে।';return}if(password!==confirmPassword){status.textContent='দুটি পাসওয়ার্ড মিলছে না।';return}status.textContent='অ্যাকাউন্ট তৈরি হচ্ছে…';try{await postForm('/register',{phone,password,confirmPassword});alert('অ্যাকাউন্ট তৈরি হয়েছে! এখন ফোন নম্বর ও ৬ সংখ্যার পাসওয়ার্ড দিয়ে লগইন করুন।');location.href='/login'}catch(e){status.textContent=e.message}});toggleFields();</script></html>`; }
function loadUsers(){try{const x=JSON.parse(fs.readFileSync(path.join(ROOT,'users.json'),'utf8'));return Array.isArray(x)?x:[]}catch(_){return []}}
let users=loadUsers();
function saveUsers(){const f=path.join(ROOT,'users.json'),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(users,null,2),{mode:0o600});fs.renameSync(tmp,f)}
function normalizePhone(value){let n=String(value||'').trim().replace(/[\s().-]/g,'');if(n.startsWith('+'))n='+'+n.slice(1).replace(/\D/g,'');else n=n.replace(/\D/g,'');if(n.startsWith('00880'))n='+'+n.slice(2);else if(n.startsWith('880'))n='+'+n;else if(n.startsWith('01')&&n.length===11)n='+88'+n;return n}
function validPhone(n){return /^\+?[1-9]\d{7,14}$/.test(n)}
function passwordHash(password,salt){return crypto.scryptSync(password,salt,64).toString('hex')}
function readBody(req){return new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(new Error('Body too large'));req.destroy();}else chunks.push(c)});req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));req.on('error',reject)});}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true});
  if(req.method==='GET'&&url.pathname==='/login')return send(res,200,loginPage(),'text/html; charset=utf-8');
  if(req.method==='POST'&&url.pathname==='/login'){
    try{
      const body=new URLSearchParams(await readBody(req));const role=body.get('role')==='owner'?'owner':'viewer';let good=false,phone='';
      if(role==='owner') good=safeEqual(body.get('password')||'',config.ownerPassword);
      else {phone=normalizePhone(body.get('phone'));const memberPass=body.get('memberPassword')||'';const user=users.find(u=>u.phone===phone);if(user && /^\d{6}$/.test(memberPass)){const candidate=passwordHash(memberPass,user.salt);good=safeEqual(candidate,user.passwordHash);}}
      if(!good)return send(res,401,loginPage('ফোন নম্বর/পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন.'),'text/html; charset=utf-8');
      const token=crypto.randomBytes(32).toString('hex');setSess(token,{role,phone:role==='viewer'?phone:null,expires:Date.now()+12*60*60*1000});return send(res,303,'','text/plain; charset=utf-8',{'Set-Cookie':`tb_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`,'Location':'/'});
    }catch(e){return send(res,400,'Bad login request');}
  }
  if(req.method==='POST'&&url.pathname==='/register'){
    try{
      const body=new URLSearchParams(await readBody(req));const phone=normalizePhone(body.get('phone'));const password=body.get('password')||'';const confirm=body.get('confirmPassword')||'';
      if(!validPhone(phone))return json(res,400,{error:'সঠিক ফোন নম্বর দিন। বাংলাদেশি নম্বর 01XXXXXXXXX-ও চলবে।'});
      if(!/^\d{6}$/.test(password))return json(res,400,{error:'পাসওয়ার্ড ঠিক ৬টি সংখ্যা হতে হবে।'});
      if(password!==confirm)return json(res,400,{error:'দুটি পাসওয়ার্ড মিলছে না।'});
      if(users.some(u=>u.phone===phone))return json(res,409,{error:'এই ফোন নম্বর দিয়ে আগে থেকেই অ্যাকাউন্ট আছে। লগইন করুন।'});
      const salt=crypto.randomBytes(16).toString('hex');users.push({phone,salt,passwordHash:passwordHash(password,salt),createdAt:new Date().toISOString(),role:'viewer',phoneVerified:false});saveUsers();
      return json(res,200,{ok:true});
    }catch(e){return json(res,400,{error:'অ্যাকাউন্ট তৈরি করা যায়নি। আবার চেষ্টা করুন।'});}
  }
  if(req.method==='GET'&&url.pathname==='/logout'){const token=parseCookies(req).tb_session;if(token)delSess(token);return send(res,303,'','text/plain; charset=utf-8',{'Set-Cookie':'tb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0','Location':'/login'});}
  const role=roleOf(req);
  if(url.pathname.startsWith('/api/')){
    if(!role)return json(res,401,{error:'Please sign in first.'});
    if(url.pathname==='/api/accounts'&&req.method==='GET'){
      if(role!=='owner')return json(res,403,{error:'শুধু Owner অ্যাকাউন্টের তালিকা দেখতে পারবেন।'});
      const accounts=users.map(u=>({phone:u.phone,createdAt:u.createdAt||null,phoneVerified:!!u.phoneVerified,role:u.role||'viewer'})).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      return json(res,200,{accounts,total:accounts.length});
    }
    if(url.pathname==='/api/preferences'&&req.method==='GET'){
      const sessToken=parseCookies(req).tb_session; const sess=getSess(sessToken);
      let language='bn';
      if(role==='owner') language=config.ownerLanguage==='en'?'en':'bn';
      else { const u=users.find(x=>x.phone===sess?.phone); language=u?.language==='en'?'en':'bn'; }
      return json(res,200,{language});
    }
    if(url.pathname==='/api/preferences'&&req.method==='POST'){
      let body; try{body=JSON.parse(await readBody(req));}catch(_){return json(res,400,{error:'Invalid request.'});}
      const language=body.language==='en'?'en':'bn';
      if(role==='owner'){
        config.ownerLanguage=language;
        const tmp=CONFIG_FILE+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(config,null,2)); fs.renameSync(tmp,CONFIG_FILE);
      } else {
        const sessToken=parseCookies(req).tb_session; const sess=getSess(sessToken); const u=users.find(x=>x.phone===sess?.phone);
        if(!u)return json(res,401,{error:'Account not found.'}); u.language=language; saveUsers();
      }
      return json(res,200,{ok:true,language});
    }
    if(url.pathname==='/api/state'&&req.method==='GET')return json(res,200,{updated_at:state.updated_at,values:state.values,role},req.tbRenew?{'Set-Cookie':`tb_session=${req.tbRenew}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`}:{});
    if(url.pathname==='/api/state'&&req.method==='POST'){
      if(role!=='owner')return json(res,403,{error:'View-only access cannot change club data.'});
      const origin=req.headers.origin;
      if(origin){try{const o=new URL(origin);const host=req.headers.host;if(o.host!==host)return json(res,403,{error:'Origin check failed.'});}catch(_){return json(res,403,{error:'Invalid origin.'});}}
      try{const data=JSON.parse(await readBody(req));if(!ALLOWED.has(data.key)||typeof data.value!=='string')return json(res,400,{error:'Unsupported data key.'});if(data.value.length>15*1024*1024)return json(res,413,{error:'Value too large.'});state.values[data.key]=data.value;state.updated_at=Date.now();persist();return json(res,200,{ok:true,updated_at:state.updated_at,role});}catch(e){return json(res,400,{error:'Invalid request body.'});}
    }
    return json(res,404,{error:'Not found.'});
  }
  // Public, non-sensitive PWA assets. Keep these before the login gate so the
  // browser can fetch the manifest, service worker, and icons reliably.
  if(req.method==='GET' && url.pathname==='/manifest.webmanifest') {
    return send(res,200,fs.readFileSync(path.join(ROOT,'manifest.webmanifest')),'application/manifest+json; charset=utf-8',{'Cache-Control':'no-cache'});
  }
  if(req.method==='GET' && url.pathname==='/sw.js') {
    return send(res,200,fs.readFileSync(path.join(ROOT,'sw.js')),'application/javascript; charset=utf-8',{'Cache-Control':'no-cache','Service-Worker-Allowed':'/'});
  }
  if(req.method==='GET' && (url.pathname==='/icons/icon-192.png' || url.pathname==='/icons/icon-512.png')) {
    const iconPath=path.join(ROOT,url.pathname.slice(1));
    if(fs.existsSync(iconPath)) return send(res,200,fs.readFileSync(iconPath),'image/png',{'Cache-Control':'public, max-age=86400'});
    return send(res,404,'Not found');
  }
  if(!role)return send(res,200,loginPage(),'text/html; charset=utf-8');
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
    let html=fs.readFileSync(APP_FILE,'utf8');
    html=html.replace(/<title>.*?<\/title>/i,'<title>GTFC</title>');
    html=html.replace('</head>',`<script>window.TB_ROLE=${JSON.stringify(role)};</script></head>`);
    return send(res,200,html,'text/html; charset=utf-8',{'Content-Security-Policy':"default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});
  }
  return send(res,404,'Not found');
});
server.listen(PORT,'0.0.0.0',()=>{console.log(`Thunderbolts FC Manager running at http://localhost:${PORT}`);console.log('Keep this terminal open while members access the app.');});
