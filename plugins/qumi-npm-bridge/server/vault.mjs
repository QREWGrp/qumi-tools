import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const sessions = new Map();
const base=()=>process.env.QUMI_NPM_CONFIG_DIR||path.join(os.homedir(),'.config','qumi-npm-bridge');
export const configDir=()=>base();
export const vaultFile=()=>path.join(base(),'npm.vault.json');
export function checkRegistry(raw='https://registry.npmjs.org/'){
 const u=new URL(raw); if(u.username||u.password||u.search||u.hash)throw Error('Registry URL must have no credentials, query or fragment');
 if(u.protocol!=='https:' && !(process.env.QUMI_NPM_ALLOW_LOCAL_HTTP==='1'&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Registry must use HTTPS');
 if(u.pathname.includes('..'))throw Error('Invalid registry path');
 return u.toString();
}
export function createRecord({registry,token,passphrase}){
 checkRegistry(registry); if(typeof token!=='string'||token.length<8)throw Error('Invalid registry token');
 if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Vault passphrase requires at least 12 characters');
 const salt=crypto.randomBytes(16),nonce=crypto.randomBytes(12),key=crypto.scryptSync(passphrase,salt,32,{maxmem:64*1024*1024});
 const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);const ciphertext=Buffer.concat([cipher.update(JSON.stringify({registry,token}),'utf8'),cipher.final()]);
 return {version:1,algorithm:'aes-256-gcm+scrypt',salt:salt.toString('base64'),nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function decryptRecord(record,passphrase){
 if(record?.version!==1||record.algorithm!=='aes-256-gcm+scrypt')throw Error('Invalid vault record');
 const key=crypto.scryptSync(passphrase,Buffer.from(record.salt,'base64'),32,{maxmem:64*1024*1024});
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.nonce,'base64'));
 decipher.setAuthTag(Buffer.from(record.tag,'base64'));const data=JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64')),decipher.final()]).toString('utf8'));
 checkRegistry(data.registry);if(!data.token||data.token.length<8)throw Error('Invalid credential');return data;
}
export function saveRecord(record){const dir=base();fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=vaultFile();const tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(tmp,JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);try{fs.chmodSync(file,0o600);}catch{}return file;}
export function sessionSet(registry,token){registry=checkRegistry(registry); if(!token||token.length<8)throw Error('Invalid token');sessions.set('npm',{registry,token,source:'session'});return {configured:true,retention:'session'};}
export function sessionUnlock(passphrase){if(!fs.existsSync(vaultFile()))throw Error('No saved encrypted vault');const credentials=decryptRecord(JSON.parse(fs.readFileSync(vaultFile(),'utf8')),passphrase);sessions.set('npm',{...credentials,source:'vault-unlocked'});return {configured:true,retention:'encrypted-vault-unlocked'};}
export function sessionClear({deleteVault=false}={}){sessions.delete('npm');if(deleteVault&&fs.existsSync(vaultFile()))fs.unlinkSync(vaultFile());return {session_cleared:true,vault_deleted:deleteVault};}
export function activeCredential(){if(sessions.has('npm'))return sessions.get('npm');if(process.env.QUMI_NPM_TOKEN){return {registry:checkRegistry(process.env.QUMI_NPM_REGISTRY||'https://registry.npmjs.org/'),token:process.env.QUMI_NPM_TOKEN,source:'injected'};}return null;}
export function status(){const c=activeCredential();return {node:process.version,platform:process.platform,session_configured:!!c,source:c?.source||'none',encrypted_vault_present:fs.existsSync(vaultFile()),vault_locked:fs.existsSync(vaultFile())&&c?.source!=='vault-unlocked',default_persistence:false,credential_value_exposed:false};}
export function receipt(record){return {schema:'qumi.npm.encrypted-record.v1',created_at:new Date().toISOString(),ciphertext_sha256:crypto.createHash('sha256').update(Buffer.from(record.ciphertext,'base64')).digest('hex'),note:'Fingerprint of encrypted record, never the raw token. Revoke exposed keys at issuer.'};}
