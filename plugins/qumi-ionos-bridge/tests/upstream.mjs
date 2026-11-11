import assert from 'node:assert/strict';import http from 'node:http';import os from 'node:os';import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
import {dispatch,registeredTools} from '../server/tools.mjs';import {approveRecord} from '../server/policy.mjs';
const base=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-ionos-upstream-'));process.env.QUMI_IONOS_CONFIG_DIR=base;process.env.NODE_ENV='test';process.env.QUMI_IONOS_ALLOW_TEST_HTTP='1';
let calls=[];
const server=http.createServer(async(req,res)=>{
 let b='';for await(const x of req)b+=x;const d=JSON.parse(b);
 assert.equal(req.headers.authorization,'Bearer TEST_IONOS_PAT_FAKE_12345');
 res.setHeader('Content-Type','application/json');
 if(d.method==='notifications/initialized'){res.statusCode=202;res.end();return;}
 let result;
 if(d.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fake-ionos',version:'test'}};
 else if(d.method==='tools/list')result={tools:[
  {name:'dns_get_zones',description:'List DNS zones',inputSchema:{type:'object',properties:{}}},
  {name:'dns_create_records',description:'Create records',inputSchema:{type:'object',properties:{zone_id:{type:'string'}}}}
 ]};
 else if(d.method==='tools/call'){calls.push(d.params.name);result={content:[{type:'text',text:'{"ok":true}'}]};}
 else{res.statusCode=400;res.end();return;}
 res.end(JSON.stringify({jsonrpc:'2.0',id:d.id,result}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
process.env.IONOS_MCP_URL=`http://127.0.0.1:${port}/mcp`;process.env.IONOS_PAT='TEST_IONOS_PAT_FAKE_12345';
try{
 const catalog=await dispatch('ionos_discover_tools',{provider:'ionos',refresh:true});
 assert.equal(catalog.total,2);const details=await dispatch('ionos_describe_tool',{name:'dns_get_zones'});assert.equal(details.risk,'read');
 const read=await dispatch('ionos_invoke_tool',{name:'dns_get_zones',arguments:{}});assert.equal(read.result.content[0].type,'text');
 assert.deepEqual(calls,['dns_get_zones']);
 const plan=await dispatch('ionos_invoke_tool',{name:'dns_create_records',arguments:{zone_id:'z1'},dry_run:true});assert.equal(plan.needs_operator_approval,true);
 await assert.rejects(()=>dispatch('ionos_invoke_tool',{name:'dns_create_records',arguments:{zone_id:'z1'}}),/approval/);
 const ticket=approveRecord({provider:'ionos',tool:'dns_create_records',args:{zone_id:'z1'}});
 const written=await dispatch('ionos_invoke_tool',{name:'dns_create_records',arguments:{zone_id:'z1'},approval_id:ticket.id});assert.equal(written.risk,'change');
 assert.deepEqual(calls,['dns_get_zones','dns_create_records']);
 process.env.QUMI_IONOS_TOOL_MODE='eager';const eager=await registeredTools();assert(eager.some(x=>x.name==='ionos__dns_get_zones'));
 process.env.QUMI_IONOS_TOOL_MODE='dynamic';assert.equal((await registeredTools()).length,6);
 console.log('PASS dynamic discovery, exact schema, read-only call, mutating approval, eager tool exposure');
 // Protocol-level smoke: MCP server starts and advertises the six static tools before any credential configuration.
 const child=spawn(process.execPath,[new URL('../server/index.mjs',import.meta.url).pathname],{env:{...process.env,QUMI_IONOS_TOOL_MODE:'dynamic'},stdio:['pipe','pipe','pipe']});
 const outcome=await new Promise((resolve,reject)=>{
  let acc='';let seen=[];const timeout=setTimeout(()=>reject(Error('MCP subprocess timeout')),4000);
  child.stdout.on('data',x=>{acc+=x.toString();while(acc.includes('\n')){const i=acc.indexOf('\n'),line=acc.slice(0,i);acc=acc.slice(i+1);if(line.trim())seen.push(JSON.parse(line));if(seen.length>=2){clearTimeout(timeout);resolve(seen);}}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})+'\n');
 });
 assert.equal(outcome[1].result.tools.length,6);child.kill();console.log('PASS actual MCP initialize and tools/list over stdio');
}finally{server.close();fs.rmSync(base,{recursive:true,force:true});}
