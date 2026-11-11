import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tools,dispatch} from '../server/tools.mjs';
import {planCli,executeCli,describeCommand} from '../server/cli.mjs';
import {assetInfo,releasePlan,install} from '../server/install.mjs';
import {loadPlan,savePrivate,planPath} from '../server/state.mjs';
import {encryptToken,decryptToken,saveVault,vaultStatus} from '../server/vault.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function isolated(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-fly-test-'));process.env.QUMI_FLY_STATE_DIR=path.join(dir,'state');return dir;}
test('tools-list protocol works without flyctl or API token',async()=>{
 const child=spawn(process.execPath,[path.join(root,'server/index.mjs')],{cwd:root,stdio:['pipe','pipe','pipe'],env:{...process.env,QUMI_FLY_CLI_PATH:'/nonexistent/fly'}});
 let output='';child.stdout.on('data',chunk=>{output+=chunk;});
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',clientInfo:{name:'test',version:'1'}}})+'\n');
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'fly_runtime_status',arguments:{}}})+'\n');
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('MCP test timed out')),3000);child.stdout.on('data',()=>{if(output.split('\n').filter(Boolean).length>=3){clearTimeout(t);resolve();}});});
 child.kill();const replies=output.split('\n').filter(Boolean).map(JSON.parse);
 assert.equal(replies[0].result.serverInfo.name,'qumi-fly-bridge');
 assert.equal(replies[1].result.tools.length,tools.length);
 assert.ok(replies[1].result.tools.length>=10);
 assert.equal(replies[2].result.structuredContent.mcp.url,'https://mcp.fly.io');
});
test('CLI plan blocks token operations, unknown commands require one-time approval',async()=>{
 const dir=isolated();const fake=path.join(dir,'fly');
 fs.writeFileSync(fake,'#!/bin/sh\necho "fake fly $*"\n',{mode:0o700});process.env.QUMI_FLY_CLI_PATH=fake;
 assert.throws(()=>describeCommand(['auth','token'],[]),/secrets/);
 assert.throws(()=>describeCommand(['secrets','set'],['KEY=value']),/secrets/);
 assert.throws(()=>describeCommand(['apps','list'],['--access-token=secret']),/Unsafe/);
 const read=planCli({command:['apps','list'],args:['--json']});
 const output=await executeCli({plan_id:read.plan_id});
 assert.equal(output.exitCode,0);
 const mutation=planCli({command:['machine','destroy'],args:['danger-id']});
 await assert.rejects(()=>executeCli({plan_id:mutation.plan_id}),/approval required/);
 const loaded=loadPlan(mutation.plan_id);
 savePrivate(planPath(mutation.plan_id,'approval'),{planId:mutation.plan_id,expiresAt:loaded.expiresAt});
 const approved=await executeCli({plan_id:mutation.plan_id});assert.equal(approved.exitCode,0);
 await assert.rejects(()=>executeCli({plan_id:mutation.plan_id}),/approval required/);
});
test('Encrypted token vault round-trip and non-secret receipt',()=>{
 const dir=isolated();const secret='test-token-do-not-disclose-123456789';const record=encryptToken(secret,'long secret passphrase for test');
 assert.equal(decryptToken(record,'long secret passphrase for test'),secret);
 assert.throws(()=>decryptToken(record,'incorrect-passphrase'),/authenticate data/);
 const r=saveVault(secret,'long secret passphrase for test');
 assert.equal(vaultStatus().encryptedVaultPresent,true);
 const receipt=JSON.parse(fs.readFileSync(r.receiptFile));
 assert.equal(receipt.credential,'FLY_API_TOKEN');
 assert.ok(!JSON.stringify(receipt).includes(secret));
 assert.equal(receipt.encryptedRecordSHA256.length,64);
});
test('Fly release official digest is required',()=>{
 const a={name:'flyctl_9.9.9_Linux_x86_64.tar.gz',browser_download_url:'https://github.com/superfly/flyctl/releases/download/v9.9.9/flyctl_9.9.9_Linux_x86_64.tar.gz',size:65536,digest:'sha256:'+'a'.repeat(64)};
 assert.equal(assetInfo({assets:[a]},'Linux_x86_64.tar.gz').sha256,'a'.repeat(64));
 assert.throws(()=>assetInfo({assets:[{...a,digest:null}]},'Linux_x86_64.tar.gz'),/missing SHA-256/);
 assert.throws(()=>assetInfo({assets:[{...a,browser_download_url:'https://evil.example/evil'}]},'Linux_x86_64.tar.gz'),/Untrusted/);
});
test('SHA-256 verified local CLI install with exact approval and no dirty Git state',async(t)=>{
 if(process.platform==='win32'){t.skip('tar fixture for Linux/macOS');return;}
 const home=isolated(),project=path.join(home,'repo');fs.mkdirSync(project);
 execFileSync('git',['init','-q'],{cwd:project});
 const src=path.join(home,'archive-src');fs.mkdirSync(src);
 const exe=path.join(src,'flyctl');
 const padded=Array.from({length:200},()=> '#'+crypto.randomBytes(40).toString('hex')).join('\n');
 fs.writeFileSync(exe,`#!/bin/sh\necho 'flyctl v9.9.9'\n${padded}\n`,{mode:0o700});
 const archive=path.join(home,'fake.tar.gz');execFileSync('tar',['-czf',archive,'-C',src,'flyctl']);
 const bytes=fs.readFileSync(archive),digest=crypto.createHash('sha256').update(bytes).digest('hex');
 const platform=process.platform==='linux'?'Linux':'macOS';const cpu=process.arch==='x64'?'x86_64':'arm64';
 const name=`flyctl_9.9.9_${platform}_${cpu}.tar.gz`;
 const url=`https://github.com/superfly/flyctl/releases/download/v9.9.9/${name}`;
 const release={tag_name:'v9.9.9',assets:[{name,browser_download_url:url,size:bytes.length,digest:'sha256:'+digest}]};
 const savedFetch=globalThis.fetch;
 globalThis.fetch=async(request)=>{
  const s=String(request);
  if(s.includes('api.github.com'))return new Response(JSON.stringify(release),{status:200});
  if(s===url){const resp=new Response(bytes,{status:200});Object.defineProperty(resp,'url',{value:'https://release-assets.githubusercontent.com/test'});return resp;}
  throw Error('Unexpected download '+s);
 };
 try{
  const plan=await releasePlan({scope:'project',project_dir:project});
  const loaded=loadPlan(plan.plan_id);
  await assert.rejects(()=>install({plan_id:plan.plan_id}),/approval required/);
  savePrivate(planPath(plan.plan_id,'approval'),{planId:plan.plan_id,expiresAt:loaded.expiresAt});
  const result=await install({plan_id:plan.plan_id});assert.equal(result.installed,true);
  assert.equal(fs.existsSync(result.location),true);
  const check=execFileSync(result.location,['version'],{encoding:'utf8'}).trim();assert.ok(check.includes('v9.9.9'));
  assert.equal(execFileSync('git',['status','--porcelain'],{cwd:project,encoding:'utf8'}).trim(),'');
  await assert.rejects(()=>install({plan_id:plan.plan_id}),/already exists/);
 }finally{globalThis.fetch=savedFetch;}
});
