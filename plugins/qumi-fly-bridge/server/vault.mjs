import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {stateDir,savePrivate,loadJson} from './state.mjs';

const file=()=>path.join(stateDir(),'fly-token.vault.json');
export function vaultStatus(){return {encryptedVaultPresent:fs.existsSync(file()),envFlyApiTokenPresent:!!process.env.FLY_API_TOKEN,envFlyAccessTokenPresent:!!process.env.FLY_ACCESS_TOKEN,masterPassphraseInjected:!!process.env.QUMI_FLY_VAULT_PASSPHRASE};}
export function encryptToken(secret,passphrase){
 if(typeof secret!=='string'||secret.trim().length<12)throw Error('Invalid token');
 if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Use a vault passphrase of at least 12 characters');
 const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12);
 const key=crypto.scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const data=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
 return {version:1,algorithm:'aes-256-gcm',kdf:'scrypt-N32768-r8-p1',salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:data.toString('base64'),tag:cipher.getAuthTag().toString('base64'),createdAt:new Date().toISOString()};
}
export function decryptToken(record,passphrase){
 if(record?.version!==1||record?.algorithm!=='aes-256-gcm')throw Error('Invalid encrypted vault format');
 const key=crypto.scryptSync(passphrase,Buffer.from(record.salt,'base64'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 const dec=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));dec.setAuthTag(Buffer.from(record.tag,'base64'));
 return Buffer.concat([dec.update(Buffer.from(record.ciphertext,'base64')),dec.final()]).toString('utf8');
}
export function saveVault(secret,passphrase){
 const encrypted=encryptToken(secret,passphrase);
 const eventId=crypto.randomUUID();
 const receipt={schema:'qumi.fly.credential-rotation.v1',eventId,credential:'FLY_API_TOKEN',createdAt:encrypted.createdAt,encryptedRecordSHA256:crypto.createHash('sha256').update(encrypted.ciphertext).digest('hex'),note:'Fingerprint of random AES ciphertext; not the raw token or vault passphrase'};
 savePrivate(file(),encrypted);
 const receiptFile=path.join(stateDir(),'receipts',eventId+'.json');
 savePrivate(receiptFile,receipt);
 return {stored:true,encrypted:true,location:file(),createdAt:encrypted.createdAt,receipt,receiptFile};
}
export function removeVault(){if(fs.existsSync(file()))fs.unlinkSync(file());return {removed:true};}
export function temporaryToken(){
 if(process.env.FLY_API_TOKEN)return process.env.FLY_API_TOKEN;
 if(process.env.FLY_ACCESS_TOKEN)return process.env.FLY_ACCESS_TOKEN;
 const phrase=process.env.QUMI_FLY_VAULT_PASSPHRASE;
 if(phrase&&fs.existsSync(file()))return decryptToken(loadJson(file()),phrase);
 return null;
}
