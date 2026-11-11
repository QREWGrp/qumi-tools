#!/usr/bin/env node
import readline from 'node:readline';
import {tools,dispatch,cleanError} from './tools.mjs';
function send(id,result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');}
function fault(id,code,message){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code,message}})+'\n');}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
rl.on('line',async raw=>{
 let request;try{request=JSON.parse(raw);}catch{return;}
 if(request.id===undefined)return;
 try{
  if(request.method==='initialize')return send(request.id,{protocolVersion:'2025-06-18',serverInfo:{name:'qumi-fly-bridge',version:'0.1.0'},capabilities:{tools:{listChanged:false}}});
  if(request.method==='ping')return send(request.id,{});
  if(request.method==='tools/list')return send(request.id,{tools});
  if(request.method==='tools/call'){
   const name=request.params?.name;
   const t=tools.find(x=>x.name===name);
   if(!t)return fault(request.id,-32601,'Unknown Fly bridge tool');
   try{const result=await dispatch(name,request.params?.arguments||{});return send(request.id,{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result});}
   catch(e){return send(request.id,{isError:true,content:[{type:'text',text:cleanError(e)}]});}
  }
  return fault(request.id,-32601,'Method not found');
 }catch(e){return fault(request.id,-32603,cleanError(e));}
});
