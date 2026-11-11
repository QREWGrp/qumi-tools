import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const vendor={ionos:['IONOS_MCP_URL','IONOS_PAT'],cloudflare:['QUMI_CLOUDFLARE_MCP_URL','QUMI_CLOUDFLARE_MCP_TOKEN']};
export const configDir=()=>process.env.QUMI_IONOS_CONFIG_DIR || path.join(os.homedir(),'.config','qumi-ionos-bridge');
export function configFile(provider){if(!(provider in vendor))throw Error('Unknown provider');return path.join(configDir(),`${provider}.vault.json`);}
function urlCheck(endpoint){
 const u=new URL(endpoint);
 if(u.username||u.password||u.hash)throw Error('Endpoint URLs must not contain credentials or fragments');
 if(u.protocol!=='https:'){
   if(!(process.env.NODE_ENV==='test'&&process.env.QUMI_IONOS_ALLOW_TEST_HTTP==='1'&&u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw Error('MCP endpoint must use HTTPS');
 }
 return u.toString();
}
export function encryptVault(provider,endpoint,token,passphrase){
 if(!vendor[provider])throw Error('Unknown provider');if(!token||token.length<8)throw Error('Missing credential');
 const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=crypto.scryptSync(passphrase,salt,32,{maxmem:64*1024*1024});
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const text=JSON.stringify({endpoint:urlCheck(endpoint),token});
 const ciphertext=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
 return {version:1,provider,algorithm:'aes-256-gcm+scrypt',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function decryptVault(record,passphrase){
 if(record.version!==1||record.algorithm!=='aes-256-gcm+scrypt'||!vendor[record.provider])throw Error('Invalid vault record');
 const key=crypto.scryptSync(passphrase,Buffer.from(record.salt,'base64'),32,{maxmem:64*1024*1024});
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));
 decipher.setAuthTag(Buffer.from(record.tag,'base64'));
 const content=JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64')),decipher.final()]).toString('utf8'));
 return {endpoint:urlCheck(content.endpoint),token:content.token};
}
export function receiptFor(record){return {schema:'qumi.ionos.credential-rotation.v1',provider:record.provider,created_at:new Date().toISOString(),ciphertext_commitment_sha256:crypto.createHash('sha256').update(record.ciphertext).digest('hex'),note:'Fingerprint of ciphertext, not token; issuer-side revocation still required.'};}
export function saveVault(record){const dir=configDir();fs.mkdirSync(dir,{recursive:true,mode:0o700});const filename=configFile(record.provider);fs.writeFileSync(filename,JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'w'});try{fs.chmodSync(filename,0o600);}catch{}return filename;}
export function getProviderConfig(provider){
 if(!vendor[provider])throw Error('Unknown provider');
 const [endpointKey,tokenKey]=vendor[provider];const envUrl=process.env[endpointKey],envToken=process.env[tokenKey];
 if(envUrl&&envToken)return {endpoint:urlCheck(envUrl),token:envToken,source:'injected'};
 const vaultPath=configFile(provider);
 if(fs.existsSync(vaultPath)){
  const unlock=process.env.QUMI_IONOS_VAULT_PASSPHRASE;
  if(!unlock)throw Error(`${provider} encrypted credential exists but the per-user vault passphrase is not available to the agent secret manager`);
  const data=decryptVault(JSON.parse(fs.readFileSync(vaultPath,'utf8')),unlock);
  return {...data,source:'encrypted-vault'};
 }
 throw Error(`${provider} credentials not configured; ask operator to run node bin/setup.mjs ${provider} privately`);
}
export function configStatus(){const result={};for(const provider of Object.keys(vendor)){
  const [u,t]=vendor[provider];result[provider]={configured:Boolean((process.env[u]&&process.env[t])||fs.existsSync(configFile(provider))),source:process.env[u]&&process.env[t]?'injected':fs.existsSync(configFile(provider))?'encrypted-vault':'none',vault_unlock_available:!!process.env.QUMI_IONOS_VAULT_PASSPHRASE};
 }return result;}
export function redact(err){let msg=String(err?.message||err).slice(0,750);for(const vars of Object.values(vendor))for(const k of vars.slice(1))if(process.env[k])msg=msg.split(process.env[k]).join('[REDACTED]');return msg;}
