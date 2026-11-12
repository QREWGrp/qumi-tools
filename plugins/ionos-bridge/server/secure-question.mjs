/** Cross-platform encrypted credential question portal.
 * No dependencies; Node.js 20+, Windows/macOS/Linux. This is a loopback-only,
 * single-use browser interaction. MCP URL elicitation should display this URL
 * when the client supports URL-mode; other clients display the safe link.
 * API keys are never present in MCP arguments, URLs, stdout, or tool results.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const active=new Map();
const MAX_BYTES=32_768;
const TTL_MS=5*60*1000;
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const b64=s=>Buffer.from(s).toString('base64');
function renderPage({title,description,fields,publicDer,csrf}){
 const hasVaultPassphrase=fields.some(f=>f.name==='passphrase');
 const sourceChoice=hasVaultPassphrase?`<fieldset class="vault-choice"><legend>Where will you keep your VAULT_PASSPHRASE?</legend><label><input type="radio" name="vault_destination" value="saved_passwords" checked> Saved Passwords (browser or OS password manager)</label><small>The agent cannot silently read your password manager. On each unlock, you approve autofill or enter the passphrase again. Temporary localhost origins may need manual saving.</small><label><input type="radio" name="vault_destination" value="cloud_personal_vault"> Cloud Personal Vault variable</label><small>In the current agent's private secrets settings add <code>VAULT_PASSPHRASE</code>, then restart the agent/MCP runtime. This page cannot write to a cloud vault without a verified integration.</small></fieldset>`:'';
 const fieldMarkup=fields.map(f=>`<label for="${esc(f.name)}">${esc(f.label)}</label><input id="${esc(f.name)}" name="${esc(f.name)}" type="${f.secret?'password':f.type==='url'?'url':'text'}" ${f.secret?(f.name==='passphrase'&&fields.length===1?'autocomplete="current-password"':'autocomplete="new-password"'):'autocomplete="off"'} required maxlength="${f.max||8192}" placeholder="${esc(f.placeholder||'')}" />`).join('\n');
 const client=`const keyData=Uint8Array.from(atob(${JSON.stringify(b64(publicDer))}),c=>c.charCodeAt(0));
 const pub=await crypto.subtle.importKey('spki',keyData,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 const form=document.querySelector('form');const feedback=document.querySelector('#status');
 form.addEventListener('submit',async(ev)=>{ev.preventDefault();form.querySelector('button').disabled=true;feedback.textContent='Encrypting and saving locally…';
  try{const body=Object.fromEntries(new FormData(form).entries());const bytes=new TextEncoder().encode(JSON.stringify(body));if(bytes.length>16384)throw Error('Credential response too long');
   const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);const raw=await crypto.subtle.exportKey('raw',aes);const iv=crypto.getRandomValues(new Uint8Array(12));
   const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,bytes));const wrapped=new Uint8Array(await crypto.subtle.encrypt({name:'RSA-OAEP'},pub,raw));
   const encode=buf=>btoa(String.fromCharCode(...buf));const response=await fetch('/submit',{method:'POST',headers:{'Content-Type':'application/json','X-QUMI-CSRF':${JSON.stringify(csrf)}},body:JSON.stringify({wrapped:encode(wrapped),iv:encode(iv),ciphertext:encode(ciphertext)})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save');
   form.reset();form.hidden=true;feedback.textContent='Saved encrypted credential. Return to your agent and retry the connection.';
  }catch(error){feedback.textContent='Setup failed: '+error.message;form.querySelector('button').disabled=false;}
 });
 document.querySelector('#cancel').onclick=async()=>{await fetch('/cancel',{method:'POST',headers:{'X-QUMI-CSRF':${JSON.stringify(csrf)}}});form.reset();form.hidden=true;feedback.textContent='Cancelled';};`;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)} — secure question</title><style>body{font:16px system-ui,sans-serif;max-width:560px;margin:6vh auto;padding:0 20px;color:#172234;background:#f7f8fa}main{padding:28px;background:white;border:1px solid #ddd;border-radius:16px}label{display:block;font-weight:600;margin:16px 0 6px}fieldset.vault-choice{border:1px solid #dce2ea;border-radius:10px;padding:12px;margin-top:20px}fieldset.vault-choice label{font-weight:500;margin:10px 0}fieldset.vault-choice input{width:auto;vertical-align:middle}fieldset.vault-choice small{display:block;margin-left:22px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #999;border-radius:8px;font:inherit}button{border-radius:9px;padding:12px 18px;margin:20px 8px 0 0;background:#14243d;color:white;border:0;cursor:pointer}#cancel{background:#e5e7eb;color:#111}#status{min-height:24px}small{color:#586174}</style></head><body><main><h2>${esc(title)}</h2><p>${esc(description)}</p><small>Only this device can access this temporary localhost form. Credentials are encrypted in your browser before submission; nothing is sent through chat. They are encrypted again at rest, outside Git.</small><form>${fieldMarkup}${sourceChoice}<button type="submit">Encrypt and save</button><button type="button" id="cancel">Cancel</button></form><p id="status" role="status"></p></main><script type="module">${client}</script></body></html>`;
}
function safeLabel(name){return /^[A-Z0-9_]{2,80}$/.test(name);}
export async function startSecureQuestion({bridge,credential,description,fields,save}){
 if(typeof bridge!=='string'||!safeLabel(credential)||typeof save!=='function')throw Error('Invalid secure question request');
 if(!Array.isArray(fields)||fields.length<1||fields.length>6||fields.some(f=>!/^[a-z][a-z0-9_]{0,30}$/.test(f.name)))throw Error('Invalid form');
 const id=`${bridge}:${credential}`;
 if(active.has(id)){const old=active.get(id);return {...old.meta,existing:true};}
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'der'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 const csrf=crypto.randomBytes(24).toString('hex');let used=false;let closeTimer;
 let server;
 const fail=(res,status,msg)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:msg}));};
 const close=()=>{active.delete(id);clearTimeout(closeTimer);server.close();};
 server=http.createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${server.address().port}`)return fail(res,403,'Invalid host');
  if(used)return fail(res,410,'Credential question expired');
  const origin=req.headers.origin;
  if(origin && origin!==`http://127.0.0.1:${server.address().port}`)return fail(res,403,'Origin denied');
  if(req.method==='GET'&&req.url==='/'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
   return res.end(renderPage({title:`${bridge} — ${credential}`,description,fields,publicDer:publicKey,csrf}));
  }
  if(req.method==='POST'&&['/submit','/cancel'].includes(req.url)){
   if(req.headers['x-qumi-csrf']!==csrf)return fail(res,403,'Invalid request token');
   if(req.url==='/cancel'){used=true;res.writeHead(200,{'Cache-Control':'no-store'});res.end('{}');setTimeout(close,300).unref();return;}
   let bytes=0,chunks=[];
   try{
    for await(const c of req){bytes+=c.length;if(bytes>MAX_BYTES)throw Error('Payload too large');chunks.push(c);}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    for(const prop of ['wrapped','iv','ciphertext'])if(typeof data[prop]!=='string'||data[prop].length>24000)throw Error('Invalid encrypted data');
    const key=crypto.privateDecrypt({key:privateKey,oaepHash:'sha256'},Buffer.from(data.wrapped,'base64'));
    const iv=Buffer.from(data.iv,'base64'),encrypted=Buffer.from(data.ciphertext,'base64');
    if(key.length!==32||iv.length!==12||encrypted.length<17)throw Error('Invalid envelope');
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAuthTag(encrypted.subarray(-16));
    const clear=JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]).toString('utf8'));
    for(const f of fields)if(typeof clear[f.name]!=='string'||clear[f.name].length<1||clear[f.name].length>(f.max||8192))throw Error('Missing or oversized field');
    const safeResult=await save(clear);
    // Callback MUST only return non-secret metadata; never send to the browser or MCP caller.
    if(safeResult?.secret||safeResult?.token||safeResult?.passphrase)throw Error('Unsafe response from credential handler');
    used=true;res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({saved:true}));setTimeout(close,300).unref();
   }catch(error){fail(res,400,'Credential could not be saved; check inputs and try again');}
   return;
  }
  return fail(res,404,'Not found');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const url=`http://127.0.0.1:${server.address().port}/`;
 const meta={question:`Authorize ${credential} for ${bridge}?`,mode:'url',url,expires_in_seconds:300,answer_encrypted:true,scope:'current agent OS user',remote_warning:'This link works only on the same machine as the MCP process; remote agents need a user-approved HTTPS credential portal.'};
 active.set(id,{meta});closeTimer=setTimeout(close,TTL_MS);closeTimer.unref();server.unref();
 return meta;
}
