import {configStatus,redact} from './config.mjs';
import {listUpstream,callUpstream,clearCache} from './upstream.mjs';
import {risk,canonical,consumeApproval} from './policy.mjs';

export const STATIC_TOOLS=[
 {name:'ionos_bridge_status',description:'Show configured providers, safe credential readiness, and effective discovery mode without showing tokens',inputSchema:{type:'object',properties:{}}},
 {name:'ionos_credential_request',description:'Ask operator to provision or rotate IONOS MCP PAT or optional Cloudflare MCP token OUT OF BAND; never send tokens via chat',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['ionos','cloudflare']}}}},
 {name:'ionos_discover_tools',description:'Dynamically fetch ALL available tools from an upstream MCP server, with keyword, provider and pagination filters',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['ionos','cloudflare'],default:'ionos'},query:{type:'string'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:200},refresh:{type:'boolean'}}}},
 {name:'ionos_describe_tool',description:'Return CURRENT upstream MCP input schema and details for any tool; no hardcoded catalog',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['ionos','cloudflare'],default:'ionos'},name:{type:'string'}},required:['name']}},
 {name:'ionos_invoke_tool',description:'Invoke ANY dynamically discovered upstream MCP tool. Read-only calls execute; state-changing calls require exact one-time local operator approval',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['ionos','cloudflare'],default:'ionos'},name:{type:'string'},arguments:{type:'object',additionalProperties:true},approval_id:{type:'string'},dry_run:{type:'boolean'}},required:['name']}}];
const validProvider=p=>['ionos','cloudflare'].includes(p)?p:'ionos';
export async function dispatch(name,args={}){
 if(name==='ionos_bridge_status')return {bridge:'qumi-ionos-bridge',version:'0.1.0',providers:configStatus(),tool_mode:process.env.QUMI_IONOS_TOOL_MODE==='eager'?'eager':'dynamic',required_configuration:'IONOS hosted MCP Personal Access Token and server URL, provided per user',note:'Status does not validate live authorization; call ionos_discover_tools to test upstream'};
 if(name==='ionos_credential_request'){
  const provider=validProvider(args.provider);
  return {provider,question:`Authorize ${provider==='ionos'?'IONOS Hosting MCP':'Cloudflare MCP'} for this agent?`,secret_input:'NOT IN CHAT',operator_instructions:`On the operator-owned agent workstation run: node bin/setup.mjs ${provider}; enter HTTPS MCP URL and PAT/token using masked prompts. Alternatively inject the provider URL and bearer token through your agent secret manager.`,credential_portal:provider==='ionos'?'https://developer.hosting.ionos.com/mcp':null,after_setup:'Restart the agent MCP process or refresh its configuration; call ionos_discover_tools to verify permissions',warning:'Never paste tokens into MCP arguments, chat, issues or Git.'};
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
