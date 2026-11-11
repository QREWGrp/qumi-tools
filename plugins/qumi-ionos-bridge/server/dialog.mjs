import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const script=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../bin/windows-secure-setup.ps1');
const providers=new Set(['ionos','cloudflare']);
/** Open a Windows desktop owned by the operator. The MCP process cannot read what the operator enters. */
export async function launchWindowsDialog(provider='ionos'){
 if(!providers.has(provider))throw Error('Unknown credential provider');
 if(process.platform!=='win32')throw Error('Secure desktop dialog requires Windows; use a local interactive terminal with node bin/setup.mjs');
 if(process.env.SESSIONNAME==='Services')throw Error('Credential dialog requires the operator interactive desktop, not a Windows service');
 const child=spawn('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',script,'-Provider',provider],{
  windowsHide:true,detached:true,stdio:'ignore',cwd:path.dirname(script),env:process.env
 });
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
 child.unref();
 return {launched:true,provider,interaction:'Windows local masked dialog',secret_handling:'DPAPI CurrentUser ciphertext outside Git',next:'Complete or cancel the Windows dialog, then call ionos_bridge_status and ionos_discover_tools. The same Windows user must run the MCP bridge.'};
}
