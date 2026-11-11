import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execute} from '../server/operations.mjs';

if(process.platform==='win32'){
 console.log('SKIP: Linux/macOS fake CLI integration; execute real VHost acceptance on Windows');
}else{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-depot-test-'));
 const fake=path.join(root,'depot');
 const checkout=path.join(root,'checkout');
 const evidence=path.join(root,'evidence');
 fs.mkdirSync(checkout);fs.mkdirSync(path.join(checkout,'.git'));
 fs.writeFileSync(fake,'#!/bin/sh\nprintf "%s\\n" "fake-depot $*"\n',{mode:0o700});
 const env={...process.env};
 try{
  process.env.QUMI_DEPOT_CLI_PATH=fake;
  process.env.QUMI_CHECKOUT_ROOT=checkout;
  process.env.QUMI_DEPOT_PROJECT_IDS='42pctzdz2g';
  process.env.DEPOT_PROJECT_ID='42pctzdz2g';
  process.env.QUMI_DEPOT_EVIDENCE_DIR=evidence;
  process.env.DEPOT_TOKEN='FAKE-NO-REAL-DEPOT-TOKEN-12345';
  delete process.env.QUMI_DEPOT_CLI_MUTATIONS;
  const help=await execute('depot_cli_help',{command:['projects','list']});
  assert.match(help.help,/projects list --help/);
  const read=await execute('depot_cli_run',{command:['list','builds'],args:['--project','42pctzdz2g','--output','json']});
  assert.equal(read.exitCode,0);
  assert.match(read.output,/list builds/);
  assert.doesNotMatch(read.output,/FAKE-NO-REAL-DEPOT-TOKEN/);
  const receipt=JSON.parse(fs.readFileSync(path.join(evidence,`${read.receiptId}.json`),'utf8'));
  assert.equal(receipt.projectId,'42pctzdz2g');
  assert.equal(receipt.readOnly,true);
  assert.equal(crypto.createHash('sha256').update(read.output).digest('hex'),read.outputSha256);
  await assert.rejects(()=>execute('depot_cli_run',{command:['list','builds'],args:['--project','OTHER']}),/project override/);
  await assert.rejects(()=>execute('depot_cli_run',{command:['list','builds'],args:['--command','whoami']}),/Credential\/command flags/);
  await assert.rejects(()=>execute('depot_cli_run',{command:['login','token']}),/forbidden/);
  await assert.rejects(()=>execute('depot_cli_run',{command:['projects','delete']}),/disabled/);
  console.log('PASS: fake-CLI command discovery, allowlisted execution, evidence receipt SHA, override/refusal and secret redaction');
 }finally{for(const key of Object.keys(process.env))if(env[key]===undefined)delete process.env[key];Object.assign(process.env,env);fs.rmSync(root,{recursive:true,force:true});}
}
