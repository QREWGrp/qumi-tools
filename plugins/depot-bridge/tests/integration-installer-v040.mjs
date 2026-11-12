import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {planInstall,installCli,platformSpec} from '../server/installer.mjs';

if(process.platform!=='linux'){console.log('SKIP: mocked Linux release extraction; platform selection covered separately');process.exit(0);}
const before={...process.env},fetchBefore=globalThis.fetch;
const base=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-depot-install-'));
try{
 const project=path.join(base,'repo');fs.mkdirSync(project);
 const git=(args)=>execFileSync('git',args,{cwd:project,encoding:'utf8'});
 git(['init','-q']);git(['config','user.email','qumi-test@example.invalid']);git(['config','user.name','QUMI test']);
 fs.writeFileSync(path.join(project,'README.md'),'fixture\n');git(['add','README.md']);git(['commit','-qm','initial']);
 const out=path.join(base,'payload');fs.mkdirSync(out);
 fs.writeFileSync(path.join(out,'depot'),'#!/bin/sh\necho depot mock 2.1.2\n',{mode:0o700});
 const spec=platformSpec();const name=`depot_2.1.2_${spec.os}_${spec.arch}.tar.gz`,archive=path.join(base,name);
 execFileSync('tar',['-czf',archive,'-C',out,'depot']);const data=fs.readFileSync(archive);
 const digest=crypto.createHash('sha256').update(data).digest('hex');
 const assetUrl=`https://github.com/depot/cli/releases/download/v2.1.2/${name}`;
 globalThis.fetch=async url=>{
  const text=String(url);
  if(text.startsWith('https://api.github.com/repos/depot/cli/releases'))return new Response(JSON.stringify({tag_name:'v2.1.2',draft:false,prerelease:false,assets:[{name,digest:`sha256:${digest}`,size:data.length,browser_download_url:assetUrl}]}),{status:200,headers:{'Content-Type':'application/json'}});
  if(text===assetUrl)return new Response(data,{status:200});
  return new Response('Unexpected URL',{status:404});
 };
 process.env.QUMI_PROJECT_ROOT=project;
 process.env.QUMI_ALLOW_AGENT_CLI_INSTALL='1';
 const plan=await planInstall({scope:'project',version:'2.1.2'});
 assert.equal(plan.archive_sha256,digest);
 const result=await installCli({plan_id:plan.plan_id,approved:true});
 assert.equal(result.installed,true);assert.equal(result.archive_sha256,digest);
 assert.equal(fs.existsSync(result.destination),true);
 const ver=execFileSync(result.destination,['--version'],{encoding:'utf8'}).trim();assert.equal(ver,'depot mock 2.1.2');
 assert.ok(fs.readFileSync(path.join(project,'.git','info','exclude'),'utf8').includes('/.qumi-tools/'));
 assert.equal(git(['status','--porcelain']).trim(),'');
 const second=await planInstall({scope:'project',version:'2.1.2'});
 await assert.rejects(()=>installCli({plan_id:second.plan_id,approved:true}),/already installed/);
 console.log('PASS: agent-local CLI verified download/extract, project Git ignore and replacement refusal');
}finally{
 globalThis.fetch=fetchBefore;
 for(const key of Object.keys(process.env))if(before[key]===undefined)delete process.env[key];Object.assign(process.env,before);
 fs.rmSync(base,{recursive:true,force:true});
}
