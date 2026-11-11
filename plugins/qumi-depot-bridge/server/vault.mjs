import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run=promisify(execFile);
const types=new Set(['DEPOT_TOKEN','DEPOT_API_KEY','DEPOT_GIT_KEY']);
const cache=new Map();
const scripts=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../deploy');
// A digest is ONE WAY and cannot be decrypted; the Windows helper stores DPAPI ciphertext.
export function vaultDir(){
  const override=process.env.QUMI_DEPOT_VAULT_DIR;
  const dir=override || (process.platform==='win32' ? path.join(process.env.LOCALAPPDATA || os.homedir(),'QUMI','DepotVault') : '');
  if(!dir||!path.isAbsolute(dir))throw new Error('A Windows absolute vault directory is required');
  return dir;
}
export function secretStatus(){
  let dir;
  try{dir=vaultDir();}catch{return {provider:'Windows DPAPI CurrentUser',available:false,configured:!!(process.env.DEPOT_TOKEN||process.env.DEPOT_API_KEY),keys:{DEPOT_TOKEN:!!process.env.DEPOT_TOKEN,DEPOT_API_KEY:!!process.env.DEPOT_API_KEY,DEPOT_GIT_KEY:!!process.env.DEPOT_GIT_KEY},requiredAction:'Configure vault on Windows VHost'}};
  const keys={};for(const name of types)keys[name]=fs.existsSync(path.join(dir,`${name}.dpapi`))||!!process.env[name];
  return {provider:'Windows DPAPI CurrentUser',available:process.platform==='win32',keys,canLaunchLocalDialog:process.platform==='win32',configured:keys.DEPOT_TOKEN||keys.DEPOT_API_KEY,notes:'No secret values are exposed through MCP; provision as the same Windows identity that runs the bridge.'};
}
export async function getSecret(name){
  if(!types.has(name))throw new Error('Unknown secret name');
  if(process.env[name])return process.env[name];
  if(process.platform!=='win32')return '';
  const file=path.join(vaultDir(),`${name}.dpapi`);
  if(!fs.existsSync(file))return '';
  // Cache only inside the process; never return through MCP or write to evidence.
  if(cache.has(name))return cache.get(name);
  const script=path.join(scripts,'unseal-secret.ps1');
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-SecretName',name,'-VaultDirectory',vaultDir()],{windowsHide:true,timeout:12000,maxBuffer:8192});
  const value=stdout.replace(/\r?\n$/, '');
  if(!value)throw new Error('Empty DPAPI secret');
  cache.set(name,value);
  return value;
}
export function sensitiveValues(){return [...cache.values(), ...['DEPOT_TOKEN','DEPOT_API_KEY','DEPOT_GIT_KEY','QUMI_MCP_BEARER_TOKEN'].map(k=>process.env[k])].filter(v=>v&&v.length>=6);}
export function redact(value){let result=String(value);for(const token of sensitiveValues())result=result.split(token).join('[REDACTED]');return result;}
export async function launchSecretSetup({remote=false}={}){
  if(remote)throw new Error('Remote MCP callers cannot launch or populate credential dialogs. Ask the VHost operator to run the local setup.');
  if(process.platform!=='win32')throw new Error('Credential dialog is available only on an interactive Windows VHost');
  if(process.env.QUMI_ALLOW_LOCAL_SECRET_DIALOG!=='1')throw new Error('Set QUMI_ALLOW_LOCAL_SECRET_DIALOG=1 on an approved interactive Windows session');
  const script=path.join(scripts,'setup-secrets.ps1');
  const child=spawn('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',script,'-VaultDirectory',vaultDir()],{detached:true,windowsHide:false,stdio:'ignore'});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  child.unref();
  return {launched:true,channel:'local Windows desktop',storedAs:'per-user Windows DPAPI ciphertext',nextStep:'Complete the masked dialog locally, then restart the bridge service using that same Windows identity. Never submit secrets via MCP.'};
}
