#!/usr/bin/env node
import {question} from './terminal.mjs';
import {launchWindowsDialog} from '../server/dialog.mjs';
import {encryptVault,saveVault,receiptFor,configFile} from '../server/config.mjs';
import fs from 'node:fs';
const provider=process.argv[2];
if(!['ionos','cloudflare'].includes(provider)){process.stderr.write('Usage: node bin/setup.mjs ionos|cloudflare\n');process.exit(2)}
try{
 if(process.platform==='win32'&&!process.argv.includes('--terminal')){
  const outcome=await launchWindowsDialog(provider);
  process.stdout.write(JSON.stringify(outcome)+'\n');
  process.exit(0);
 }
 const url=await question(`Official ${provider} HTTPS MCP endpoint URL (from your provider portal)`);
 const token=await question(`${provider} Personal Access Token (input hidden)`,{secret:true});
 const pass=await question('New vault encryption passphrase (input hidden; do not store in Git)',{secret:true});
 const pass2=await question('Confirm vault passphrase',{secret:true});
 if(pass!==pass2||pass.length<12)throw Error('Passphrases must match and have 12+ characters');
 const prior=fs.existsSync(configFile(provider));
 if(prior){const ok=await question('Replace locally encrypted credential? Type REPLACE');if(ok!=='REPLACE')throw Error('Refused replacement');}
 const record=encryptVault(provider,url,token,pass);const filename=saveVault(record);
 process.stdout.write(JSON.stringify({saved:true,provider,location:filename,receipt:receiptFor(record),next:'Inject VAULT_PASSPHRASE from your agent secret manager and restart its MCP server. Revoke exposed/old provider tokens at issuer.'},null,2)+'\n');
}catch(e){process.stderr.write('Setup failed: '+e.message+'\n');process.exitCode=1;}
