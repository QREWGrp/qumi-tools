import assert from 'node:assert/strict';
import {execute} from '../server/operations.mjs';
import {redact,getSecret} from '../server/vault.mjs';

const keep={...process.env};
try{
 for(const key of ['DEPOT_TOKEN','DEPOT_API_KEY','QUMI_ALLOW_BUILDS','QUMI_CHECKOUT_ROOT','QUMI_DEPOT_CLI_MUTATIONS','QUMI_DEPOT_CLI_APPROVED_PATHS','QUMI_DEPOT_PROJECT_IDS'])delete process.env[key];
 const h=await execute('health');
 assert.equal(h.mode,'read-only');assert.equal(h.configured,false);
 assert.equal((await execute('depot_cli_catalog')).mode.includes('dynamic'),true);
 assert.equal((await execute('credentials_status')).configured,false);
 await assert.rejects(()=>execute('launch_secret_setup',{}, {remote:true}),/Remote MCP/);
 await assert.rejects(()=>execute('start_build',{approved_sha:'0'.repeat(40)}),/read-only/);
 await assert.rejects(()=>execute('verify_checkout',{}),/QUMI_CHECKOUT_ROOT/);
 await assert.rejects(()=>execute('build_job',{job_id:'../../etc/passwd'}),/Invalid job ID/);
 await assert.rejects(()=>execute('depot_cli_run',{command:['projects','delete'],args:['--project-id','someid']}),/disabled/);
 process.env.QUMI_DEPOT_CLI_MUTATIONS='1';
 await assert.rejects(()=>execute('depot_cli_run',{command:['projects','delete']}),/explicitly approved/);
 process.env.DEPOT_TOKEN='SAMPLE-NONPROD-TOKEN-FOR-REDACTION';
 assert.equal(redact(`prefix ${process.env.DEPOT_TOKEN} suffix`),'prefix [REDACTED] suffix');
 assert.equal(await getSecret('DEPOT_TOKEN'),process.env.DEPOT_TOKEN);
 console.log('PASS: read-only defaults, credential-dialog remote denial, CLI mutation policy, safe error handling, forbidden job traversal, token redaction');
}finally {for(const key of Object.keys(process.env)){if(keep[key]===undefined)delete process.env[key];}Object.assign(process.env,keep);}
