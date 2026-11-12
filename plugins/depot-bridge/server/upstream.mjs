/** Optional upstream MCP bridge. URL and auth are host-only; agents cannot set them. */
import {redact} from './vault.mjs';

const SAFE_NAMES=new Set(['health','list_builds','get_build','get_build_steps','get_build_step_logs','get_build_bundle','ci_list_runs','ci_get_run','ci_get_job_logs','ci_diagnose_failure','ci_list_workflows','gha_list_jobs','list_projects']);
function endpoint(){
  const raw=process.env.QUMI_DEPOT_UPSTREAM_MCP_URL||'';
  if(!raw)return null;
  let u;
  try{u=new URL(raw);}catch{throw new Error('Upstream MCP URL is malformed');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw new Error('Upstream MCP must use a clean HTTPS URL');
  return u;
}
function toolAllowlist(){return (process.env.QUMI_DEPOT_UPSTREAM_ALLOWED_TOOLS||'').split(',').map(s=>s.trim()).filter(Boolean);}
export function upstreamStatus(){
 const url=endpoint();return {configured:!!url,transport:'streamable-http',endpointHost:url?.host||null,
    permittedTools:toolAllowlist(),readOnlyDefault:true,authenticationConfigured:!!process.env.QUMI_DEPOT_UPSTREAM_BEARER_TOKEN,
    note:'This connects to an operator-configured upstream MCP server; Depot Managed Agents MCP consumption is not a first-party public Depot MCP endpoint.'};
}
async function withClient(fn){
 const url=endpoint();if(!url)throw new Error('No verified upstream MCP configured; set host-only QUMI_DEPOT_UPSTREAM_MCP_URL');
 const [{Client},{StreamableHTTPClientTransport}]=await Promise.all([
   import('@modelcontextprotocol/sdk/client/index.js'),
   import('@modelcontextprotocol/sdk/client/streamableHttp.js')
 ]);
 const bearer=process.env.QUMI_DEPOT_UPSTREAM_BEARER_TOKEN||'';
 const opts=bearer?{requestInit:{headers:{Authorization:`Bearer ${bearer}`}}}:{};
 const transport=new StreamableHTTPClientTransport(url,opts);
 const client=new Client({name:'depot-bridge',version:'0.3.0'},{capabilities:{}});
 try{await client.connect(transport);return await fn(client);}finally{await client.close();}
}
export async function upstreamTools(){
 const r=await withClient(c=>c.listTools());
 const enabled=toolAllowlist();
 return {tools:(r.tools||[]).map(x=>({name:x.name,description:redact(x.description||'').slice(0,500),
   inputSchema:x.inputSchema,authorized:enabled.includes(x.name)})),
   note:'Tools not in QUMI_DEPOT_UPSTREAM_ALLOWED_TOOLS cannot be called.'};
}
export async function upstreamCall({tool_name,tool_args={},approved_sha,approval_id}={}){
 if(!/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(tool_name||''))throw new Error('Invalid upstream tool name');
 if(!toolAllowlist().includes(tool_name))throw new Error('Upstream tool not in host allowlist');
 if(!tool_args||typeof tool_args!=='object'||Array.isArray(tool_args)||JSON.stringify(tool_args).length>24000)throw new Error('Invalid or oversized upstream tool_args');
 if(!SAFE_NAMES.has(tool_name)){
  if(process.env.QUMI_DEPOT_UPSTREAM_ALLOW_WRITES!=='1')throw new Error('Upstream mutating tool access disabled');
  if(!approval_id||approval_id!==process.env.QUMI_DEPOT_APPROVAL_ID||!/^[0-9a-f]{40}$/.test(approved_sha||''))throw new Error('Upstream write requires host approval and exact SHA');
 }
 const r=await withClient(c=>c.callTool({name:tool_name,arguments:tool_args}));
 const raw=redact(JSON.stringify(r));
 return raw.length>64000?{truncated:true,excerpt:raw.slice(0,64000)}:JSON.parse(raw);
}
