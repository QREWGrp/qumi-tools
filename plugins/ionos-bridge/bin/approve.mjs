#!/usr/bin/env node
import fs from 'node:fs';import {question} from './terminal.mjs';import {approveRecord} from '../server/policy.mjs';
const provider=process.argv[2],tool=process.argv[3],i=process.argv.indexOf('--args-file');const argfile=i>=0?process.argv[i+1]:null;
if(!['ionos','cloudflare'].includes(provider)||!tool||!argfile){process.stderr.write('Usage: node bin/approve.mjs ionos|cloudflare <exact_tool_name> --args-file /private/path/args.json\n');process.exit(2)}
try{
 const args=JSON.parse(fs.readFileSync(argfile,'utf8'));
 process.stdout.write(JSON.stringify({provider,tool,arguments:args},null,2)+'\n');
 const yes=await question('Approve this exact potentially mutating operation? Type APPROVE');
 if(yes!=='APPROVE')throw Error('Operator refused approval');
 process.stdout.write(JSON.stringify({approval:approveRecord({provider,tool,args}),next:'Send ONLY approval ID, never credentials, to ionos_invoke_tool with matching arguments.'},null,2)+'\n');
}catch(e){process.stderr.write('Approval failed: '+e.message+'\n');process.exitCode=1}
