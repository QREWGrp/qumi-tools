import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {createPlan,loadPlan,consumeApproval,ensurePrivateDir} from './state.mjs';
import {findCli,spawnBounded} from './cli.mjs';

const GH='https://api.github.com/repos/superfly/flyctl/releases';
function assetSuffix(platform=process.platform,arch=process.arch){
 const osName={linux:'Linux',darwin:'macOS',win32:'Windows'}[platform];
 const cpu={x64:'x86_64',arm64:'arm64'}[arch];
 if(!osName||!cpu)throw Error(`Unsupported flyctl installer platform: ${platform}/${arch}`);
 return `${osName}_${cpu}.${platform==='win32'?'zip':'tar.gz'}`;
}
export function targetBin(scope,cwd=process.cwd()){
 if(!['project','user'].includes(scope))throw Error('Installation scope must be project or user');
 if(scope==='project')return path.join(cwd,'.qumi-tools','fly','bin');
 return process.platform==='win32'?path.join(os.homedir(),'AppData','Local','QUMI','fly','bin'):path.join(os.homedir(),'.local','share','qumi','fly','bin');
}
export function assetInfo(release,suffix){
 const assets=release.assets||[];
 const found=assets.filter(a=>typeof a.name==='string'&&a.name.endsWith('_'+suffix));
 if(found.length!==1)throw Error('Cannot identify a unique official flyctl release archive');
 const a=found[0];
 if(!a.digest||!/^sha256:[0-9a-f]{64}$/.test(a.digest))throw Error('Official release missing SHA-256 digest; refusing unverified install');
 if(!Number.isInteger(a.size)||a.size<1024||a.size>160*1024*1024)throw Error('Unexpected archive size');
 if(!/^https:\/\/github\.com\/superfly\/flyctl\/releases\/download\//.test(a.browser_download_url))throw Error('Untrusted asset URL');
 return {name:a.name,url:a.browser_download_url,size:a.size,sha256:a.digest.slice(7)};
}
export async function releasePlan({scope='project',version=null,project_dir=process.cwd()}={}){
 if(version!==null&&!/^v?\d+\.\d+\.\d+$/.test(version))throw Error('Version must be a numeric flyctl semver tag');
 if(!path.isAbsolute(project_dir))throw Error('project_dir must be absolute');
 const endpoint=version?`${GH}/tags/${version.startsWith('v')?version:'v'+version}`:`${GH}/latest`;
 const response=await fetch(endpoint,{headers:{'Accept':'application/vnd.github+json','User-Agent':'fly-io-bridge/0.1.0'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Unable to inspect official Fly release metadata ('+response.status+')');
 const release=await response.json();
 const tag=release.tag_name;
 if(!/^v\d+\.\d+\.\d+$/.test(tag))throw Error('Unexpected Fly release tag');
 const asset=assetInfo(release,assetSuffix());
 const dest=targetBin(scope,project_dir);
 const exe=path.join(dest,process.platform==='win32'?'fly.exe':'fly');
 if(fs.existsSync(exe))throw Error('flyctl already installed at target; no silent replacement is permitted');
 const plan=createPlan('install',{scope,project_dir,tag,asset,target:exe,summary:`Install official ${tag} ${asset.name} (SHA-256 ${asset.sha256}) to ${exe}`});
 return {plan_id:plan.id,expires_at:plan.expiresAt,version:tag,scope,asset:asset.name,sha256:asset.sha256,size_bytes:asset.size,target:exe,approval_required:true,operator_command:`node bin/approve.mjs ${plan.id}`};
}
async function download(asset,file){
 const url=new URL(asset.url);
 if(url.protocol!=='https:'||url.hostname!=='github.com'||!url.pathname.startsWith('/superfly/flyctl/releases/download/'))throw Error('Refusing download outside official Fly GitHub releases');
 const response=await fetch(url,{headers:{'User-Agent':'fly-io-bridge/0.1.0'},redirect:'follow',signal:AbortSignal.timeout(120000)});
 if(!response.ok||!response.body)throw Error('Fly release download failed: '+response.status);
 const finalUrl=new URL(response.url);
 if(finalUrl.protocol!=='https:')throw Error('Refusing insecure download redirect');
 // GitHub release asset redirects commonly target objects.githubusercontent.com.
 if(!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(finalUrl.hostname))throw Error('Unexpected release asset redirect host');
 const h=crypto.createHash('sha256');let n=0;
 const out=fs.createWriteStream(file,{flags:'wx',mode:0o600});
 const iterator=async function*(){for await(const part of Readable.fromWeb(response.body)){n+=part.length;if(n>asset.size||n>160*1024*1024)throw Error('Download exceeds verified release size');h.update(part);yield part;}};
 await pipeline(Readable.from(iterator()),out);
 if(n!==asset.size||h.digest('hex')!==asset.sha256)throw Error('Fly archive checksum or size mismatch');
}
async function tarExtract(archive,output){
 const list=await spawnBounded('tar',['-tzf',archive],{timeoutMs:20000,maxBytes:30000});
 if(list.exitCode!==0)throw Error('Cannot inspect flyctl release archive');
 const files=list.output.split(/\r?\n/).filter(Boolean);
 const executable=files.filter(f=>/(^|\/)flyctl?$/.test(f)&&!f.startsWith('/')&&!f.split('/').includes('..'));
 if(executable.length!==1)throw Error('Archive must contain exactly one flyctl executable');
 await new Promise((resolve,reject)=>{
  const child=spawn('tar',['-xOzf',archive,executable[0]],{shell:false,stdio:['ignore','pipe','pipe']});
  const dest=fs.createWriteStream(output,{flags:'wx',mode:0o700});
  let err='',code=null,finished=false,settled=false;
  const fail=e=>{if(!settled){settled=true;child.kill();dest.destroy();reject(e);}};
  const check=()=>{if(!settled&&finished&&code!==null){settled=true;code===0?resolve():reject(Error('Archive extraction failed: '+err));}};
  child.stderr.on('data',b=>{err+=b.toString().slice(0,300);});
  child.on('error',fail);dest.on('error',fail);
  dest.on('finish',()=>{finished=true;check();});
  child.on('close',c=>{code=c;check();});
  child.stdout.pipe(dest);
 });
}
async function zipExtract(archive,output){
 if(process.platform!=='win32')throw Error('Windows zip extraction only supported on Windows');
 const helper=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../bin/extract-windows.ps1');
 const result=await spawnBounded('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,'-Archive',archive,'-Target',output],{timeoutMs:30000,maxBytes:1000});
 if(result.exitCode!==0)throw Error('Verified ZIP extraction failed');
}
function ignoreProjectBinary(cwd){
 const file=path.join(cwd,'.git','info','exclude');
 if(fs.existsSync(file)){
  const now=fs.readFileSync(file,'utf8');
  if(!now.split(/\r?\n/).includes('/.qumi-tools/'))fs.appendFileSync(file,'\n/.qumi-tools/\n');
 }
}
export async function install({plan_id}){
 const p=loadPlan(plan_id);if(p.type!=='install')throw Error('Expected Fly CLI install plan');
 if(fs.existsSync(p.target))throw Error('flyctl target already exists; refusing overwrite');
 consumeApproval(p.id);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-fly-'));
 const archive=path.join(temp,p.asset.name),executable=path.join(temp,process.platform==='win32'?'fly.exe':'fly');
 try{
  await download(p.asset,archive);
  if(p.asset.name.endsWith('.tar.gz'))await tarExtract(archive,executable);else await zipExtract(archive,executable);
  if(!fs.statSync(executable).size)throw Error('Empty executable');
  if(process.platform!=='win32')fs.chmodSync(executable,0o700);
  const result=await spawnBounded(executable,['version'],{timeoutMs:15000,maxBytes:1500});
  if(result.exitCode!==0||!result.output.includes(p.tag.slice(1)))throw Error('Installed binary version did not match official release');
  ensurePrivateDir(path.dirname(p.target));
  fs.copyFileSync(executable,p.target,fs.constants.COPYFILE_EXCL);
  if(process.platform!=='win32')fs.chmodSync(p.target,0o700);
  if(p.scope==='project')ignoreProjectBinary(p.project_dir);
  return {installed:true,version:p.tag,location:p.target,verifiedSha256:p.asset.sha256,scope:p.scope,postInstall:'Run fly_runtime_status. Browser OAuth for Fly MCP is separate from flyctl auth login.'};
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
export function detectInstall(){
 const p=findCli();return {installed:!!p,executable:p,platform:process.platform,architecture:process.arch,project_dir:process.cwd(),officialMcp:'https://mcp.fly.io'};
}
