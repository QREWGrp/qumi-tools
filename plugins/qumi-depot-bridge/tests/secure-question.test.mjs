import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {startSecureQuestion} from '../server/secure-question.mjs';

const b64=b=>Buffer.from(b).toString('base64');
test('cross-platform encrypted answer never travels through MCP arguments',async()=>{
 let stored=null;
 const question=await startSecureQuestion({bridge:'QUMI Test',credential:'TEST_TOKEN',description:'Secure credentials',
  fields:[{name:'token',label:'Token',secret:true},{name:'passphrase',label:'Passphrase',secret:true}],
  save:async body=>{stored=body;return {saved:true}}});
 assert.equal(question.mode,'url');assert.match(question.url,/^http:\/\/127\.0\.0\.1:\d+\/$/);
 assert.equal(JSON.stringify(question).includes('SECRET_VALUE'),false);
 const r=await fetch(question.url);assert.equal(r.status,200);
 const html=await r.text();assert.match(html,/Encrypt and save/);
 const authCheck=await fetch(question.url+'submit',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.example','X-QUMI-CSRF':'invalid'},body:'{}'});
 assert.equal(authCheck.status,403);
 const pub=html.match(/const keyData=Uint8Array.from\(atob\("([^"]+)"\)/)?.[1];
 const csrf=html.match(/'X-QUMI-CSRF':"([0-9a-f]+)"/)?.[1];
 assert(pub&&csrf);
 const rsa=await webcrypto.subtle.importKey('spki',Buffer.from(pub,'base64'),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 const aes=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
 const iv=webcrypto.getRandomValues(new Uint8Array(12));
 const message={token:'SECRET_VALUE_FAKE_DO_NOT_USE',passphrase:'LONG_FAKE_LOCAL_PASSPHRASE'};
 const encrypted=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},aes,Buffer.from(JSON.stringify(message)));
 const raw=await webcrypto.subtle.exportKey('raw',aes);
 const wrapped=await webcrypto.subtle.encrypt({name:'RSA-OAEP'},rsa,raw);
 const post=await fetch(question.url+'submit',{method:'POST',headers:{'Content-Type':'application/json','X-QUMI-CSRF':csrf,'Origin':new URL(question.url).origin},body:JSON.stringify({wrapped:b64(wrapped),iv:b64(iv),ciphertext:b64(encrypted)})});
 assert.equal(post.status,200);assert.deepEqual(stored,message);
 assert.equal((await post.text()).includes(message.token),false);
});
