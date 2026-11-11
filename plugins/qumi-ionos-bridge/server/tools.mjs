import {randomUUID as cryptoRandom} from 'node:crypto';
import {configStatus,redact,encryptVault,saveVault,receiptFor,configDir,configFile,decryptVault} from './config.mjs';
import {startSecureQuestion} from './secure-question.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {listUpstream,callUpstream,clearCache} from './upstream.mjs';
import {risk,canonical,consumeApproval} from './policy.mjs';

export const STATIC_TOOLS=[
 {name:'ionos_bridge_status',description:'Show configured providers, safe credential readiness, and effective discovery mode without showing tokens',inputSchema:{type:'object',properties:{}}},
 {name:'ionos_credential_request',description:'Display a cross-platform encrypted credential question via MCP URL elicitation; token never enters chat',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['ionos','cloudflare']}}}},
 {name:'ionos_secure_setup',description:'Compatibility alias: launch the portable encrypted credential question on Windows, Linux, or macOS',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['ionos','cloudflare'],default:'ionos'}}}},
 {name:'ionos_discover_tools',description:'Dynamically fetch ALL available tools from an upstream MCP server, with keyword, provider and pagination filters',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['ionos','cloudflare'],default:'ionos'},query:{type:'string'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:200},refresh:{type:'boolean'}}}},
 {name:'ionos_describe_tool',description:'Return CURRENT upstream MCP input schema and details for any tool; no hardcoded catalog',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['ionos','cloudflare'],default:'ionos'},name:{type:'string'}},required:['name']}},
 {name:'ionos_invoke_tool',description:'Invoke ANY dynamically discovered upstream MCP tool. Read-only calls execute; state-changing calls require exact one-time local operator approval',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['ionos','cloudflare'],default:'ionos'},name:{type:'string'},arguments:{type:'object',additionalProperties:true},approval_id:{type:'string'},dry_run:{type:'boolean'}},required:['name']}}];
const validProvider=p=>['ionos','cloudflare'].includes(p)?p:'ionos';
export async function dispatch(name,args={}){
 if(name==='ionos_bridge_status')return {bridge:'qumi-ionos-bridge',version:'0.2.0',providers:configStatus(),tool_mode:process.env.QUMI_IONOS_TOOL_MODE==='eager'?'eager':'dynamic',required_configuration:'IONOS hosted MCP Personal Access Token and server URL, provided per user',note:'Status does not validate live authorization; call ionos_discover_tools to test upstream'};
 if(name==='ionos_secure_setup'){return dispatch('ionos_credential_request',args);}
 if(name==='ionos_credential_request'){
  const provider=validProvider(args.provider);
  return await startSecureQuestion({bridge:'QUMI IONOS Bridge',credential:provider==='ionos'?'IONOS_PAT':'CLOUDFLARE_MCP_TOKEN',
   description:`Authorize ${provider} MCP on this operating-system account. The actual secret answer remains outside chat.`,
   fields:[{name:'endpoint',label:'Official HTTPS MCP endpoint',type:'url',max:1024},
    {name:'token',label:'MCP Personal Access Token',secret:true,max:8192},
    {name:'passphrase',label:'Vault passphrase (at least 12 characters)',secret:true,max:1024},
    {name:'confirmation',label:'Confirm vault passphrase',secret:true,max:1024}],
   save:async ({endpoint,token,passphrase,confirmation})=>{
    if(passphrase.length<12||passphrase!==confirmation)throw Error('Vault passphrases must match and be 12+ characters');
    const file=configFile(provider);
    if(fs.existsSync(file))decryptVault(JSON.parse(fs.readFileSync(file,'utf8')),passphrase);
    const record=encryptVault(provider,endpoint,token,passphrase);saveVault(record);
    const dir=path.join(configDir(),'receipts');fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const rec=receiptFor(record);const id=cryptoRandom();
    fs.writeFileSync(path.join(dir,`${id}.json`),JSON.stringify(rec,null,2),{mode:0o600,flag:'wx'});
    return {saved:true,encrypted:true};
   }});
 }
 if(name==='ionos_discover_tools'){
  const provider=validProvider(args.provider),tools=await listUpstream(provider,{refresh:args.refresh===true});const q=String(args.query??'').toLowerCase();
  const filtered=q?tools.filter(t=>(t.name+' '+(t.description||'')).toLowerCase().includes(q)):tools;
  const offset=Math.max(0,Number(args.offset||0)),limit=Math.min(200,Math.max(1,Number(args.limit||100)));
  return {provider,total:filtered.length,offset,next_offset:offset+limit<filtered.length?offset+limit:null,tools:filtered.slice(offset,offset+limit).map(t=>({name:t.name,description:String(t.description||'').slice(0,300),risk:risk(t)}))};
 }
 if(name==='ionos_describe_tool'){
  const provider=validProvider(args.provider);const t=(await listUpstream(provider)).find(t=>t.name===args.name);
  if(!t)throw Error('Tool not found in currently discovered upstream catalog');return {provider,tool:t,risk:risk(t)};
 }
 const call=async(provider,toolName,toolArgs={},approvalId,preview=false)=>{
  if(!toolName||typeof toolName!=='string')throw Error('Tool name required');
  const t=(await listUpstream(provider)).find(t=>t.name===toolName);if(!t)throw Error('Unknown tool; use ionos_discover_tools');
  const kind=risk(t),digest=canonical(provider,toolName,toolArgs);
  if(preview)return {preview:true,provider,tool:toolName,risk:kind,arguments_sha256:digest,needs_operator_approval:kind!=='read',approval_command:kind==='read'?null:`node bin/approve.mjs ${provider} ${toolName} --args-file <LOCAL_JSON_FILE>`,note:'Only exact argument matches are accepted; approval created in operator terminal, never from agent tool calls.'};
  if(kind!=='read')consumeApproval(approvalId,provider,toolName,toolArgs);
  return {provider,tool:toolName,risk:kind,result:await callUpstream(provider,toolName,toolArgs)};
 };
 if(name==='ionos_invoke_tool')return call(validProvider(args.provider),args.name,args.arguments??{},args.approval_id,args.dry_run===true);
 const m=/^(ionos|cloudflare)__(.+)$/.exec(name);
 if(m)return call(m[1],m[2],args??{},undefined,false);
 throw Error('Unknown bridge tool');
}
export async function registeredTools(){
 const mode=process.env.QUMI_IONOS_TOOL_MODE;
 if(mode!=='eager')return STATIC_TOOLS;
 let tools=[...STATIC_TOOLS];for(const provider of ['ionos','cloudflare']){
  try {const upstream=await listUpstream(provider);for(const tool of upstream)tools.push({name:`${provider}__${tool.name}`,description:`[${provider}] ${tool.description||''}`.slice(0,400),inputSchema:tool.inputSchema||{type:'object',properties:{}},annotations:tool.annotations});}catch{};
 }return tools;
}
export function cleanError(err){return redact(err).replace(/(Bearer\s+)\S+/ig,'$1[REDACTED]');}
