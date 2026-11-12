#!/usr/bin/env node
import {saveVault,vaultStatus,removeVault} from '../server/vault.mjs';
import {stdin as input,stdout as output} from 'node:process';

async function hidden(label){
 if(!input.isTTY||!output.isTTY)throw Error('Secure credential entry requires an interactive terminal; never submit tokens as chat or MCP arguments');
 output.write(label);
 return await new Promise((resolve,reject)=>{
  let v='';input.setRawMode(true);input.resume();input.setEncoding('utf8');
  const onData=k=>{
   if(k==='\r'||k==='\n'){done();resolve(v);return;}
   if(k==='\u0003'){done();reject(Error('Cancelled by operator'));return;}
   if(k==='\u007f'||k==='\b'){v=v.slice(0,-1);return;}
   if(k.startsWith('\u001b'))return;
   if(v.length+k.length<32768)v+=k;
  };
  function done(){input.off('data',onData);input.setRawMode(false);input.pause();output.write('\n');}
  input.on('data',onData);
 });
}
const action=process.argv[2]||'status';
try{
 if(action==='status')console.log(JSON.stringify(vaultStatus(),null,2));
 else if(action==='store'){
   const secret=await hidden('Fly CLI API token (hidden): ');
   const pass=await hidden('New vault passphrase (hidden): ');
   const confirm=await hidden('Confirm vault passphrase (hidden): ');
   if(pass!==confirm)throw Error('Passphrases did not match');
   console.log(JSON.stringify(saveVault(secret,pass),null,2));
   console.log('To use with autonomous agents, inject VAULT_PASSPHRASE through the agent platform secret store. Do not put it in chat or committed files.');
 } else if(action==='clear'){
   const confirmation=await hidden('Type DELETE to erase locally encrypted credential: ');
   if(confirmation!=='DELETE')throw Error('Cancelled');
   console.log(JSON.stringify(removeVault()));
 }else throw Error('Usage: node bin/credentials.mjs [status|store|clear]');
}catch(e){console.error(e.message);process.exitCode=1;}
