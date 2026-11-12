import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {activeCredential,checkRegistry} from './vault.mjs';
function invocation(){
 const explicit=process.env.QUMI_NPM_BIN;
 if(explicit){
  if(explicit.endsWith('.js'))return {binary:process.execPath,preargs:[explicit],label:explicit};
  if(process.platform==='win32'&&/\.(cmd|bat)$/i.test(explicit))throw Error('On Windows set QUMI_NPM_BIN to the installed npm-cli.js, not the cmd wrapper');
  return {binary:explicit,preargs:[],label:explicit};
 }
 if(process.platform==='win32'){
  const candidates=[process.env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),path.join(path.dirname(process.execPath),'..','node_modules','npm','bin','npm-cli.js')].filter(Boolean);
  const script=candidates.find(p=>p.endsWith('.js')&&fs.existsSync(p));
  if(!script)throw Error('npm CLI entrypoint not found. Install Node/npm from official Node version manager or set QUMI_NPM_BIN to absolute npm-cli.js');
  return {binary:process.execPath,preargs:[script],label:script};
 }
 return {binary:'npm',preargs:[],label:'npm'};
}
export function redact(text,secret=''){
 let s=String(text).replace(/(\/\/[^\s:=]+\/:_authToken\s*=\s*)[^\s]+/gi,'$1[REDACTED]').replace(/(Bearer\s+)\S+/gi,'$1[REDACTED]');
 if(secret)s=s.split(secret).join('[REDACTED]');
 return s.slice(0,64000);
}
export async function execNpm({command,args=[],cwd,timeoutMs=120000,authenticate=false}){
 let tempfile,dir;
 const cred=authenticate?activeCredential():null;
 if(authenticate&&!cred)throw Error('Registry authorization requested but no token is active. Use npm_credential_question to provision a session token or unlock an optional vault.');
 const env={...process.env,CI:'true',npm_config_update_notifier:'false',npm_config_audit:'false'};
 for(const name of ['NODE_OPTIONS','QUMI_NPM_TOKEN','QUMI_NPM_VAULT_PASSPHRASE','QUMI_NPM_AUTH_TOKEN'])delete env[name];
 const npm=invocation();
 if(cred){
  const registry=checkRegistry(cred.registry);const u=new URL(registry);
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-npm-'));
  const prefix=`//${u.host}${u.pathname.endsWith('/')?u.pathname:u.pathname+'/'}:_authToken`;
  // Placeholder only: token is held in process env and is never written to .npmrc.
  tempfile=path.join(dir,'npmrc');fs.writeFileSync(tempfile,`${prefix}=\${QUMI_NPM_AUTH_TOKEN}\nregistry=${registry}\nalways-auth=true\n`,{mode:0o600});
  env.NPM_CONFIG_USERCONFIG=tempfile;env.QUMI_NPM_AUTH_TOKEN=cred.token;
 }
 let chunks=[],errors=[],bytes=0;
 try{
  const child=spawn(npm.binary,[...npm.preargs,command,...args],{cwd,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let killed=false;
  const t=setTimeout(()=>{killed=true;child.kill('SIGTERM');},Math.min(300000,Math.max(1000,timeoutMs)));t.unref();
  const read=(stream,arr)=>stream.on('data',b=>{bytes+=b.length;if(bytes<=110000)arr.push(b);else {killed=true;child.kill('SIGTERM');}});
  read(child.stdout,chunks);read(child.stderr,errors);
  const outcome=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});clearTimeout(t);
  return {exit_code:outcome.code,terminated:killed,stdout:redact(Buffer.concat(chunks).toString('utf8'),cred?.token),stderr:redact(Buffer.concat(errors).toString('utf8'),cred?.token),npm_binary:npm.label};
 }finally{if(tempfile)try{fs.rmSync(dir,{recursive:true,force:true});}catch{}}
}
export async function detectNpm(){
 const cwd=os.tmpdir();
 const [npm,node]=await Promise.all([execNpm({command:'--version',args:[],cwd,timeoutMs:7000}),new Promise(resolve=>resolve(process.version))]);
 return {node_version:node,npm_version:npm.stdout.trim(),npm_binary:npm.npm_binary,platform:process.platform,architecture:process.arch};
}
export async function catalog(){
 const out=await execNpm({command:'--help',cwd:os.tmpdir(),timeoutMs:12000});
 const m=out.stdout.match(/All commands:\s*([\s\S]*?)\n\s*(?:Specify configs|More configuration|npm@|Configuration fields:)/i);
 const commands=(m?.[1]||'').split(',').map(s=>s.trim().split(/\s/)[0]).filter(s=>/^[a-z][a-z0-9-]*$/.test(s));
 return {installed_npm:out.stdout.match(/npm@([^\s]+)/)?.[1]||null,commands:[...new Set(commands)],count:new Set(commands).size,docs:'https://docs.npmjs.com/cli/v11/commands/',version_source:'local installed CLI; command set can differ from v11 docs'};
}
