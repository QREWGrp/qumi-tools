/** Non-secret, per-agent unlock preference. The passphrase is NEVER persisted here. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const allowed=new Set(['saved_passwords','cloud_personal_vault']);
const agent=process.env.BRIDGE_AGENT_ID || process.env.CODEX_AGENT_ID || 'default';
if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(agent))throw Error('Invalid agent identity');
const base=()=>path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'bridge-vault-preferences');
const file=()=>path.join(base(),'fly-io-bridge'+'-'+agent+'.json');
export function setVaultPreference(choice){
 if(!allowed.has(choice))throw Error('Choose saved_passwords or cloud_personal_vault');
 const folder=base();fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const tmp=file()+'.'+process.pid+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify({version:1,source:choice,variable:'VAULT_PASSPHRASE'})+'\n',{mode:0o600,flag:'wx'});
 fs.renameSync(tmp,file());try{fs.chmodSync(file(),0o600);}catch{}
 return vaultPreferenceStatus();
}
export function vaultPreferenceStatus(){
 let source='not_selected';
 try{const x=JSON.parse(fs.readFileSync(file(),'utf8'));if(allowed.has(x.source))source=x.source;}catch{}
 return {source,variable:'VAULT_PASSPHRASE',cloud_injection_present:!!process.env.VAULT_PASSPHRASE,
  action:source==='cloud_personal_vault' && !process.env.VAULT_PASSPHRASE?'Add VAULT_PASSPHRASE in the current agent personal secrets vault; restart its MCP server':source==='saved_passwords'&&!process.env.VAULT_PASSPHRASE?'Use secure vault unlock question and password-manager autofill; an agent cannot silently read saved passwords':'ready_or_not_selected'};
}
