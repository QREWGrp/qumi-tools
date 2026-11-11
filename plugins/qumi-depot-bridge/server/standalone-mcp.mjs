/** Zero-install-dependency MCP transport for portable Codex/Claude/Replit/Depot agents.
 * Depot SDK is imported only on SDK tool invocation; CLI discovery/install works immediately.
 */
import readline from 'node:readline';
import http from 'node:http';
import crypto from 'node:crypto';
import {execute,errSafe} from './operations.mjs';
import {createQuestionElicitation} from './elicitation.mjs';

const s=(max=128)=>({type:'string',minLength:1,maxLength:max});
const optional=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const proj=s(100), sha={type:'string',pattern:'^[0-9a-f]{40}$'};
const paging={project_id:proj,page_size:{type:'integer',minimum:1,maximum:100},page_token:s(500)};
const cmdArr={type:'array',items:{type:'string',pattern:'^[a-z][a-z0-9-]*$',maxLength:40},minItems:1,maxItems:8};
const tools=[
 ['health','Describe agent-side Depot configuration and secret availability; no tokens returned',optional()],
 ['runtime_status','Check local MCP runtime, CLI location, Depot SDK availability, and encrypted vault readiness',optional()],
 ['credentials_status','Report encrypted vault and injected credential availability, without disclosing secrets',optional()],
 ['credential_request','Ask an encrypted credential question on Windows, Linux or macOS via MCP URL elicitation; never accept plaintext through MCP',{...optional({credential:{type:'string',enum:['DEPOT_TOKEN','DEPOT_API_KEY','DEPOT_GIT_KEY']},action:{type:'string',enum:['provision','rotate']},reason:s(240)})}],
 ['git_askpass_status','Inspect operator-approved Git HTTPS credential helper status',optional()],
 ['git_remote_probe','Verify exact approved GitHub remote HEAD using Git-only GIT_ASKPASS',optional()],
 ['depot_cli_detect','Detect Depot CLI in agent environment or project-local installation',optional()],
 ['depot_cli_install_plan','Prepare exact-release SHA-256 verified Depot CLI installation into agent or project scope',optional({scope:{type:'string',enum:['user','project']},version:s(32)})],
 ['depot_cli_install','Install approved Depot CLI asset after SHA-256 verification; requires host enablement',optional({plan_id:s(50),approved:{type:'boolean'},replace_existing:{type:'boolean'},approval_id:s(128)},['plan_id','approved'])],
 ['depot_cli_version','Show installed Depot CLI version',optional()],
 ['depot_cli_catalog','List CLI reference categories and host command execution policy',optional()],
 ['depot_cli_scan','Discover every command in installed Depot CLI help tree',optional({max_commands:{type:'integer',minimum:1,maximum:200}})],
 ['depot_cli_help','Inspect installed Depot CLI subcommand help without credentials',optional({command:{type:'array',items:s(40),maxItems:8}})],
 ['depot_cli_run','Run policy-approved Depot CLI operation without a shell; mutations require approval',optional({command:cmdArr,args:{type:'array',items:s(240),maxItems:32},project_id:proj,approved_sha:sha,approval_id:s(128)},['command'])],
 ['depot_upstream_status','Inspect configured external Depot-related MCP endpoint readiness',optional()],
 ['depot_upstream_tools','List upstream MCP tools and approved names',optional()],
 ['depot_upstream_call','Call explicit allowlisted upstream MCP tool; not an arbitrary remote executor',optional({tool_name:s(128),tool_args:{type:'object'},approved_sha:sha,approval_id:s(128)},['tool_name'])],
 ['list_projects','List Depot projects available to approved identity',optional()],
 ['list_builds','List Depot builds within configured allowed project IDs',optional(paging)],
 ['get_build','Inspect Depot build by ID',optional({build_id:s()},['build_id'])],
 ['get_build_steps','Retrieve Depot build steps by ID',optional({...paging,build_id:s()},['build_id'])],
 ['get_build_step_logs','Retrieve Depot step logs',optional({...paging,build_id:s(),step_digest:s()},['build_id','step_digest'])],
 ['get_build_bundle','Retrieve bounded build metadata and step logs',optional({...paging,build_id:s()},['build_id'])],
 ['verify_checkout','Verify exact Git SHA and clean checkout',optional({approved_sha:sha})],
 ['start_build','Start SHA-pinned approved Depot build from clean checkout',optional({approved_sha:sha,project_id:proj,context:s(300),dockerfile:s(300),tag:s(200),platform:{type:'string',enum:['linux/amd64','linux/arm64','linux/amd64,linux/arm64']}},['approved_sha'])],
 ['build_job','Retrieve bounded job status and log tail',optional({job_id:s(36),tail_lines:{type:'integer',minimum:1,maximum:120}},['job_id'])],
 ['launch_secret_setup','Compatibility alias for portable secure credential question across Windows, Linux and macOS',optional()]
].map(([name,description,inputSchema])=>({name,description,inputSchema}));
const lookup=new Map(tools.map(x=>[x.name,x]));
function validate(schema,value){
 const a=value===undefined?{}:value;
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Tool arguments must be a JSON object');
 for(const required of schema.required||[])if(a[required]===undefined)throw Error(`Required argument ${required} is missing`);
 for(const [k,v] of Object.entries(a)){
  const p=schema.properties[k];if(!p)throw Error(`Unknown tool argument ${k}`);
  if(p.type==='string'&&(typeof v!=='string'||(p.minLength&&v.length<p.minLength)||(p.maxLength&&v.length>p.maxLength)||(p.pattern&&!new RegExp(p.pattern).test(v))||(p.enum&&!p.enum.includes(v))))throw Error(`Invalid ${k}`);
  if(p.type==='boolean'&&typeof v!=='boolean')throw Error(`Invalid ${k}`);
  if(p.type==='integer'&&(!Number.isInteger(v)||(p.minimum!==undefined&&v<p.minimum)||(p.maximum!==undefined&&v>p.maximum)))throw Error(`Invalid ${k}`);
  if(p.type==='array'&&(!Array.isArray(v)||(p.minItems!==undefined&&v.length<p.minItems)||(p.maxItems!==undefined&&v.length>p.maxItems)||v.some(item=>p.items?.type==='string'&&(typeof item!=='string'||(p.items.minLength&&item.length<p.items.minLength)||(p.items.maxLength&&item.length>p.items.maxLength)||(p.items.pattern&&!new RegExp(p.items.pattern).test(item))))))throw Error(`Invalid ${k}`);
  if(p.type==='object'&&(!v||typeof v!=='object'||Array.isArray(v)))throw Error(`Invalid ${k}`);
 }
 return a;
}
export async function handleRpc(message,{remote=false}={}){
 if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string')return {jsonrpc:'2.0',id:message?.id??null,error:{code:-32600,message:'Invalid request'}};
 const {method,id}=message;
 if(id===undefined)return null;
 const reply=(result)=>({jsonrpc:'2.0',id,result});
 try{
  if(method==='initialize')return reply({protocolVersion:message.params?.protocolVersion||'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'qumi-depot-bridge',version:'0.5.0'},instructions:'Secure Depot CLI + build inspection. For missing secrets use credential_request, never send tokens in MCP arguments or chat.'});
  if(method==='ping')return reply({});
  if(method==='tools/list')return reply({tools});
  if(method==='tools/call'){
   const tool=lookup.get(message.params?.name);if(!tool)throw Error('Unknown MCP tool');
   const args=validate(tool.inputSchema,message.params.arguments);
   try{const data=await execute(tool.name,args,{remote});return reply({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:{result:data}});}
   catch(e){return reply({isError:true,content:[{type:'text',text:errSafe(e)}]});}
  }
  return {jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}};
 }catch(e){return {jsonrpc:'2.0',id,error:{code:-32602,message:errSafe(e)}};}
}
async function stdio(){
 const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
 const send=value=>process.stdout.write(`${JSON.stringify(value)}\n`);
 const prompts=createQuestionElicitation(send);
 rl.on('line',raw=>{
  if(raw.length>1024*1024)return;
  let message;try{message=JSON.parse(raw)}catch{return;}
  if(prompts.consume(message))return;
  if(message.method==='initialize')prompts.initialize(message.params);
  (async()=>{
   let result=await handleRpc(message,{remote:false});
   if(message.method==='tools/call'&&message.params?.name==='credential_request'&&result?.result?.structuredContent?.result?.mode==='url'){
    const value=result.result.structuredContent.result;
    const updated=await prompts.present(value);
    result={...result,result:{content:[{type:'text',text:JSON.stringify(updated)}],structuredContent:{result:updated}}};
   }
   if(result!==null)send(result);
  })().catch(()=>{if(message.id!==undefined)send({jsonrpc:'2.0',id:message.id,error:{code:-32603,message:'Internal bridge failure'}})});
 });
}
function authorized(got,expected){if(typeof got!=='string'||got.length!==expected.length)return false;return crypto.timingSafeEqual(Buffer.from(got),Buffer.from(expected));}
async function httpServer(){
 const expected=process.env.QUMI_MCP_BEARER_TOKEN;
 if(!expected||expected.length<32)throw Error('Set a dedicated QUMI_MCP_BEARER_TOKEN (32+ chars) for HTTP MCP');
 const port=Number(process.env.QUMI_MCP_PORT||8787);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid MCP port');
 const origins=(process.env.QUMI_MCP_ALLOWED_ORIGINS||'').split(',').filter(Boolean);
 http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.url!=='/mcp')return send(404,{error:'Not found'});
  if(req.method!=='POST')return send(405,{error:'Only stateless POST MCP is available'});
  if(req.headers.origin&&!origins.includes(req.headers.origin))return send(403,{error:'Origin denied'});
  if(!req.headers.authorization?.startsWith('Bearer ')||!authorized(req.headers.authorization.slice(7),expected))return send(401,{error:'Unauthorized'});
  try{
   const parts=[];let len=0;
   for await(const chunk of req){len+=chunk.length;if(len>1024*1024)throw Error('Request too large');parts.push(chunk);}
   const result=await handleRpc(JSON.parse(Buffer.concat(parts).toString('utf8')),{remote:true});
   if(result===null){res.writeHead(202);res.end();}else send(200,result);
  }catch(e){send(400,{error:'Invalid MCP request'});}
 }).listen(port,'127.0.0.1',()=>process.stderr.write(`QUMI portable MCP listening at 127.0.0.1:${port}. Put behind HTTPS authentication and client identity controls.\n`));
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 if(process.argv.includes('--http'))await httpServer();else await stdio();
}
