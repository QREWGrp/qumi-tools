import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {redact} from './vault.mjs';
const run=promisify(execFile);
const CLI_DOCS={
  platform:'https://depot.dev/docs/cli/reference/overview',
  containers:'https://depot.dev/docs/cli/reference/container-builds',
  ci:'https://depot.dev/docs/cli/reference/depot-ci',
  agents:'https://depot.dev/docs/cli/reference/agents',
  gha:'https://depot.dev/docs/cli/reference/github-actions',
  registry:'https://depot.dev/docs/cli/reference/registry',
  compute:'https://depot.dev/docs/cli/reference/compute',
  sdk:'https://depot.dev/docs/api/sdk-reference'
};
// Intentional read-only allowlist. The installed binary remains the authoritative source
// for commands and flags; all other operations require an explicit host-side policy.
const READ_ONLY=new Set(['org list','org show','org credits','list builds','list projects','projects list','projects get','tests','tests analytics','ci list','ci logs','ci runs list','ci workflows list','ci runs get','ci runs logs','ci status','gha list','gha jobs list','registry list','registry ls','registry repository list','registry image list','registry image inspect','registry token list','registry retention get','registry upstream list','jobs','cache ls','compute list']);
const NEVER_EXPOSE=new Set(['login token','pull-token','auth token','token','login','logout']);
const blockedFlags=new Set(['--token','--password','--api-key','--secret','--command','--candidates-command','--exec','--shell','--script','--private-key']);
const safeReadFlags=new Set(['--project','--project-id','--output','--limit','--page-size','--page-token','--org','--repo','--ci','--gha','--status','--job','--workflow','--help','--verbose']);
const allowedOutput=new Set(['json','csv','table','auto']);
function validateWord(x,max=200){if(typeof x!=='string'||!x||x.length>max||/[\x00-\x1f]/.test(x))throw new Error('Invalid CLI word');return x;}
function words(command){if(!Array.isArray(command)||command.length<1||command.length>8)throw new Error('Command must be 1-8 CLI subcommand words');return command.map(x=>{validateWord(x,40);if(!/^[a-z][a-z0-9-]*$/.test(x))throw new Error('Invalid command word');return x;});}
function validateArgs(args,readOnly,pid,org){
 if(!Array.isArray(args)||args.length>32)throw new Error('Arguments must be an array of up to 32 strings');
 const vals=args.map(a=>validateWord(a,240));
 for(let i=0;i<vals.length;i++){
   const arg=vals[i];
   if((readOnly && ['run','report','split','login','configure','delete','reset','create','push','build','pull'].includes(arg.toLowerCase())) || arg==='--'||arg.startsWith('@')||arg.startsWith('-c=')||arg==='-c'||arg==='-p')throw new Error('Unsafe CLI argument');
   if(/(\$\{|%[a-z_]+%)/i.test(arg))throw new Error('Variable substitution in arguments is forbidden');
   const flag=arg.split('=')[0].toLowerCase();
   if(blockedFlags.has(flag)||flag.startsWith('--token')||flag.includes('credential'))throw new Error('Credential/command flags are not agent-callable');
   if(readOnly && flag.startsWith('-') && !safeReadFlags.has(flag))throw new Error('Flag not in read-only policy');
   if(['--project','--project-id'].includes(flag)){
      const actual=arg.includes('=')?arg.slice(arg.indexOf('=')+1):vals[++i];
      if(!actual||actual!==pid)throw new Error('CLI project override not permitted');
   }
   if(flag==='--org' && org){const actual=arg.includes('=')?arg.slice(arg.indexOf('=')+1):vals[++i];if(actual!==org)throw new Error('CLI organization override not permitted');}
   if(flag==='--repo'){const actual=arg.includes('=')?arg.split('=').slice(1).join('='):vals[++i];const allowed=(process.env.QUMI_GIT_APPROVED_REPO||'QREWGrp/qumi-suite').toLowerCase();if((actual||'').toLowerCase()!==allowed)throw new Error('Repository override not permitted');}
   if(flag==='--output'){const actual=arg.includes('=')?arg.split('=').slice(1).join('='):vals[++i];if(!allowedOutput.has(actual))throw new Error('Invalid output format');}
 }
 return vals;
}
function cliPolicy(command){
 const cmd=words(command).join(' ');
 if(NEVER_EXPOSE.has(cmd)||cmd.startsWith('login ')||cmd.startsWith('pull-token'))throw new Error('Credential-returning/interactive CLI operation is forbidden');
 const operatorReads=(process.env.QUMI_DEPOT_CLI_EXTRA_READ_PATHS||'').split(';').map(x=>x.trim()).filter(Boolean);
 const readOnly=READ_ONLY.has(cmd)||operatorReads.includes(cmd);
 if(!readOnly){
   if(process.env.QUMI_DEPOT_CLI_MUTATIONS!=='1')throw new Error('CLI mutation policy is disabled on this host');
   const allowed=(process.env.QUMI_DEPOT_CLI_APPROVED_PATHS||'').split(';').map(x=>x.trim()).filter(Boolean);
   if(!allowed.includes(cmd))throw new Error('CLI command not explicitly approved by host policy');
 }
 return {cmd,readOnly};
}
function identity(){return process.env.QUMI_AGENT_ID||'mcp-client';}
function evidenceDir(){const root=process.env.QUMI_DEPOT_EVIDENCE_DIR;if(!root||!path.isAbsolute(root))throw new Error('Set absolute QUMI_DEPOT_EVIDENCE_DIR for CLI receipts');fs.mkdirSync(root,{recursive:true});return root;}
function emitReceipt(job){const dir=evidenceDir();const file=path.join(dir,`${job.id}.json`);fs.writeFileSync(file,JSON.stringify(job,null,2),{flag:'wx',mode:0o600});return {file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};}
export function catalog(){return {
   version:'0.4.0',mode:'dynamic installed CLI --help + guarded command runner',
   sdkTools:['list_projects','list_builds','get_build','get_build_steps','get_build_step_logs'],
   cliTools:['depot_cli_detect','depot_cli_install_plan','depot_cli_install','depot_cli_catalog','depot_cli_scan','depot_cli_help','depot_cli_run','depot_cli_version'],
   readOnlyPaths:[...READ_ONLY].sort(),
   operatorApprovedReadPaths:(process.env.QUMI_DEPOT_CLI_EXTRA_READ_PATHS||'').split(';').filter(Boolean),
   sensitivePathsProhibited:[...NEVER_EXPOSE],
   operatorApprovedMutationPaths:(process.env.QUMI_DEPOT_CLI_APPROVED_PATHS||'').split(';').map(x=>x.trim()).filter(Boolean),
   docs:CLI_DOCS,
   note:'Every installed Depot subcommand can be inspected via --help. CLI execution uses explicit policy and approvals; full arbitrary flags/shell/credential-output are deliberately not allowed.'
 };
}
export async function help({command=[]}={}, {cliPath}){
 const cmd=command.length?words(command):[];
 const {stdout,stderr}=await run(cliPath(),[...cmd,'--help'],{timeout:18000,windowsHide:true,maxBuffer:128*1024,env:{...process.env,DEPOT_TOKEN:'',DEPOT_API_KEY:'',DEPOT_GIT_KEY:'',QUMI_MCP_BEARER_TOKEN:'',VAULT_PASSPHRASE:''}});
 return {command:['depot',...cmd,'--help'],help:redact((stdout||stderr).slice(0,35000)),documentation:CLI_DOCS};
}
export async function cliRun({command,args=[],project_id,approved_sha,approval_id}={},ctx){
 const cmdWords=words(command);const {cmd,readOnly}=cliPolicy(command);
 const pid=ctx.projectId(project_id);
 const org=process.env.QUMI_DEPOT_ORG_ID||'';
 const argv=validateArgs(args,readOnly,pid,org);
 // Non-readonly commands require a separate exact-head human approval and host enabling.
 let sourceSha=null;
 if(!readOnly){
   if(!approval_id||approval_id!==process.env.QUMI_DEPOT_APPROVAL_ID)throw new Error('Host-approved ticket identifier required');
   if(!/^[0-9a-f]{40}$/.test(approved_sha||''))throw new Error('Full approved_sha required');
   const checkout=await ctx.checkout(approved_sha);
   if(!checkout.clean)throw new Error('Dirty source checkout');
   sourceSha=checkout.sha;
 }
 const startedAt=new Date().toISOString();
 const execution=await ctx.runCli(cmdWords.concat(argv),pid);
 const output=redact([execution.stdout,execution.stderr].filter(Boolean).join('\n'));
 const digest=crypto.createHash('sha256').update(output).digest('hex');
 const receipt={id:crypto.randomUUID(),actor:identity(),command:cmd,arguments:argv.map(redact),projectId:pid,readOnly,approvalId:readOnly?null:approval_id,sourceSha,startedAt,endedAt:new Date().toISOString(),exitCode:execution.exitCode,outputSha256:digest};
 const proof=emitReceipt(receipt);
 return {receiptId:receipt.id,receiptSha256:proof.sha256,command:cmd,readOnly,exitCode:execution.exitCode,outputSha256:digest,output:output.slice(0,24000),truncated:output.length>24000};
}

// This scans exactly the installed CLI version, not an outdated hardcoded command table.
// The parser follows Cobra's Available Commands blocks; unrecognized help syntax is
// reported rather than guessed. No tokens are supplied during discovery.
export async function scan({max_commands=120}={}, {cliPath}){
 const cap=Math.min(Math.max(Number(max_commands)||120,1),200);
 const pending=[[]],seen=new Set(),result=[];
 while(pending.length&&result.length<cap){
   const parts=pending.shift(); const key=parts.join(' ');
   if(seen.has(key))continue;seen.add(key);
   let h;
   try{h=await help({command:parts},{cliPath});}
   catch(e){result.push({command:key||'(root)',error:'Unable to inspect this subcommand'});continue;}
   const lines=h.help.split(/\r?\n/);
   const children=[];let inAvailable=false;
   for(const line of lines){
     if(/^\s*Available Commands:\s*$/i.test(line)){inAvailable=true;continue;}
     if(inAvailable&&/^\s*\S.*:\s*$/.test(line))break;
     if(inAvailable){
       const m=/^\s{2,}([a-z][a-z0-9-]+)\s{2,}\S/.exec(line);
       if(m)children.push(m[1]);
       else if(line.trim()&&!/^\s/.test(line))inAvailable=false;
     }
   }
   result.push({command:key||'(root)',subcommands:children,executionPolicy:key?READ_ONLY.has(key)?'read-only':'host-approval-required':'help-only'});
   if(parts.length<6)for(const c of children)pending.push([...parts,c]);
 }
 return {cliVersion:'discover with depot_cli_version',discoveredCommands:result,total:result.length,
   truncated:pending.length>0,source:'live installed Depot CLI --help (no API token)',categories:CLI_DOCS,
   note:'Execution is policy-gated even for CLI commands that were discovered.'};
}
