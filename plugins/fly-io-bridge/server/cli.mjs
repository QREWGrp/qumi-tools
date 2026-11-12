import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createPlan,loadPlan,approved,consumeApproval,scrub} from './state.mjs';
import {temporaryToken} from './vault.mjs';

const allowedWords=/^[a-z0-9][a-z0-9-]{0,63}$/;
const badArgument=/(^|\s)(?:--access-token|--token|--password|--api-key|--secret|--private-key|--header|--env|--env-file)(?:=|\s|$)|(?:flyv1\s|ghp_|github_pat_|-----BEGIN PRIVATE KEY-----)/i;
const deniedCommands=new Set(['auth token','tokens create','tokens show','tokens list','auth docker','secrets set','secrets import','secrets export']);
const readCommands=new Set(['auth whoami','apps list','apps info','status','machine list','machine status','machines list','machines status','orgs list','logs','volumes list','volume list','certs list','certs show','ips list','releases','checks list','secrets list','scale show','config show','mpg list','mpg status','platform regions']);

function nameCandidates(projectDir){
 const exe=process.platform==='win32'?'fly.exe':'fly';
 const user=process.platform==='win32'?path.join(os.homedir(),'AppData','Local','QUMI','fly','bin',exe):path.join(os.homedir(),'.local','share','qumi','fly','bin',exe);
 const fromPath=(process.env.PATH||'').split(path.delimiter).filter(Boolean).flatMap(dir=>process.platform==='win32'?[path.join(dir,'fly.exe'),path.join(dir,'flyctl.exe')]:[path.join(dir,'fly'),path.join(dir,'flyctl')]);
 return [process.env.QUMI_FLY_CLI_PATH,path.join(projectDir,'.qumi-tools','fly','bin',exe),user,...fromPath].filter(Boolean);
}
export function findCli(projectDir=process.cwd()){
 for(const file of nameCandidates(projectDir)){
  try{if(fs.statSync(file).isFile())return file;}catch{}
 }
 return null;
}
function cleanWords(words){
 if(!Array.isArray(words)||words.length>8||words.some(x=>typeof x!=='string'||!allowedWords.test(x)))throw Error('Command must be 1–8 plain fly subcommand words');
 return words;
}
function cleanArgs(args){
 if(!Array.isArray(args)||args.length>32)throw Error('Use an array of at most 32 CLI arguments');
 for(const a of args){
  if(typeof a!=='string'||a.length>300||/[\r\n\0]/.test(a)||badArgument.test(a)||a.includes('://')&&a.includes('@'))throw Error('Unsafe or credential-bearing CLI argument; use a private terminal for secrets');
 }
 return args;
}
export function describeCommand(words,args=[]){
 words=cleanWords(words);args=cleanArgs(args);
 const signature=words.join(' ');
 if(deniedCommands.has(signature)||words[0]==='tokens'||words[0]==='auth'&&['token','docker'].includes(words[1])||words[0]==='secrets'&&['set','import','export'].includes(words[1]))throw Error('This command may expose secrets; use an operator-controlled terminal outside MCP');
 const risk=readCommands.has(signature)?'READ_ONLY':'MUTATION_OR_UNKNOWN';
 if(risk==='READ_ONLY'&&args.some(a=>/^-/.test(a)&&/(exec|delete|remove|force|token|secret|write|reset|replace|kill|destroy|config|password)/i.test(a)))throw Error('Read-only plan contains potentially mutating flag');
 return {command:words,args,risk};
}
export async function spawnBounded(binary,args,options={}){
 const timeoutMs=options.timeoutMs??20000,max=options.maxBytes??16000;
 return await new Promise((resolve,reject)=>{
  let output='',used=0,timedOut=false,finished=false;
  const env={...process.env,FLY_NO_UPDATE_CHECK:'1'};delete env.VAULT_PASSPHRASE;
  delete env.VAULT_PASSPHRASE;
  const secret=temporaryToken();
  if(secret)env.FLY_API_TOKEN=secret;
  const child=spawn(binary,args,{cwd:options.cwd||process.cwd(),env,shell:false,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);timer.unref();
  for(const pipe of [child.stdout,child.stderr])pipe.on('data',buf=>{used+=buf.length;if(output.length<max)output+=buf.toString('utf8').slice(0,Math.max(0,max-output.length));if(used>max*8)child.kill();});
  child.on('error',e=>{clearTimeout(timer);if(!finished){finished=true;reject(new Error('flyctl process could not start: '+scrub(e.message)));}});
  child.on('close',(code,signal)=>{clearTimeout(timer);if(finished)return;finished=true;resolve({exitCode:code,timedOut,signal,output:scrub(output).slice(0,max),truncated:used>max});});
 });
}
export async function help(words=[],cwd=process.cwd()){
 cleanWords(words);
 const executable=findCli(cwd);if(!executable)throw Error('flyctl not installed. Run fly_cli_install_plan, then get operator approval.');
 return {command:['fly',...words,'--help'],...await spawnBounded(executable,[...words,'--help'],{cwd,timeoutMs:15000})};
}
export async function version(){const executable=findCli();if(!executable)return {installed:false,installRequired:true};return {installed:true,executable, ...await spawnBounded(executable,['version'],{timeoutMs:10000})};}
export function planCli(args){
 const parsed=describeCommand(args.command||[],args.args||[]);
 const cwd=process.cwd();
 const plan=createPlan('cli',{...parsed,cwd,argv:['fly',...parsed.command,...parsed.args],summary:`fly ${[...parsed.command,...parsed.args].join(' ')}`});
 return {plan_id:plan.id,expires_at:plan.expiresAt,approved:approved(plan.id),risk:plan.risk,command:plan.argv,operator_command:`node bin/approve.mjs ${plan.id}`,execution_tool:'fly_cli_execute'};
}
export async function executeCli(args){
 const p=loadPlan(args.plan_id);if(p.type!=='cli')throw Error('Not a CLI plan');
 const parsed=describeCommand(p.command,p.args);
 if(parsed.risk!=='READ_ONLY')consumeApproval(p.id);
 if(!findCli(p.cwd))throw Error('flyctl not installed; install and retry');
 const result=await spawnBounded(findCli(p.cwd),[...parsed.command,...parsed.args],{cwd:p.cwd,timeoutMs:parsed.risk==='READ_ONLY'?25000:180000});
 return {plan_id:p.id,risk:parsed.risk,command:p.argv,authenticatedUsing:process.env.FLY_API_TOKEN||process.env.FLY_ACCESS_TOKEN?'environment token or CLI login':'Fly CLI cached login (if present)',...result,warning:result.timedOut?'Operation may still have changed remote resources; inspect state before retrying':undefined};
}
