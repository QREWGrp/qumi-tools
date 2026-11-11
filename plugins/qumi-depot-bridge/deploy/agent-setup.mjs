#!/usr/bin/env node
/* Interactive operator setup for agent-local, checksum-verified Depot CLI. */
import {planInstall,installCli,locateCli} from '../server/installer.mjs';
import readline from 'node:readline/promises';

const opts=process.argv.slice(2),action=opts[0]||'detect';
const scope=opts.includes('--user')?'user':'project';
const version=opts.find(x=>x.startsWith('--version='))?.slice(10);
try{
 if(action==='detect'){console.log(JSON.stringify(locateCli(),null,2));}
 else if(action==='install'){
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Interactive operator terminal required for installation approval');
  const plan=await planInstall({scope,version});
  console.log(JSON.stringify({scope:plan.scope,destination:plan.destination,release_version:plan.release_version,archive_sha256:plan.archive_sha256,download_source:plan.download_source},null,2));
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  const confirmation=await rl.question('Install this verified Depot CLI into the listed destination? Type INSTALL: ');rl.close();
  if(confirmation!=='INSTALL')throw Error('Operator declined CLI installation');
  process.env.QUMI_ALLOW_AGENT_CLI_INSTALL='1';
  const result=await installCli({plan_id:plan.plan_id,approved:true,replace_existing:opts.includes('--replace')});
  console.log(JSON.stringify(result,null,2));
 }else throw Error('Usage: node deploy/agent-setup.mjs detect | install [--user|--project] [--version=x.y.z] [--replace]');
}catch(e){console.error(`Setup stopped: ${e.message}`);process.exitCode=1;}
