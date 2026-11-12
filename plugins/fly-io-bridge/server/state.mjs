import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export function stateDir(){
  const root=process.env.QUMI_FLY_STATE_DIR || (process.platform==='win32'
    ? path.join(process.env.LOCALAPPDATA||os.homedir(),'QUMI','FlyBridge')
    : path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local','state'),'qumi-fly-bridge'));
  if(!path.isAbsolute(root))throw Error('QUMI_FLY_STATE_DIR must be absolute');
  return root;
}
export function ensurePrivateDir(dir){fs.mkdirSync(dir,{recursive:true,mode:0o700});if(process.platform!=='win32')fs.chmodSync(dir,0o700);return dir;}
export function planPath(id,kind='plan'){
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid plan identifier');
  return path.join(ensurePrivateDir(path.join(stateDir(),kind==='plan'?'plans':'approvals')),`${id}.json`);
}
export function savePrivate(file,data){
  ensurePrivateDir(path.dirname(file));
  const tmp=file+'.'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,file);
  if(process.platform!=='win32')fs.chmodSync(file,0o600);
}
export function loadJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
export function createPlan(type,payload){
  const id=crypto.randomUUID(), createdAt=new Date().toISOString();
  const plan={id,type,createdAt,expiresAt:new Date(Date.now()+15*60*1000).toISOString(),...payload};
  savePrivate(planPath(id),plan);return plan;
}
export function loadPlan(id){
  const p=loadJson(planPath(id));
  if(p.id!==id||Date.now()>Date.parse(p.expiresAt))throw Error('Plan expired or invalid; create a new plan');
  return p;
}
export function approved(id){
  try{const t=loadJson(planPath(id,'approval'));return t.planId===id&&Date.now()<Date.parse(t.expiresAt);}catch{return false;}
}
export function consumeApproval(id){
  const file=planPath(id,'approval'),consumed=file+'.consumed.'+crypto.randomUUID();
  try{fs.renameSync(file,consumed);}catch{throw Error('One-time operator approval required; run bin/approve.mjs locally');}
  try{const t=loadJson(consumed);if(t.planId!==id||Date.now()>Date.parse(t.expiresAt))throw Error('Approval expired or invalid');}
  finally{fs.rmSync(consumed,{force:true});}
}
export function scrub(s){
 let txt=String(s);
 for(const key of ['FLY_API_TOKEN','FLY_ACCESS_TOKEN','VAULT_PASSPHRASE']){
  const v=process.env[key];if(v&&v.length>3)txt=txt.split(v).join('[REDACTED]');
 }
 return txt.replace(/(FlyV1\s+fm\d+[A-Za-z0-9_\-]{8,})/gi,'[REDACTED_FLY_TOKEN]')
 .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi,'$1[REDACTED]')
 .replace(/(flyv1\s+)[A-Za-z0-9_\-]+/gi,'$1[REDACTED]');
}
