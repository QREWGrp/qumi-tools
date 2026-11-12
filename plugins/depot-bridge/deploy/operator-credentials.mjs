#!/usr/bin/env node
/** Operator-only interactive credential onboarding and rotation. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CREDENTIALS,readVault,writeVault,seal,unseal,nonSecretReceipt,saveReceipt,commitReceipt,vaultFile} from '../server/portable-vault.mjs';

async function secretPrompt(message){
 if(!process.stdin.isTTY||!process.stdout.isTTY||typeof process.stdin.setRawMode!=='function')throw Error('Private interactive terminal required; NEVER paste tokens into chat or command-line arguments');
 process.stdout.write(`${message}: `);
 return new Promise((resolve,reject)=>{
  let result=''; const inp=process.stdin;const wasRaw=inp.isRaw;inp.setRawMode(true);inp.resume();inp.setEncoding('utf8');
  function finish(err){inp.off('data',onData);inp.setRawMode(!!wasRaw);inp.pause();process.stdout.write('\n');if(err)reject(err);else resolve(result);}
  function onData(chunk){
   for(const ch of chunk){
    if(ch==='\u0003'){finish(new Error('Cancelled'));return;}
    if(ch==='\r'||ch==='\n'){finish();return;}
    if(ch==='\b'||ch==='\u007f'){result=result.slice(0,-1);continue;}
    if(ch.charCodeAt(0)<32)continue;
    if(result.length>=8192){finish(new Error('Input exceeds maximum length'));return;}
    result+=ch;
   }
  }
  inp.on('data',onData);
 });
}
async function yes(message){const v=await secretPrompt(`${message} (type YES)`);return v==='YES';}
function usage(){console.log('Usage: node deploy/operator-credentials.mjs provision|rotate|unlock-run|status [DEPOT_TOKEN|DEPOT_API_KEY|DEPOT_GIT_KEY] [--commit] [--repo=/absolute/git/root] [-- command args...]');}
const [action,kind,...opts]=process.argv.slice(2);
try{
 if(action==='status'){console.log(JSON.stringify({encryptedVaultExists:!!readVault(),file:vaultFile(),secretsReturned:false}));process.exit(0);}
 if(['provision','rotate'].includes(action)){
  if(!CREDENTIALS.includes(kind))throw Error('Choose exactly one supported credential name');
  const previous=readVault();let current={};let passphrase;
  if(previous){passphrase=await secretPrompt('Vault unlock passphrase (hidden)');current=unseal(previous,passphrase);}
  else{passphrase=await secretPrompt('Create vault passphrase, at least 14 characters (hidden)');const confirmation=await secretPrompt('Confirm vault passphrase (hidden)');if(passphrase!==confirmation)throw Error('Passphrases do not match');}
  const value=await secretPrompt(`Enter NEW ${kind} privately (hidden)`);
  const confirmation=await secretPrompt(`Confirm ${kind} privately (hidden)`);
  if(value!==confirmation)throw Error('Credential entries do not match');
  if(previous && current[kind]===value)throw Error('Replacement credential matches the old one; refusing fake rotation');
  current[kind]=value;
  const sealed=seal(current,passphrase);
  writeVault(sealed);
  const receipt=nonSecretReceipt(sealed,{action:previous?'rotate':'provision',changedKeys:[kind],previous});
  const receiptFile=saveReceipt(receipt);
  let gitCommit=null;
  const wantsCommit=opts.includes('--commit')||!!process.env.QUMI_CREDENTIAL_AUDIT_REPO;
  const repoArg=opts.find(x=>x.startsWith('--repo='));
  const auditRepo=repoArg?repoArg.slice(7):process.env.QUMI_CREDENTIAL_AUDIT_REPO;
  if(wantsCommit){
   if(!auditRepo)throw Error('Vault updated, but a Git commit requires --repo=/absolute/path or QUMI_CREDENTIAL_AUDIT_REPO; receipt remains locally saved');
   if(await yes('Commit NON-SECRET credential receipt to Git?'))gitCommit=commitReceipt(receipt,{repoRoot:auditRepo,confirmed:true});
  }
  console.log(JSON.stringify({ok:true,changed:kind,vaultEncrypted:true,receiptFile,gitCommit,
   oldProviderKeyRevoked:false,action_required:'Revoke prior exposed credential at Depot/GitHub and verify the new key; this program cannot revoke provider credentials.'}));
  process.exit(0);
 }
 if(action==='unlock-run'){
  const idx=process.argv.indexOf('--');if(idx<0||idx===process.argv.length-1)throw Error('Use unlock-run -- <program> <args...>');
  const old=readVault();if(!old)throw Error('No encrypted vault exists; provision a token first');
  const passphrase=await secretPrompt('Vault unlock passphrase (hidden)');
  const credentials=unseal(old,passphrase);
  const child=spawn(process.argv[idx+1],process.argv.slice(idx+2),{env:{...process.env,...credentials},shell:false,stdio:'inherit'});
  child.once('error',err=>{console.error(`Unable to run program: ${err.code||'error'}`);process.exitCode=1;});
  child.once('exit',(code,signal)=>{process.exitCode=signal?1:code||0;});
 }else{usage();process.exitCode=1;}
}catch(e){console.error(`Operator action failed: ${e.message}`);process.exitCode=1;}
