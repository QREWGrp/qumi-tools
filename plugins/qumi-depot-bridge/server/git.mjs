/** Approved Git HTTPS operations; cross-platform GIT_ASKPASS. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {redact,secretStatus,getSecret,vaultDir} from './vault.mjs';
import {readVault,unseal} from './portable-vault.mjs';
const run=promisify(execFile);
const deploy=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../deploy');
const askpass=path.join(deploy,process.platform==='win32'?'git-askpass.cmd':'git-askpass-unix.sh');
const portableHelper=path.join(deploy,'git-askpass-portable.mjs');
const expectedRepo=(process.env.QUMI_GIT_APPROVED_REPO||'QREWGrp/qumi-suite').replace(/\.git$/i,'').toLowerCase();
function checkoutRoot(){const root=process.env.QUMI_CHECKOUT_ROOT||process.env.QUMI_PROJECT_ROOT;if(!root||!path.isAbsolute(root))throw new Error('Set absolute QUMI_CHECKOUT_ROOT or QUMI_PROJECT_ROOT');return root;}
function validateOrigin(remote){
 let u;try{u=new URL(remote);}catch{throw new Error('Git origin must be HTTPS');}
 if(u.protocol!=='https:'||u.hostname.toLowerCase()!=='github.com'||u.username||u.password||u.search||u.hash)throw new Error('Git origin host must be github.com without embedded credentials');
 if(u.pathname.replace(/^\//,'').replace(/\.git$/i,'').toLowerCase()!==expectedRepo)throw new Error('Git origin repository is not the approved QUMI repository');
 return u;
}
async function origin(){const {stdout}=await run('git',['remote','get-url','origin'],{cwd:checkoutRoot(),timeout:15000,windowsHide:true});return validateOrigin(stdout.trim());}
function gitKeyAvailable(){
 if(!!process.env.DEPOT_GIT_KEY)return true;
 try{if(readVault()&&process.env.QUMI_DEPOT_VAULT_PASSPHRASE)return !!unseal(readVault(),process.env.QUMI_DEPOT_VAULT_PASSPHRASE).DEPOT_GIT_KEY;}catch{}
 try{return process.platform==='win32'&&fs.existsSync(path.join(vaultDir(),'DEPOT_GIT_KEY.dpapi'));}catch{return false;}
}
async function gitEnv(){
 const portable=readVault();
 const unlocked=portable&&process.env.QUMI_DEPOT_VAULT_PASSPHRASE?unseal(portable,process.env.QUMI_DEPOT_VAULT_PASSPHRASE):{};
 const secret=process.env.DEPOT_GIT_KEY||unlocked.DEPOT_GIT_KEY||await getSecret('DEPOT_GIT_KEY');
 if(!secret)throw new Error('DEPOT_GIT_KEY is not provisioned in this agent environment; use operator-only credential provisioning');
 if(process.platform!=='win32')fs.chmodSync(askpass,0o700);
 return {...process.env,DEPOT_GIT_KEY:secret,GIT_ASKPASS:askpass,GIT_TERMINAL_PROMPT:'0',QUMI_GIT_ASKPASS_ACTIVE:'1',
  QUMI_NODE_EXEC:process.execPath,QUMI_GIT_ASKPASS_SCRIPT:portableHelper,
  GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'credential.https://github.com.username',GIT_CONFIG_VALUE_0:'x-access-token'};
}
export async function gitAskpassStatus(){
 return {provider:process.platform==='win32'?'environment or Windows DPAPI':'agent secret environment or unlocked AES-256-GCM vault',available:true,
  gitKeyConfigured:gitKeyAvailable(),askpassInstalled:fs.existsSync(askpass),askpassFile:askpass,repo:expectedRepo,
  manualProvisioningRequired:!gitKeyAvailable(),secretReturned:false,
  note:'Only approved Git HTTPS calls may invoke GIT_ASKPASS. Rotate Git credentials out-of-band; never send a token to an LLM.'};
}
export async function gitRemoteProbe(){
 const u=await origin();const env=await gitEnv();
 const {stdout}=await run('git',['-c','credential.helper=','ls-remote','--exit-code','origin','HEAD'],
  {cwd:checkoutRoot(),env,timeout:35000,windowsHide:true,maxBuffer:32768});
 const m=/^([0-9a-f]{40})\s+HEAD\s*$/m.exec(stdout);
 if(!m)throw new Error('Remote HEAD not in expected format');
 return {repository:u.origin+u.pathname,remoteHead:m[1],authenticated:true,tokenExposed:false};
}
