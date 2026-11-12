/** Cross-platform encrypted, operator-only vault and non-secret evidence receipts. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const CREDENTIALS=Object.freeze(['DEPOT_TOKEN','DEPOT_API_KEY','DEPOT_GIT_KEY']);
const cipher='aes-256-gcm';
const WORK_FACTOR={N:32768,r:8,p:1,maxmem:64*1024*1024};
export function vaultFile(){
 const configured=process.env.QUMI_PORTABLE_VAULT_FILE;
 if(configured){if(!path.isAbsolute(configured))throw Error('QUMI_PORTABLE_VAULT_FILE must be absolute');
  for(const repo of [process.env.QUMI_PROJECT_ROOT,process.env.QUMI_CHECKOUT_ROOT])if(repo&&path.isAbsolute(repo)){const project=path.resolve(repo),candidate=path.resolve(configured);if(candidate===project||candidate.startsWith(project+path.sep))throw Error('Credential vault cannot be stored inside a source repository');}
  return configured;}
 const d=process.platform==='win32'?(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local')):
  process.platform==='darwin'?path.join(os.homedir(),'Library','Application Support'):
  (process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'));
 return path.join(d,'qumi','depot-bridge','vault.aes256gcm.json');
}
export function seal(data,passphrase){
 if(typeof passphrase!=='string'||passphrase.length<14)throw Error('Vault passphrase must contain at least 14 characters');
 const payload={};for(const name of CREDENTIALS)if(data[name]){
   if(typeof data[name]!=='string'||data[name].length<10||data[name].length>8192||/[\r\n\0]/.test(data[name]))throw Error(`Invalid ${name} format`);
   payload[name]=data[name];
 }
 if(Object.keys(payload).length===0)throw Error('Vault must contain at least one credential');
 const salt=crypto.randomBytes(24),nonce=crypto.randomBytes(12);
 const key=crypto.scryptSync(passphrase,salt,32,WORK_FACTOR);
 const enc=crypto.createCipheriv(cipher,key,nonce);
 const ciphertext=Buffer.concat([enc.update(JSON.stringify(payload),'utf8'),enc.final()]);
 const tag=enc.getAuthTag();key.fill(0);
 return {schema:'qumi.depot.vault.v1',kdf:'scrypt',cipher,salt:salt.toString('base64'),nonce:nonce.toString('base64'),
  tag:tag.toString('base64'),ciphertext:ciphertext.toString('base64'),created_at:new Date().toISOString()};
}
export function unseal(record,passphrase){
 if(record?.schema!=='qumi.depot.vault.v1'||record?.cipher!==cipher||record?.kdf!=='scrypt')throw Error('Unrecognized encrypted credential vault');
 const salt=Buffer.from(record.salt,'base64'),nonce=Buffer.from(record.nonce,'base64'),tag=Buffer.from(record.tag,'base64'),ct=Buffer.from(record.ciphertext,'base64');
 if(salt.length!==24||nonce.length!==12||tag.length!==16||ct.length<10||ct.length>20000)throw Error('Malformed credential vault');
 const key=crypto.scryptSync(passphrase,salt,32,WORK_FACTOR);
 try{
  const dec=crypto.createDecipheriv(cipher,key,nonce);dec.setAuthTag(tag);
  const parsed=JSON.parse(Buffer.concat([dec.update(ct),dec.final()]).toString('utf8'));
  if(!parsed||typeof parsed!=='object'||Object.keys(parsed).some(k=>!CREDENTIALS.includes(k)))throw Error('Invalid vault content');
  return parsed;
 }finally{key.fill(0);}
}
export function readVault(){const file=vaultFile();return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;}
export function writeVault(record){
 const file=vaultFile(),dir=path.dirname(file);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const temp=path.join(dir,`.vault-${crypto.randomUUID()}.tmp`);
 try{fs.writeFileSync(temp,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file);if(process.platform!=='win32')fs.chmodSync(file,0o600);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return file;
}
export function nonSecretReceipt(record,{action='provision',changedKeys=[],previous=null,operator='local-operator'}={}){
 if(!['provision','rotate'].includes(action))throw Error('Invalid receipt action');
 const ciphertextHash=crypto.createHash('sha256').update(`${record.nonce}.${record.tag}.${record.ciphertext}`).digest('hex');
 const previousHash=previous?crypto.createHash('sha256').update(`${previous.nonce}.${previous.tag}.${previous.ciphertext}`).digest('hex'):null;
 return {schema:'qumi.depot.credential-receipt.v1',event_id:crypto.randomUUID(),recorded_at:new Date().toISOString(),
  action,operator,credential_types:changedKeys.filter(x=>CREDENTIALS.includes(x)),ciphertext_sha256:ciphertextHash,
  previous_ciphertext_sha256:previousHash,secret_material_committed:false,
  revocation_status:'operator_must_revoke_prior_provider_key',validation_status:'not_yet_verified',
  note:'This SHA-256 fingerprint covers encrypted ciphertext, never plaintext or a token-derived hash. The encrypted vault remains outside Git.'};
}
export function saveReceipt(receipt){
 const dir=path.join(path.dirname(vaultFile()),'receipts');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,`${receipt.event_id}.json`);
 fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 return file;
}
function git(...args){return execFileSync('git',args,{encoding:'utf8',timeout:15000,maxBuffer:64*1024});}
export function commitReceipt(receipt,{repoRoot,confirmed=false}={}){
 if(!confirmed)throw Error('Explicit operator confirmation is required to commit credential rotation evidence');
 if(!path.isAbsolute(repoRoot||''))throw Error('A verified absolute Git repository root is required');
 const root=fs.realpathSync(repoRoot);
 if(!fs.existsSync(path.join(root,'.git')))throw Error('Evidence target is not a Git checkout');
 const cp=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:64*1024}).trim();
 const repoTop=fs.realpathSync(cp(['rev-parse','--show-toplevel']));if(repoTop!==root)throw Error('Evidence destination must be the Git repository root');
 if(cp(['diff','--cached','--name-only']))throw Error('Pre-existing staged changes; refusing to include them in receipt commit');
 const relative=path.join('evidence','depot','credential-rotations',`${receipt.event_id}.json`);
 const target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
 if(fs.existsSync(target))throw Error('Receipt path already exists');
 fs.writeFileSync(target,JSON.stringify(receipt,null,2)+'\n',{mode:0o644,flag:'wx'});
 const pathArg=relative.split(path.sep).join('/');
 try{
  cp(['add','--',pathArg]);
  const staged=cp(['diff','--cached','--name-only']);
  if(staged!==pathArg)throw Error('Unexpected staged contents; refusing commit');
  cp(['commit','-m',`chore(evidence): record Depot credential ${receipt.action} ${receipt.event_id}`,'--',pathArg]);
  const sha=cp(['rev-parse','HEAD']);
  return {committed:true,sha,path:pathArg,ciphertext_sha256:receipt.ciphertext_sha256,secret_material_committed:false};
 }catch(e){try{cp(['reset','--',pathArg]);}catch{}throw e;}
}
export function portableVaultStatus(){const r=readVault();return {provider:'scrypt + AES-256-GCM',configured:!!r,
  keyNames:'never exposed until operator unlock',vault_location:vaultFile(),locked:!(r&&process.env.VAULT_PASSPHRASE),
  note:'Provision, rotate or unlock only through the encrypted URL-mode credential question or the operator-only local terminal. Plaintext secrets never pass through MCP arguments or chat.'};}
