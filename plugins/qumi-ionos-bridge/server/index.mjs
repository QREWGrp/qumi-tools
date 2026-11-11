#!/usr/bin/env node
import readline from 'node:readline';
import {registeredTools,dispatch,cleanError} from './tools.mjs';
function reply(id,result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');}
function error(id,code,message){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code,message}})+'\n');}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
rl.on('line',async line=>{
 let msg;try{msg=JSON.parse(line);}catch{return;}
 if(msg.id===undefined)return;
 try{
  switch(msg.method){
   case 'initialize':reply(msg.id,{protocolVersion:msg.params?.protocolVersion||'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'qumi-ionos-bridge',version:'0.1.0'}});return;
   case 'ping':reply(msg.id,{});return;
   case 'tools/list':reply(msg.id,{tools:await registeredTools()});return;
   case 'tools/call':{
    const t=msg.params?.name,args=msg.params?.arguments||{};
    try{const result=await dispatch(t,args);reply(msg.id,{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result});}
    catch(e){reply(msg.id,{isError:true,content:[{type:'text',text:cleanError(e)}]});}return;
   }
   default:error(msg.id,-32601,'Method not found');return;
  }
 }catch(e){error(msg.id,-32603,cleanError(e));}
});
process.on('uncaughtException',e=>{process.stderr.write('Bridge internal error: '+cleanError(e)+'\n');});
