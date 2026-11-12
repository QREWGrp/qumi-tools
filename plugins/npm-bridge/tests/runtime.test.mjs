import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {catalog} from '../server/cli.mjs';
import {normalized,risk,denyUnsafe,createApproval,consumeApproval} from '../server/policy.mjs';
import {dispatch} from '../server/tools.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-npm-test-'));
process.env.QUMI_NPM_CONFIG_DIR=path.join(dir,'config');
test('dynamic npm catalog and help',async()=>{
 const cat=await catalog();assert(cat.count>40,`npm catalog incomplete: ${cat.count}`);assert(cat.commands.includes('publish'));
 const status=await dispatch('npm_bridge_status');assert(status.cli.npm_version);assert.equal(status.security.credential_persistence,'OPTIONAL — session-only default');
 const help=await dispatch('npm_command_help',{command:'view'});assert.match(help.stdout,/view/i);
});
test('read-only calls and approval classification',async()=>{
 const spec=normalized('view',['npm','version'],dir);assert.equal(risk(spec.command,spec.args),'read');
 const plan=await dispatch('npm_command_plan',{command:'view',args:['npm','version'],cwd:dir});assert.equal(plan.approval_required,false);
 const p=normalized('publish',['--dry-run'],dir);assert.equal(risk(p.command,p.args),'privileged');assert.notEqual(risk('audit',['--fix=true']),'read');
 assert.throws(()=>consumeApproval('not-a-uuid',p),/approval/i);
 const rec=createApproval(p);assert(rec.approval_id);assert(consumeApproval(rec.approval_id,p));
 assert.throws(()=>consumeApproval(rec.approval_id,p),/Approval not found/);
 assert.throws(()=>denyUnsafe('config',['list']),/secret/i);
 assert.throws(()=>normalized('view',['npm','--registry=https://evil.invalid'],dir),/Credentials/);
 assert.throws(()=>normalized('view',[],path.parse(dir).root),/root|absolute/);
});
test('real npm command executes in bounded project without token',async()=>{
 const r=await dispatch('npm_command_run',{command:'ls',args:[],cwd:dir,timeout_ms:15000});assert.equal(typeof r.exit_code,'number');assert.equal(r.authenticated,false);
});
test('MCP initialize/tools/list and tool invocation',async()=>{
 const cp=spawn(process.execPath,[path.resolve('server/index.mjs')],{cwd:path.resolve('.'),env:{...process.env,QUMI_NPM_CONFIG_DIR:process.env.QUMI_NPM_CONFIG_DIR},stdio:['pipe','pipe','pipe']});
 let buffer='',requests=new Map();const input=json=>cp.stdin.write(JSON.stringify(json)+'\n');
 cp.stdout.on('data',x=>{buffer+=x.toString();while(buffer.includes('\n')){const k=buffer.indexOf('\n');const line=buffer.slice(0,k);buffer=buffer.slice(k+1);if(!line.trim())continue;const message=JSON.parse(line);if(requests.has(String(message.id))){requests.get(String(message.id))(message);requests.delete(String(message.id));}}});
 const response=(id,method,params)=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('MCP timeout')),10000);requests.set(String(id),v=>{clearTimeout(timeout);resolve(v)});input({jsonrpc:'2.0',id,method,params});});
 try{
  const init=await response(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{}});assert.equal(init.result.serverInfo.name,'npm-bridge');
  const tools=await response(2,'tools/list',{});assert(tools.result.tools.length>=9);
  const status=await response(3,'tools/call',{name:'npm_credential_status',arguments:{}});assert.equal(status.result.structuredContent.default_persistence,false);
 }finally{cp.kill();}
});
