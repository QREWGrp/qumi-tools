import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {status,activeCredential,sessionClear} from './vault.mjs';
import {detectNpm,catalog,execNpm,redact} from './cli.mjs';
import {normalized,risk,denyUnsafe,digest,consumeApproval} from './policy.mjs';
import {startSecureQuestion} from './secure-question.mjs';
const empty={type:'object',properties:{}};
const commandInput={type:'object',properties:{command:{type:'string',description:'A subcommand from the installed npm CLI catalog'},args:{type:'array',items:{type:'string'},maxItems:70},cwd:{type:'string',description:'Absolute path to the intended project, never system32 or filesystem root'},approval_id:{type:'string'},authenticate:{type:'boolean'},timeout_ms:{type:'integer',minimum:1000,maximum:300000}},required:['command','cwd']};
export const tools=[
 {name:'npm_bridge_status',description:'Check npm/Node version, platform, credential readiness and optional encrypted vault without returning tokens',inputSchema:empty},
 {name:'npm_command_catalog',description:'Discover every subcommand advertised by the INSTALLED npm CLI; new commands require no bridge update',inputSchema:empty},
 {name:'npm_command_help',description:'Read the current installed npm subcommand help without running its operation',inputSchema:{type:'object',properties:{command:{type:'string'}},required:['command']}},
 {name:'npm_command_plan',description:'Classify risk and produce exact operator-review plan for any npm CLI command',inputSchema:commandInput},
 {name:'npm_command_run',description:'Execute an npm CLI command. Read-only inspection runs immediately; installs, scripts, publishing and writes require exact single-use operator approval',inputSchema:commandInput},
 {name:'npm_credential_question',description:'Request a secure encrypted browser question for npm token; operator chooses session-only or OPTIONAL encrypted vault',inputSchema:{type:'object',properties:{intent:{type:'string',enum:['configure','unlock','clear_saved','login_in_browser'],default:'configure'}}}},
 {name:'npm_credential_status',description:'Show whether credentials are present in the current session or an encrypted vault (not credential values)',inputSchema:empty},
 {name:'npm_cli_install_plan',description:'Plan an approved user/project-local install of npm v11, or recommend official Node version manager',inputSchema:{type:'object',properties:{target:{type:'string',description:'Absolute directory, operator-owned; npm will be installed under node_modules'}}}},
 {name:'npm_cli_install',description:'Install npm@11 in an approved user directory using existing npm with scripts disabled',inputSchema:{type:'object',properties:{target:{type:'string'},approval_id:{type:'string'}},required:['target','approval_id']}}
];
const allowedCommand=command=>/^[a-z][a-z0-9-]{0,50}$/.test(String(command));
function installSpec(target){if(typeof target!=='string'||!path.isAbsolute(target))throw Error('Provide absolute target directory');const cwd=fs.realpathSync(target);const root=path.parse(cwd).root;if(cwd===root||/[\\/]Windows[\\/]System32(?:[\\/]|$)/i.test(cwd))throw Error('Unsafe install target');return normalized('install',['npm@11','--ignore-scripts','--no-audit','--no-fund'],cwd);}
export async function dispatch(name,args={}){
 if(name==='npm_bridge_status'){
  const credentials=status();let cli;
  try{cli=await detectNpm();}catch(e){cli={available:false,message:'Install Node.js and npm using an official Node version manager',docs:'https://docs.npmjs.com/cli/v11/configuring-npm/install/'};}
  return {bridge:'qumi-npm-bridge',version:'0.1.0',cli,credentials,security:{credential_persistence:'OPTIONAL — session-only default',user_secret_in_chat:false,mutations:'one-time operator approval'},docs:'https://docs.npmjs.com/cli/v11/commands/'};
 }
 if(name==='npm_credential_status')return status();
 if(name==='npm_credential_question'){
  if(args.intent==='login_in_browser')return {question:'Would you like to sign in using npm official web authentication instead of providing a token?',answer_requires_terminal:true,command:'npm login --auth-type=web',warning:'Run this in your own interactive terminal. npm CLI may save credentials to your npmrc; the bridge does not control that storage.',docs:'https://docs.npmjs.com/cli/v11/commands/npm-login/'};
  return startSecureQuestion(args.intent||'configure');
 }
 if(name==='npm_command_catalog')return catalog();
 if(name==='npm_command_help'){
  if(!allowedCommand(args.command))throw Error('Invalid command name');
  const c=await catalog();if(!c.commands.includes(args.command))throw Error('Command not advertised by installed npm CLI');
  return execNpm({command:args.command,args:['--help'],cwd:os.tmpdir(),timeoutMs:15000});
 }
 if(name==='npm_cli_install_plan'||name==='npm_cli_install'){
  const spec=installSpec(args.target);
  if(name==='npm_cli_install_plan')return {planned:true,operation:spec,operation_sha256:digest(spec),risk:'privileged',approval_required:true,approval_instruction:'Operator writes operation object to a trusted JSON file and runs: node bin/approve.mjs --plan-file <absolute JSON path>; checks requested npm@11 install location first',note:'Node/npm must already exist. To install Node itself follow https://docs.npmjs.com/cli/v11/configuring-npm/install/'};
  consumeApproval(args.approval_id,spec);
  const result=await execNpm({...spec,timeoutMs:300000});
  return {installation_attempted:true,exit_code:result.exit_code,stderr:result.stderr,stdout:result.stdout,expected_cli:path.join(spec.cwd,'node_modules','npm','bin','npm-cli.js'),note:'npm@11 is installed in a user/project-local directory. Use QUMI_NPM_BIN only for an approved executable, not a malicious file from a package.'};
 }
 if(name==='npm_command_plan'||name==='npm_command_run'){
  const spec=normalized(args.command,args.args||[],args.cwd);denyUnsafe(spec.command,spec.args);
  const installed=await catalog();if(!installed.commands.includes(spec.command))throw Error('Subcommand not advertised by the installed npm CLI');
  const kind=risk(spec.command,spec.args);
  if(name==='npm_command_plan')return {operation:spec,risk:kind,approval_required:kind!=='read',operation_sha256:digest(spec),authenticated:!!activeCredential(),approval_instruction:kind==='read'?null:'Operator reviews the exact operation JSON in a private file and runs: node bin/approve.mjs --plan-file /absolute/path/to/operation.json',warning:'npm install, exec, run and build scripts can execute third-party code. npm publish, access, owner, and org operations mutate remote state. No shell string is executed by this bridge.'};
  if(kind!=='read')consumeApproval(args.approval_id,spec);
  const result=await execNpm({...spec,timeoutMs:args.timeout_ms||120000,authenticate:args.authenticate===true});
  return {operation_sha256:digest(spec),risk:kind,authenticated:args.authenticate===true&&!!activeCredential(),...result};
 }
 throw Error('Unknown QUMI NPM tool');
}
export const cleanError=e=>redact(String(e?.message||e).slice(0,700),activeCredential()?.token);
