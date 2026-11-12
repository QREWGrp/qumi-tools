#!/usr/bin/env node
/* Operator-side only. Exact scope approval: command, argv, cwd, risk, expiry. */
import fs from 'node:fs';
import {normalized,denyUnsafe,risk,digest,createApproval} from '../server/policy.mjs';
import {question} from './terminal.mjs';
const pos=process.argv.indexOf('--plan-file'),filename=pos>=0?process.argv[pos+1]:null;
if(!filename){process.stderr.write('Usage: node bin/approve.mjs --plan-file /private/path/operation.json\n');process.exit(2);}
try{
 const input=JSON.parse(fs.readFileSync(filename,'utf8'));const source=input.operation||input;
 const operation=normalized(source.command,source.args||[],source.cwd);denyUnsafe(operation.command,operation.args);
 if(risk(operation.command,operation.args)==='read')throw Error('No approval necessary for read operation');
 process.stdout.write(JSON.stringify({operation,risk:risk(operation.command,operation.args),operation_sha256:digest(operation)},null,2)+'\n');
 const answer=await question('Approve the exact operation above (may run third-party scripts or change registry state)? Type APPROVE');
 if(answer!=='APPROVE')throw Error('Operator refused');
 process.stdout.write(JSON.stringify(createApproval(operation),null,2)+'\n');
}catch(e){process.stderr.write('Approval refused: '+e.message+'\n');process.exitCode=1;}
