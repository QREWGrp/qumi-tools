#!/usr/bin/env node
/** Dependency-free JSON-RPC stdio MCP server. Host agent launches this Node process locally. */
import readline from 'node:readline';
import {tools,dispatch,cleanError} from './tools.mjs';
import {createQuestionElicitation} from './elicitation.mjs';
const send=msg=>process.stdout.write(JSON.stringify(msg)+'\n');
const prompts=createQuestionElicitation(send);
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
rl.on('line',async line=>{
 let msg;try{msg=JSON.parse(line);}catch{return;}
 if(prompts.consume(msg))return;
 if(msg.id===undefined)return;
 try{
  let result;
  switch(msg.method){
   case 'initialize':prompts.initialize(msg.params);result={protocolVersion:'2025-11-25',capabilities:{tools:{listChanged:false}},serverInfo:{name:'qumi-npm-bridge',version:'0.1.0'}};break;
   case 'ping':result={};break;
   case 'tools/list':result={tools};break;
   case 'tools/call':{
    const name=msg.params?.name;
    try{let value=await dispatch(name,msg.params?.arguments||{});if(name==='npm_credential_question')value=await prompts.present(value);result={content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};}
    catch(e){result={isError:true,content:[{type:'text',text:cleanError(e)}]};}break;
   }
   default:send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});return;
  }
  send({jsonrpc:'2.0',id:msg.id,result});
 }catch(e){send({jsonrpc:'2.0',id:msg.id,error:{code:-32603,message:cleanError(e)}});}
});
process.on('uncaughtException',e=>process.stderr.write('QUMI NPM bridge error: '+cleanError(e)+'\n'));
