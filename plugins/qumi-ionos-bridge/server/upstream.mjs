import {getProviderConfig,redact} from './config.mjs';
const SESSION=new Map();
const TOOL_CACHE=new Map();
const PROTOCOL='2025-06-18';
function parseSse(text){const data=[];for(const group of text.split(/\r?\n\r?\n/)){
 const lines=group.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim());
 if(lines.length){const payload=lines.join('\n');try{data.push(JSON.parse(payload));}catch{}}
 }return data;
}
async function send(provider,message,{session,notification=false}={}){
 const c=getProviderConfig(provider);const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':`Bearer ${c.token}`,'MCP-Protocol-Version':PROTOCOL};
 if(session)headers['Mcp-Session-Id']=session;
 let res;
 try{res=await fetch(c.endpoint,{method:'POST',headers,body:JSON.stringify(message),signal:AbortSignal.timeout(20000),redirect:'error'});}catch(e){throw new Error(`${provider} upstream request failed: ${redact(e)}`)}
 if(!res.ok){let detail='';try{detail=(await res.text()).slice(0,140);}catch{}throw new Error(`${provider} MCP HTTP ${res.status}${res.status===401||res.status===403?' (check PAT scopes/expiry)':''}${res.status===429?' (rate limited)':''}: ${detail.replace(/Bearer\s+\S+/g,'Bearer [REDACTED]')}`)}
 if(notification)return {result:{},session:res.headers.get('mcp-session-id')||session};
 const text=await res.text();const parsed=res.headers.get('content-type')?.includes('text/event-stream')?parseSse(text):[JSON.parse(text)];
 const match=parsed.find(x=>x.id===message.id);if(!match)throw Error(`${provider} MCP response ID mismatch`);
 if(match.error)throw Error(`${provider} MCP ${match.error.code}: ${String(match.error.message||'unknown error').slice(0,300)}`);
 return {result:match.result,session:res.headers.get('mcp-session-id')||session};
}
let id=1;
async function initialize(provider){
 const prior=SESSION.get(provider);const c=getProviderConfig(provider);
 if(prior&&prior.endpoint===c.endpoint&&prior.source===c.source)return prior.session;
 const response=await send(provider,{jsonrpc:'2.0',id:id++,method:'initialize',params:{protocolVersion:PROTOCOL,capabilities:{},clientInfo:{name:'qumi-ionos-bridge',version:'0.2.1'}}});
 const session=response.session;
 SESSION.set(provider,{session,endpoint:c.endpoint,source:c.source});
 // MCP clients notify initialized; some stateless gateways reject notifications without a response.
 try{await send(provider,{jsonrpc:'2.0',method:'notifications/initialized',params:{}},{session,notification:true});}catch{}
 return session;
}
export async function invoke(provider,method,params={}){
 let session=await initialize(provider);
 try{const r=await send(provider,{jsonrpc:'2.0',id:id++,method,params},{session});return r.result;}
 catch(e){if(/MCP HTTP 404|MCP HTTP 400|MCP HTTP 409/.test(String(e))){SESSION.delete(provider);session=await initialize(provider);const r=await send(provider,{jsonrpc:'2.0',id:id++,method,params},{session});return r.result;}throw e;}
}
export async function listUpstream(provider,{refresh=false}={}){
 const cached=TOOL_CACHE.get(provider);if(!refresh&&cached&&Date.now()-cached.at<180000)return cached.tools;
 let cursor,all=[],pages=0;
 do{const r=await invoke(provider,'tools/list',cursor?{cursor}:{});if(!Array.isArray(r.tools))throw Error('Upstream tools/list did not return an array');all.push(...r.tools);cursor=r.nextCursor;pages++;if(pages>100||all.length>10000)throw Error('Upstream tool listing exceeded limits');}while(cursor);
 TOOL_CACHE.set(provider,{tools:all,at:Date.now()});return all;
}
export async function callUpstream(provider,name,args){const tools=await listUpstream(provider);if(!tools.some(x=>x.name===name))throw Error('Tool not present in upstream tools/list');return invoke(provider,'tools/call',{name,arguments:args});}
export function clearCache(provider){if(provider){TOOL_CACHE.delete(provider);SESSION.delete(provider);}else{TOOL_CACHE.clear();SESSION.clear();}}
