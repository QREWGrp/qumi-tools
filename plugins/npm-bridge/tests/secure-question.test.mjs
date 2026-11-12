import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-npm-ui-'));
process.env.QUMI_NPM_CONFIG_DIR=dir;
const {startSecureQuestion}=await import('../server/secure-question.mjs');
const {vaultFile,status,sessionClear,sessionUnlock}=await import('../server/vault.mjs');
const b64=x=>Buffer.from(x).toString('base64');
async function respond(q,values){
 const response=await fetch(q.url);assert.equal(response.status,200);
 const html=await response.text();if(values.confirm!=='DELETE')assert.match(html,/type="password"/);if(values.retention)assert.match(html,/session only/);
 const pub=html.match(/const keyData=Uint8Array.from\(atob\("([^"]+)"\)/)?.[1];
 const csrf=html.match(/'X-QUMI-CSRF':"([0-9a-f]+)"/)?.[1];
 assert(pub&&csrf,'HTML has browser key and CSRF');
 const rsa=await webcrypto.subtle.importKey('spki',Buffer.from(pub,'base64'),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 const aes=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
 const raw=await webcrypto.subtle.exportKey('raw',aes);const iv=webcrypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode(JSON.stringify(values)));
 const wrapped=await webcrypto.subtle.encrypt({name:'RSA-OAEP'},rsa,raw);
 const envelope=JSON.stringify({wrapped:b64(wrapped),iv:b64(iv),ciphertext:b64(ciphertext)});
 assert(!envelope.includes(values.token??'FAKE_SECRET_DO_NOT_LEAK'),'No token plaintext in wire payload');
 const cross=await fetch(q.url+'submit',{method:'POST',headers:{'Origin':'https://evil.example','Content-Type':'application/json','X-QUMI-CSRF':csrf},body:envelope});assert.equal(cross.status,403);
 const result=await fetch(q.url+'submit',{method:'POST',headers:{'Origin':new URL(q.url).origin,'Content-Type':'application/json','X-QUMI-CSRF':csrf},body:envelope});
 assert.equal(result.status,200);return {result:await result.text(),html};
}
test('session-only secret question encrypts but DOES NOT store vault',async()=>{
 const fake='FAKE_NPM_SECRET_DO_NOT_USE_1';const question=await startSecureQuestion('configure');
 assert.equal(question.mode,'url');assert.equal(question.default_retention,'session');
 const data=await respond(question,{registry:'https://registry.npmjs.org/',token:fake,retention:'session'});
 assert(!data.result.includes(fake));assert.equal(status().source,'session');assert.equal(fs.existsSync(vaultFile()),false);
 sessionClear();
});
test('explicit opt-in creates encrypted vault; unlock requires passphrase',async()=>{
 const secret='FAKE_NPM_SECRET_DO_NOT_USE_2',passphrase='long fake test-only passphrase';const q=await startSecureQuestion('configure');
 await respond(q,{registry:'https://registry.npmjs.org/',token:secret,retention:'vault',passphrase,confirmation:passphrase});
 assert(fs.existsSync(vaultFile()));assert(!fs.readFileSync(vaultFile(),'utf8').includes(secret));sessionClear();
 assert.equal(status().vault_locked,true);
 const unlock=await startSecureQuestion('unlock');await respond(unlock,{passphrase});assert.equal(status().source,'vault-unlocked');
 const clear=await startSecureQuestion('clear_saved');await respond(clear,{confirm:'DELETE'});assert.equal(fs.existsSync(vaultFile()),false);
});
