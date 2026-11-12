import http from 'node:http';
import crypto from 'node:crypto';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {execute,errSafe} from './operations.mjs';

const str=z.string().min(1).max(128);
const project=z.string().min(1).max(100).optional();
const paging={project_id:project,page_size:z.number().int().min(1).max(100).optional(),page_token:z.string().max(500).optional()};
const buildId={build_id:str};
const cliWords=z.array(z.string().min(1).max(40)).min(1).max(8);
const cliArgs=z.array(z.string().min(1).max(240)).max(32).optional();
const tools=[
 ['health','Check bridge configuration, permissions and secret availability without disclosing secrets',{},'health'],
 ['credentials_status','Check whether host-side Windows DPAPI credential files or injected variables exist; values are never returned',{},'credentials_status'],
 ['git_askpass_status','Check the DPAPI-backed GIT_ASKPASS provisioning status without disclosing a token',{},'git_askpass_status'],
 ['git_remote_probe','Authenticated read-only git ls-remote of exactly the approved GitHub origin, using DPAPI GIT_ASKPASS',{},'git_remote_probe'],
 ['depot_upstream_status','Check whether an operator-configured upstream Depot MCP server is connected',{},'depot_upstream_status'],
 ['depot_upstream_tools','List upstream MCP tools and whether host policy authorizes them',{},'depot_upstream_tools'],
 ['depot_upstream_call','Call an explicitly allowlisted upstream MCP tool (read-only by default)',{tool_name:z.string().min(1).max(128),tool_args:z.record(z.any()).optional(),approved_sha:z.string().regex(/^[0-9a-f]{40}$/).optional(),approval_id:z.string().max(128).optional()},'depot_upstream_call'],
 ['launch_secret_setup','Request masked LOCAL Windows credential dialog on the VHost; remote MCP callers are refused',{},'launch_secret_setup'],
 ['depot_cli_catalog','Return supported Depot CLI categories, official documentation and host execution policy',{},'depot_cli_catalog'],
 ['depot_cli_scan','Discover all subcommands supported by the actual installed Depot CLI without credentials',{max_commands:z.number().int().min(1).max(200).optional()},'depot_cli_scan'],
 ['depot_cli_help','Inspect ANY installed Depot CLI subcommand via --help; no mutation or login',{command:z.array(z.string().min(1).max(40)).max(8).optional()},'depot_cli_help'],
 ['depot_cli_run','Run a policy-approved Depot CLI operation, without shell; read-only allowlist by default, mutations need host grants and SHA + approval',{command:cliWords,args:cliArgs,project_id:project,approved_sha:z.string().regex(/^[0-9a-f]{40}$/).optional(),approval_id:z.string().max(128).optional()},'depot_cli_run'],
 ['list_projects','List authorized Depot projects; may require organization-scoped token',{},'list_projects'],
 ['list_builds','Page through recent builds for an allowlisted Depot project',paging,'list_builds'],
 ['get_build','Get status, timestamps, duration and metadata for a Depot build ID',buildId,'get_build'],
 ['get_build_steps','Page through steps for one Depot build',{...paging,...buildId},'get_build_steps'],
 ['get_build_step_logs','Get page of logs for one step digest of a build',{...paging,...buildId,step_digest:str},'get_build_step_logs'],
 ['get_build_bundle','Retrieve one build metadata + bounded list of steps and their logs in one call',{...paging,...buildId},'get_build_bundle'],
 ['verify_checkout','Verify exact source SHA and clean Git checkout on the Windows VHost',{approved_sha:z.string().regex(/^[0-9a-f]{40}$/).optional()},'verify_checkout'],
 ['depot_cli_version','Check the installed Windows Depot CLI version (no build executed)',{},'depot_cli_version'],
 ['start_build','Start bounded Depot CLI build from a clean, SHA-frozen Windows checkout; disabled by default',{approved_sha:z.string().regex(/^[0-9a-f]{40}$/),project_id:project,context:z.string().max(300).optional(),dockerfile:z.string().max(300).optional(),tag:z.string().max(200).optional(),platform:z.enum(['linux/amd64','linux/arm64','linux/amd64,linux/arm64']).optional()},'start_build'],
 ['build_job','Poll host-side job status and retrieve bounded log tail',{job_id:z.string().uuid(),tail_lines:z.number().int().min(1).max(120).optional()},'build_job']
];
function newMcp(context={remote:true}){
 const server=new McpServer({name:'depot-bridge',version:'1.0.0-rc'}, {capabilities:{tools:{}}});
 for(const [name,description,inputSchema,operation] of tools){
  server.registerTool(name,{description,inputSchema},async (args={})=>{
    try {
      const data=await execute(operation,args,context);
      return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:{result:data}};
    }catch(e){return {isError:true,content:[{type:'text',text:errSafe(e)}]};}
  });
 }
 return server;
}
function constantTimeMatch(a,b){
 if(!a||!b)return false;
 const x=Buffer.from(a), y=Buffer.from(b);
 return x.length===y.length && crypto.timingSafeEqual(x,y);
}
async function runHttp(){
 const expected=process.env.QUMI_MCP_BEARER_TOKEN;
 if(!expected || expected.length<32)throw new Error('QUMI_MCP_BEARER_TOKEN must be a dedicated random 32+ character secret');
 const port=Number(process.env.QUMI_MCP_PORT||8787);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid QUMI_MCP_PORT');
 const allowed=(process.env.QUMI_MCP_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 const server=http.createServer(async(req,res)=>{
  const respond=(status,message)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:message}));};
  if(req.url!=='/mcp')return respond(404,'Not found');
  if(!['POST','GET','DELETE'].includes(req.method))return respond(405,'Method not allowed');
  const origin=req.headers.origin;
  if(origin && !allowed.includes(origin))return respond(403,'Origin not allowed');
  const authorization=req.headers.authorization||'';
  if(!authorization.startsWith('Bearer ')||!constantTimeMatch(authorization.slice(7),expected))return respond(401,'Unauthorized');
  // Stateless Streamable HTTP: POST carries each JSON-RPC request; GET/SSE sessions intentionally not supported.
  if(req.method!=='POST')return respond(405,'Stateless MCP endpoint only supports POST');
  let size=0,chunks=[];
  try{
   for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw new Error('Request too large');chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   const mcp=newMcp({remote:true});
   const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
   try{await mcp.connect(transport);await transport.handleRequest(req,res,data);}finally{await transport.close();await mcp.close();}
  }catch(e){if(!res.headersSent)respond(size>1024*1024?413:400,errSafe(e));else if(!res.writableEnded)res.end();}
 });
 server.listen(port,'127.0.0.1',()=>process.stderr.write(`QUMI MCP HTTP listening on loopback port ${port}; use authenticated TLS reverse proxy for remote agents.\n`));
}
const mode=process.argv.includes('--http')?'http':'stdio';
if(mode==='http')await runHttp();
else{
 const server=newMcp({remote:false});
 const transport=new StdioServerTransport();
 await server.connect(transport);
}
