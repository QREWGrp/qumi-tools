/** One-time operator credential question. Local-only on Windows/Linux/macOS.
 * Browser encrypts with RSA-OAEP/AES-256-GCM before localhost submission.
 * No secret is included in MCP requests, chat, URL or stdout.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import {createRecord,saveRecord,sessionSet,sessionUnlock,sessionClear,receipt,checkRegistry} from './vault.mjs';
const ACTIVE=new Map();
const escapeHTML=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAX=32768, TTL=5*60*1000;
function page({intent,publicKey,csrf,nonce}){
 const configure=intent==='configure',unlock=intent==='unlock';
 const inputs=configure?`<label for="registry">Registry HTTPS URL</label><input id="registry" name="registry" type="url" value="https://registry.npmjs.org/" required maxlength="2048" autocomplete="off" />
 <label for="token">npm registry access token</label><input id="token" name="token" type="password" autocomplete="new-password" required maxlength="8192" />
 <fieldset><legend>How long may the agent keep the key?</legend><label class="radio"><input type="radio" name="retention" value="session" checked/> Current agent session only (default, no saved vault)</label><label class="radio"><input type="radio" name="retention" value="vault"/> Store encrypted for future sessions (opt-in)</label></fieldset>
 <div id="vault-fields" hidden><label for="passphrase">New vault passphrase (12+ characters)</label><input type="password" id="passphrase" name="passphrase" autocomplete="new-password" minlength="12"/><label for="confirmation">Confirm passphrase</label><input type="password" id="confirmation" name="confirmation" autocomplete="new-password" minlength="12"/></div>`:unlock?`<label for="passphrase">Unlock your saved encrypted npm credential</label><input id="passphrase" name="passphrase" type="password" autocomplete="current-password" required />`:`<p>Delete the existing encrypted vault for this OS user and clear any session credentials?</p><label class="radio"><input id="confirm" type="checkbox" name="confirm" value="DELETE" required/> I understand this clears locally saved npm credentials.</label>`;
 const script=`const keyData=Uint8Array.from(atob(${JSON.stringify(Buffer.from(publicKey).toString('base64'))}),x=>x.charCodeAt(0));
 const rsa=await crypto.subtle.importKey('spki',keyData,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 const form=document.getElementById('form'); const feedback=document.getElementById('status');
 const vault=document.getElementById('vault-fields');
 if(vault){for(const radio of document.querySelectorAll('[name=retention]'))radio.addEventListener('change',()=>{const saved=document.querySelector('[name=retention]:checked').value==='vault';vault.hidden=!saved;for(const input of vault.querySelectorAll('input'))input.required=saved;});}
 form.addEventListener('submit',async event=>{event.preventDefault();const submit=form.querySelector('button[type=submit]');submit.disabled=true;feedback.textContent='Encrypting…';
 try{const body=Object.fromEntries(new FormData(form));const clear=new TextEncoder().encode(JSON.stringify(body));if(clear.length>16384)throw Error('Response exceeds limit');
 const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);const raw=await crypto.subtle.exportKey('raw',aes);const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,clear));const wrapped=new Uint8Array(await crypto.subtle.encrypt({name:'RSA-OAEP'},rsa,raw));
 const b64=b=>btoa(String.fromCharCode(...b));const res=await fetch('/submit',{method:'POST',headers:{'Content-Type':'application/json','X-QUMI-CSRF':${JSON.stringify(csrf)}},body:JSON.stringify({wrapped:b64(wrapped),iv:b64(iv),ciphertext:b64(ciphertext)})});
 const result=await res.json();if(!res.ok)throw Error(result.error||'Request refused');form.reset();form.hidden=true;feedback.textContent=result.message||'Credential configured. Return to your agent.';
 }catch(err){feedback.textContent='Unable to complete: '+err.message;submit.disabled=false;}});
 document.getElementById('cancel').onclick=async()=>{await fetch('/cancel',{method:'POST',headers:{'X-QUMI-CSRF':${JSON.stringify(csrf)}}});form.hidden=true;feedback.textContent='Cancelled';};`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QUMI NPM Bridge — secure question</title><style>body{font:16px system-ui,Arial,sans-serif;background:#f7f8fa;color:#172235;max-width:600px;margin:5vh auto;padding:0 16px}main{border:1px solid #dce1e9;border-radius:16px;padding:28px;background:#fff;box-shadow:0 8px 28px #1111110d}h1{font-size:24px}input:not([type=checkbox]):not([type=radio]){width:100%;box-sizing:border-box;padding:12px;margin:6px 0 8px;border:1px solid #a1a8b1;border-radius:8px;font:inherit}label{display:block;font-weight:600;margin-top:14px}.radio{display:block;font-weight:400;margin:11px 0}fieldset{border:1px solid #d4d9df;border-radius:9px;margin-top:16px}legend{font-weight:600}button{padding:11px 18px;border:0;border-radius:9px;background:#172c52;color:#fff;margin:20px 6px 0 0;cursor:pointer}#cancel{background:#e3e6ea;color:#111}small{color:#616b77}#status{min-height:28px;color:#295b42}</style></head><body><main><h1>QUMI NPM Bridge</h1><p>${escapeHTML(configure?'Authorize npm registry access for this agent?':unlock?'Unlock encrypted npm credential for this agent?':'Clear locally stored npm credentials?')}</p><small>This is a local, temporary operator question. Never paste API keys into chat. Browser encrypts responses before submission. Saving credentials is optional.</small><form id="form">${inputs}<button type="submit">${escapeHTML(configure?'Encrypt and authorize':unlock?'Unlock for this session':'Delete saved credential')}</button><button type="button" id="cancel">Cancel</button></form><p id="status" role="status"></p></main><script type="module" nonce="${nonce}">${script}</script></body></html>`;
}
export async function startSecureQuestion(intent='configure'){
 if(!['configure','unlock','clear_saved'].includes(intent))throw Error('Unsupported credential question');
 if(ACTIVE.has(intent))return {...ACTIVE.get(intent).meta,already_open:true};
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'der'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 const csrf=crypto.randomBytes(24).toString('hex'),nonce=crypto.randomBytes(16).toString('base64');let finished=false,server,timer;
 const fail=(res,code)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Request rejected; check your input or restart the secure question'}));};
 const close=()=>{clearTimeout(timer);ACTIVE.delete(intent);server.close();};
 server=http.createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${server.address()?.port}`)return fail(res,403);
  if(finished)return fail(res,410);
  if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${server.address().port}`)return fail(res,403);
  if(req.method==='GET'&&req.url==='/'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`});
   res.end(page({intent,publicKey,csrf,nonce}));return;
  }
  if(req.method==='POST'&&['/cancel','/submit'].includes(req.url)){
   if(req.headers['x-qumi-csrf']!==csrf)return fail(res,403);
   if(req.url==='/cancel'){finished=true;ACTIVE.delete(intent);res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');setTimeout(close,100).unref();return;}
   let n=0,data=[];try{
    for await(const b of req){n+=b.length;if(n>MAX)throw Error('Oversize');data.push(b);}
    const envelope=JSON.parse(Buffer.concat(data).toString('utf8'));
    const key=crypto.privateDecrypt({key:privateKey,oaepHash:'sha256'},Buffer.from(envelope.wrapped,'base64'));
    const iv=Buffer.from(envelope.iv,'base64'),encrypted=Buffer.from(envelope.ciphertext,'base64');
    if(key.length!==32||iv.length!==12||encrypted.length<17)throw Error('Invalid envelope');
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(encrypted.subarray(-16));
    const body=JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]).toString('utf8'));
    let message='Your credentials are authorized for this session.';
    if(intent==='configure'){
     if(typeof body.token!=='string'||body.token.length<8)throw Error('Invalid token');
     const registry=checkRegistry(body.registry);
     if(body.retention==='session'){sessionSet(registry,body.token);}
     else if(body.retention==='vault'){
      if(body.passphrase!==body.confirmation)throw Error('Passphrases do not match');
      const record=createRecord({registry,token:body.token,passphrase:body.passphrase});saveRecord(record);sessionSet(registry,body.token);
      // Receipt is only a return value, never written to Git automatically.
      receipt(record);message='Credential stored encrypted for future sessions and available now.';
     }else throw Error('Invalid retention choice');
    } else if(intent==='unlock'){sessionUnlock(body.passphrase);message='Encrypted vault unlocked for this agent session.';}
    else {if(body.confirm!=='DELETE')throw Error('Confirmation required');sessionClear({deleteVault:true});message='Local saved credential and session cleared.';}
    finished=true;ACTIVE.delete(intent);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({saved:true,message}));setTimeout(close,100).unref();
   }catch(e){fail(res,400);}return;
  }
  return fail(res,404);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const url=`http://127.0.0.1:${server.address().port}/`;
 const meta={mode:'url',url,question:intent==='configure'?'Provide an npm registry token securely for this agent? You may choose session-only (default) or opt in to encrypted local storage.':intent==='unlock'?'Unlock your saved encrypted npm token for this session?':'Clear the saved npm token for this user?',expires_in_seconds:300,answer_encrypted:true,default_retention:'session',operating_systems:['Windows','Linux','macOS'],note:'This localhost link works on the same computer as the MCP process. Cloud agents must use their platform secret manager or a separately deployed protected HTTPS credential portal.'};
 ACTIVE.set(intent,{meta,server});timer=setTimeout(close,TTL);timer.unref();server.unref();return meta;
}
