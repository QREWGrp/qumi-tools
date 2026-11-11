import {findCli,help,version,planCli,executeCli,spawnBounded} from './cli.mjs';
import {releasePlan,install,detectInstall} from './install.mjs';
import {vaultStatus,temporaryToken,saveVault,decryptToken} from './vault.mjs';
import {stateDir,loadJson} from './state.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {startSecureQuestion} from './secure-question.mjs';
import {scrub} from './state.mjs';

const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const str=(desc)=>({type:'string',description:desc});
const tool=(name,description,inputSchema)=>({name,description,inputSchema});
export const tools=[
 tool('fly_runtime_status','Report local CLI installation, safe credential readiness, and official Fly MCP URL without checking or revealing credentials',object()),
 tool('fly_credential_request','Ask a cross-platform secure encrypted question for Fly CLI tokens; Fly MCP uses OAuth',object({purpose:str('Why Fly access is needed'),mode:{type:'string',enum:['mcp','cli']}})),
 tool('fly_cli_version','Show installed flyctl version or report missing installation',object()),
 tool('fly_cli_help','Discover help for any current flyctl command or nested subcommand',object({command:{type:'array',items:{type:'string'},maxItems:8}})),
 tool('fly_cli_catalog','Discover flyctl command categories using installed binary help',object()),
 tool('fly_cli_install_plan','Query official flyctl GitHub release metadata and prepare checksum-pinned installation plan; does not install',object({scope:{type:'string',enum:['project','user']},version:{type:'string'},project_dir:{type:'string'}})),
 tool('fly_cli_install','Install an approved, SHA-256-verified flyctl release to the agent project or user directory; never overwrite existing installation',object({plan_id:str('Previously planned install ID')},['plan_id'])),
 tool('fly_cli_plan','Plan ANY installed flyctl command with exact arguments; safe read-only commands execute without approval, others require one-time operator authorization',object({command:{type:'array',items:{type:'string'},minItems:1,maxItems:8},args:{type:'array',items:{type:'string'},maxItems:32}},['command'])),
 tool('fly_cli_execute','Execute a previously planned flyctl operation without a shell; mutating or unknown commands require one-time local approval',object({plan_id:str('Previously planned command ID')},['plan_id'])),
 tool('fly_auth_whoami','Test Fly CLI identity without exposing token or other sensitive authentication material',object()),
 tool('fly_mcp_connection_guide','Show the official OAuth Fly MCP endpoint and client-specific connection commands; the MCP client owns actual connection and tool discovery',object({client:{type:'string',enum:['codex','claude-code','claude-web','other']}})),
 tool('fly_agent_setup_guide','Explain official fly skills and fly setup agent commands; modifies client files only after explicit CLI plan/approval',object())
];
export async function dispatch(name,args={}){
 switch(name){
 case 'fly_runtime_status':return {...detectInstall(),credentials:vaultStatus(),mcp:{name:'fly-official',url:'https://mcp.fly.io',authentication:'Browser OAuth handled separately by MCP client',connected:'Not verifiable from local CLI bridge'},version:'0.2.0'};
 case 'fly_credential_request':{
   if(args.mode==='mcp')return {question:'Connect Fly.io through the official OAuth flow?',mode:'oauth',url:'https://mcp.fly.io',note:'Fly MCP OAuth does not require copying a token into an agent question. Use the MCP client authorization UI.'};
   return await startSecureQuestion({bridge:'QUMI FLY BRIDGE',credential:'FLY_API_TOKEN',
    description:'Enter your own scoped Fly CLI API token privately on this operating-system account.',
    fields:[{name:'token',label:'Fly CLI API token',secret:true,max:8192},
     {name:'passphrase',label:'Vault encryption passphrase (12+ characters)',secret:true,max:1024},
     {name:'confirmation',label:'Confirm vault passphrase',secret:true,max:1024}],
    save:async ({token,passphrase,confirmation})=>{
      if(passphrase!==confirmation||passphrase.length<12)throw Error('Passphrases must match and contain 12+ characters');
      const existing=path.join(stateDir(),'fly-token.vault.json');
      if(fs.existsSync(existing))decryptToken(loadJson(existing),passphrase);
      saveVault(token,passphrase);
      return {saved:true,encrypted:true};
    }});
 }
 case 'fly_cli_version':return await version();
 case 'fly_cli_help':return await help(args.command??[]);
 case 'fly_cli_catalog':return await help([]);
 case 'fly_cli_install_plan':return await releasePlan(args);
 case 'fly_cli_install':return await install(args);
 case 'fly_cli_plan':return planCli(args);
 case 'fly_cli_execute':return await executeCli(args);
 case 'fly_auth_whoami':{
   const exe=findCli();if(!exe)throw Error('Install flyctl before checking auth');
   const r=await spawnBounded(exe,['auth','whoami'],{timeoutMs:15000,maxBytes:2000});
   return {connected:r.exitCode===0,exitCode:r.exitCode,output:scrub(r.output)};
 }
 case 'fly_mcp_connection_guide':{
   const client=args.client||'other';const commands={codex:['codex mcp add fly-mcp --url https://mcp.fly.io','codex mcp login fly-mcp','codex mcp list'],'claude-code':['claude mcp add --transport http --scope user fly-mcp https://mcp.fly.io','claude mcp login fly-mcp','claude mcp get fly-mcp'],'claude-web':['Settings > Connectors > Add custom connector > https://mcp.fly.io','Sign in with Fly OAuth and approve scoped access'],other:['Configure remote MCP Streamable HTTP URL https://mcp.fly.io','Use client OAuth to authorize selected organizations']};
   return {url:'https://mcp.fly.io',method:'OAuth; no token pasted',client,steps:commands[client],documentation:'https://fly.io/mcp/',discovery:'Upstream Fly MCP server exposes its own dynamic tools/list to the client. Local bridge does not mirror static tools.'};
 }
 case 'fly_agent_setup_guide':return {commands:['fly skills --help','fly setup agent --help'],notes:'flyctl v0.5.1+ supports fly skills, and v0.5.2+ supports fly setup agent. Both may modify local agent config. Plan them using fly_cli_plan, obtain one-time terminal approval, then fly_cli_execute. Fly OAuth occurs in the client.',source:'https://fly.io/changelog/give-your-agent-the-fly-cli/'};
 default:throw Error('Unknown QUMI Fly tool');
 }
}
export function cleanError(e){return scrub(e?.message||'Unknown bridge failure').slice(0,1000);}
