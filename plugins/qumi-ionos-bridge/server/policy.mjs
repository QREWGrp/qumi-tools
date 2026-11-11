import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {configDir} from './config.mjs';
const safeStart=/(?:^|_)(?:get|list|search|check|head|describe|fetch|query|inspect|lookup|status)_/i;
const riskWords=/(?:update|create|delete|remove|unassign|transfer|auth_code|restore|restart|reboot|stop|start|bind|firewall|privacy|configure|set_|install|uninstall|deploy|rotate|write|purchase|renew|invoice_resend)/i;
export function risk(tool){
 const name=String(tool.name||'');
 if(tool.annotations?.destructiveHint===true||riskWords.test(name))return 'change';
 if(tool.annotations?.readOnlyHint===true)return 'read';
 if(safeStart.test(name))return 'read';
 return 'change';
}
export function canonical(provider,toolName,args){return crypto.createHash('sha256').update(JSON.stringify({provider,tool:toolName,arguments:sortObj(args)})).digest('hex');}
function sortObj(obj){if(Array.isArray(obj))return obj.map(sortObj);if(obj&&typeof obj==='object')return Object.fromEntries(Object.keys(obj).sort().map(k=>[k,sortObj(obj[k])]));return obj;}
const authDir=()=>path.join(configDir(),'approvals');
export function approveRecord({provider,tool,args,ttlMinutes=10}){
 if(!['ionos','cloudflare'].includes(provider))throw Error('Unsupported provider');
 const id=crypto.randomUUID();const filename=path.join(authDir(),`${id}.json`);
 fs.mkdirSync(authDir(),{recursive:true,mode:0o700});
 const doc={id,provider,tool,digest:canonical(provider,tool,args),expires_at:Date.now()+Math.min(15,Math.max(1,ttlMinutes))*60000};
 fs.writeFileSync(filename,JSON.stringify(doc),{mode:0o600,flag:'wx'});return {id,expires_at:new Date(doc.expires_at).toISOString()};
}
export function consumeApproval(id,provider,tool,args){
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw Error('This mutation requires an out-of-band operator approval receipt');
 const filename=path.join(authDir(),`${id}.json`);
 let doc;try{doc=JSON.parse(fs.readFileSync(filename,'utf8'));}catch{throw Error('Approval missing or expired');}
 // Consumed before request, preventing replay even if the upstream call fails.
 fs.unlinkSync(filename);
 if(doc.id!==id||doc.provider!==provider||doc.tool!==tool||doc.expires_at<Date.now()||doc.digest!==canonical(provider,tool,args))throw Error('Approval scope, exact arguments or expiry did not match');
 return true;
}
