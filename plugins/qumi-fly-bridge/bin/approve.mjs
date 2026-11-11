#!/usr/bin/env node
import readline from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {loadPlan,planPath,savePrivate} from '../server/state.mjs';
const id=process.argv[2];
try{
 if(!stdin.isTTY||!stdout.isTTY)throw Error('Approval requires an interactive operator terminal');
 const p=loadPlan(id);
 stdout.write('\nQUMI FLY BRIDGE — ONE-TIME APPROVAL\n');
 stdout.write('Type: '+p.type+'\nExpires: '+p.expiresAt+'\n');
 stdout.write('Action: '+p.summary+'\n');
 stdout.write('Review the exact command, target and risk. Do not approve unknown or unsolicited plans.\n');
 const rl=readline.createInterface({input:stdin,output:stdout});
 const answer=await rl.question('Type APPROVE to authorize once: ');rl.close();
 if(answer.trim()!=='APPROVE')throw Error('Denied');
 savePrivate(planPath(id,'approval'),{planId:id,approvedAt:new Date().toISOString(),expiresAt:p.expiresAt,approvedType:p.type});
 stdout.write('One-time approval saved for this user only.\n');
}catch(e){console.error(e.message);process.exitCode=1;}
