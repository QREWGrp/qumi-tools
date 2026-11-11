/** Portable, source-verified Depot CLI installer. Never pipes remote code into a shell. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const API = 'https://api.github.com/repos/depot/cli/releases';
const RELEASE_PAGE = 'https://github.com/depot/cli/releases';
const plans = new Map();
const supported = {win32:'windows',darwin:'darwin',linux:'linux'};
const archs = {x64:'amd64',arm64:'arm64',ia32:'386',arm:'armv6'};
const MAX_ARCHIVE = 150 * 1024 * 1024;

export function platformSpec({platform=process.platform,arch=process.arch}={}) {
 const osName=supported[platform], cpu=archs[arch];
 if(!osName || !cpu || (osName==='darwin'&&!['amd64','arm64'].includes(cpu))) throw Error('Unsupported CLI platform/architecture');
 return {os:osName,arch:cpu,archiveExt:osName==='windows'?'zip':'tar.gz',binary:osName==='windows'?'depot.exe':'depot'};
}
function projectRoot(){
 const value=process.env.QUMI_PROJECT_ROOT || process.env.QUMI_CHECKOUT_ROOT;
 if(!value||!path.isAbsolute(value)) throw Error('Set absolute QUMI_PROJECT_ROOT or QUMI_CHECKOUT_ROOT for project installation');
 const root=fs.realpathSync(value);
 if(!fs.existsSync(path.join(root,'.git')))throw Error('Project scope requires a Git checkout');
 return root;
}
export function installationLocation(scope='user',spec=platformSpec()){
 if(scope==='user')return path.join(os.homedir(),'.qumi','depot-cli','bin',spec.binary);
 if(scope==='project')return path.join(projectRoot(),'.qumi-tools','depot','bin',spec.binary);
 throw Error('scope must be user or project');
}
export function locateCli(){
 const spec=platformSpec();
 const entries=[];
 if(process.env.QUMI_DEPOT_CLI_PATH){const f=process.env.QUMI_DEPOT_CLI_PATH;if(fs.existsSync(f))entries.push({source:'operator',path:f});}
 try{const f=installationLocation('project',spec);if(fs.existsSync(f))entries.push({source:'project',path:f});}catch{}
 const u=installationLocation('user',spec);if(fs.existsSync(u))entries.push({source:'user',path:u});
 if(process.platform==='win32'){const f='C:\\Program Files\\Depot\\bin\\depot.exe';if(fs.existsSync(f))entries.push({source:'windows-default',path:f});}
 return {resolved:entries[0]?.path||'depot',known:entries,platform:spec,installDocs:'https://depot.dev/docs/cli/installation'};
}
export function selectAsset(release,spec=platformSpec()){
 if(!release||typeof release.tag_name!=='string'||release.draft||release.prerelease)throw Error('Cannot use draft/prerelease or invalid Depot release');
 const version=release.tag_name.replace(/^v/,'');
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Unrecognized Depot release version');
 const name=`depot_${version}_${spec.os}_${spec.arch}.${spec.archiveExt}`;
 const asset=(release.assets||[]).find(a=>a.name===name);
 if(!asset)throw Error(`Official release does not include ${name}`);
 if(!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||''))throw Error('Official GitHub asset does not publish a SHA-256 digest; refusing unverified download');
 const u=new URL(asset.browser_download_url);
 if(u.protocol!=='https:'||u.hostname!=='github.com'||!u.pathname.startsWith('/depot/cli/releases/download/')||u.username||u.password)throw Error('Unexpected Depot release asset URL');
 if(Number(asset.size)<1||Number(asset.size)>MAX_ARCHIVE)throw Error('Unexpected Depot CLI archive size');
 return {tag:release.tag_name,version,name,url:u.toString(),sha256:asset.digest.slice(7).toLowerCase(),size:asset.size};
}
async function json(url){
 const response=await fetch(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'qumi-depot-bridge/0.4.0'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`GitHub release metadata request failed (${response.status})`);
 return response.json();
}
export async function planInstall({scope='project',version}={}){
 const spec=platformSpec();
 if(version && !/^v?\d+\.\d+\.\d+$/.test(version))throw Error('Version must be an exact semver (not an arbitrary tag)');
 const apiUrl=version?`${API}/tags/${encodeURIComponent(version.startsWith('v')?version:`v${version}`)}`:`${API}/latest`;
 let release;
 try{release=await json(apiUrl);}catch(e){if(version){release=await json(`${API}/tags/${encodeURIComponent(version.replace(/^v/,''))}`);}else throw e;}
 const asset=selectAsset(release,spec), destination=installationLocation(scope,spec);
 const planId=crypto.randomUUID();
 const expires=Date.now()+15*60*1000;
 plans.set(planId,{asset,scope,destination,expires});
 return {plan_id:planId,expires_at:new Date(expires).toISOString(),scope,destination,installed:locateCli().known,
  release_version:asset.version,download_source:asset.url,archive_sha256:asset.sha256,archive_bytes:asset.size,
  requires_approval:true,host_install_policy:process.env.QUMI_ALLOW_AGENT_CLI_INSTALL==='1',
  note:'Operator approval and QUMI_ALLOW_AGENT_CLI_INSTALL=1 required. The installer verifies GitHub asset SHA-256 and never pipes downloaded scripts into a shell.'};
}
async function download(asset,file){
 const response=await fetch(asset.url,{headers:{'User-Agent':'qumi-depot-bridge/0.4.0'},signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error(`Depot download failed (${response.status})`);
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;if(length>MAX_ARCHIVE)throw Error('Depot archive exceeds maximum size');chunks.push(chunk);}
 const data=Buffer.concat(chunks);const digest=crypto.createHash('sha256').update(data).digest('hex');
 if(digest!==asset.sha256)throw Error('Depot archive SHA-256 mismatch; refusing installation');
 fs.writeFileSync(file,data,{mode:0o600});return digest;
}
function listExtracted(base){
 const found=[];
 function walk(d,depth){if(depth>6)throw Error('Unexpected archive depth');for(const ent of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,ent.name);
  if(ent.isSymbolicLink())throw Error('Archive contains symbolic link');
  if(ent.isDirectory())walk(p,depth+1);else if(ent.isFile())found.push(p);else throw Error('Unexpected release archive entry');
 }}walk(base,0);if(found.length>100)throw Error('Archive contains too many files');return found;
}
function extract(archive,folder){
 const tar=execFileSync('tar',['-tf',archive],{encoding:'utf8',timeout:20000,maxBuffer:256*1024});
 const entries=tar.split(/\r?\n/).filter(Boolean);
 if(entries.length>100||entries.some(x=>x.startsWith('/')||x.startsWith('\\')||x.split(/[\\/]/).includes('..')||x.includes(':')))throw Error('Unexpected archive paths');
 execFileSync('tar',['-xf',archive,'-C',folder],{timeout:45000,maxBuffer:16*1024});
}
function ignoreWorkspaceTools(){
 const root=projectRoot();
 let gitPath=execFileSync('git',['rev-parse','--git-path','info/exclude'],{cwd:root,encoding:'utf8',timeout:8000}).trim();
 if(!path.isAbsolute(gitPath))gitPath=path.join(root,gitPath);
 fs.mkdirSync(path.dirname(gitPath),{recursive:true});
 const previous=fs.existsSync(gitPath)?fs.readFileSync(gitPath,'utf8'):'';
 if(!previous.split(/\r?\n/).includes('/.qumi-tools/'))fs.appendFileSync(gitPath,`${previous.endsWith('\n')?'':'\n'}# Local Depot CLI binary (untracked)\n/.qumi-tools/\n`);
}
export async function installCli({plan_id,approved=false,replace_existing=false,approval_id}={}){
 if(process.env.QUMI_ALLOW_AGENT_CLI_INSTALL!=='1')throw Error('Host policy QUMI_ALLOW_AGENT_CLI_INSTALL is disabled');
 if(approved!==true)throw Error('Explicit operator approval required for a CLI binary installation');
 if(process.env.QUMI_DEPOT_INSTALL_APPROVAL_ID && approval_id!==process.env.QUMI_DEPOT_INSTALL_APPROVAL_ID)throw Error('Operator install approval identifier does not match');
 const plan=plans.get(plan_id);
 if(!plan||plan.expires<Date.now())throw Error('Installation plan expired or not found; create a fresh plan');
 plans.delete(plan_id);
 const {asset,destination,scope}=plan;
 if(fs.existsSync(destination)&&!replace_existing)throw Error('Depot CLI is already installed at destination; replacement requires explicit opt-in');
 const stage=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-depot-'));
 try{
  const archive=path.join(stage,asset.name), out=path.join(stage,'extract');fs.mkdirSync(out);
  const digest=await download(asset,archive);extract(archive,out);
  const expected=platformSpec().binary;
  const files=listExtracted(out);
  const candidates=files.filter(f=>path.basename(f)===expected);
  if(candidates.length!==1)throw Error('Depot CLI archive has no unique expected executable');
  const destDir=path.dirname(destination);fs.mkdirSync(destDir,{recursive:true,mode:0o700});
  const staged=path.join(destDir,`.depot-${crypto.randomUUID()}.tmp`);
  fs.copyFileSync(candidates[0],staged);if(process.platform!=='win32')fs.chmodSync(staged,0o700);
  const binaryDigest=crypto.createHash('sha256').update(fs.readFileSync(staged)).digest('hex');
  if(scope==='project')ignoreWorkspaceTools();
  if(fs.existsSync(destination))fs.unlinkSync(destination);
  fs.renameSync(staged,destination);
  const receipt={schema:'qumi.depot.cli-install.v1',version:asset.version,source:asset.url,archive_sha256:digest,binary_sha256:binaryDigest,installed_at:new Date().toISOString(),scope,destination};
  fs.writeFileSync(path.join(destDir,'install-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  return {installed:true,...receipt,run:`${destination} --version`,path_mutated:false,repository_files_committed:false};
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
