import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {getSecret,secretStatus,launchSecretSetup,sensitiveValues,redact} from './vault.mjs';
import {catalog as cliCatalog,help as cliHelp,scan as cliScan,cliRun} from './cli.mjs';
import {upstreamStatus,upstreamTools,upstreamCall} from './upstream.mjs';
import {gitAskpassStatus,gitRemoteProbe} from './git.mjs';
import {planInstall,installCli,locateCli} from './installer.mjs';
import {portableVaultStatus} from './portable-vault.mjs';

const runFile = promisify(execFile);
const jobs = new Map();
const maxOutput = 64000;
const compact = (obj) => JSON.stringify(obj, (_, val) => typeof val === 'bigint' ? val.toString() : val);

function sanitizeString(value, max=200) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f]/.test(value)) throw new Error('Invalid input text');
  return value;
}
async function token() {
  const val = process.env.DEPOT_TOKEN || process.env.DEPOT_API_KEY || await getSecret('DEPOT_TOKEN') || await getSecret('DEPOT_API_KEY');
  if (!val || !val.trim()) throw new Error('Depot token not configured on host (DEPOT_TOKEN or verified DEPOT_API_KEY)');
  return val;
}
function projectId(provided) {
  const allow = (process.env.QUMI_DEPOT_PROJECT_IDS || process.env.DEPOT_PROJECT_ID || '').split(',').map(x=>x.trim()).filter(Boolean);
  if (allow.length === 0) throw new Error('Set QUMI_DEPOT_PROJECT_IDS to approved Depot project IDs');
  const project = provided || process.env.DEPOT_PROJECT_ID || allow[0];
  sanitizeString(project,100);
  if (!allow.includes(project)) throw new Error('Project not in host allowlist');
  return project;
}
function errSafe(err) {
  return redact(String(err?.message || err || 'Operation failed')).slice(0,1200);
}
async function sdk() {
  let createClient;
  try {({createClient}=await import('@depot/sdk-node'));}
  catch {throw new Error('Depot SDK dependency is not installed in this agent runtime. Run npm install --ignore-scripts --prefix <plugin>/server from an approved environment, or use Depot CLI tools.');}
  return createClient({token:await token()});
}
function pageSize(n, ceiling=100) {return Math.min(Math.max(Number(n)||25,1),ceiling);}
function textResult(result) {
  let s = compact(result);
  s=redact(s);
  return s.length > maxOutput ? {truncated:true,maxBytes:maxOutput,excerpt:s.slice(0,maxOutput)} : JSON.parse(s);
}
function requireId(value) {return sanitizeString(value,128);}
function insideCheckout(root, relative) {
  if (!relative || path.isAbsolute(relative) || /^\\\\/.test(relative) || /[:\x00-\x1f]/.test(relative)) throw new Error('Only checkout-relative paths allowed');
  const resolved = path.resolve(root,relative);
  if (resolved !== root && !resolved.startsWith(root+path.sep)) throw new Error('Path escapes checkout');
  const actual = fs.realpathSync(resolved);
  const trueRoot = fs.realpathSync(root);
  if(actual !== trueRoot && !actual.startsWith(trueRoot+path.sep)) throw new Error('Symlink escapes checkout');
  return actual;
}
function checkoutRoot() {
  const p=process.env.QUMI_CHECKOUT_ROOT||process.env.QUMI_PROJECT_ROOT;
  if (!p || !path.isAbsolute(p)) throw new Error('QUMI_CHECKOUT_ROOT must be an absolute directory');
  const root=path.resolve(p);
  if (!fs.existsSync(path.join(root,'.git'))) throw new Error('Checkout must contain .git');
  return root;
}
async function buildEnv(p) {
  const env={};
  for (const key of ['PATH','Path','HOME','USER','TMPDIR','XDG_CONFIG_HOME','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','HOMEDRIVE','HOMEPATH','COMSPEC','PATHEXT']) if(process.env[key]) env[key]=process.env[key];
  env.DEPOT_TOKEN=await token(); env.DEPOT_PROJECT_ID=p;
  env.DEPOT_NO_UPDATE_NOTIFIER='1'; env.DEPOT_NO_SUMMARY_LINK='1';
  return env;
}
async function checkout(expectedSha) {
  const root=checkoutRoot();
  const {stdout:head}=await runFile('git',['rev-parse','HEAD'],{cwd:root,windowsHide:true,timeout:12000});
  const {stdout:status}=await runFile('git',['status','--porcelain'],{cwd:root,windowsHide:true,timeout:12000});
  const sha=head.trim();
  const clean=status.trim().length === 0;
  if(expectedSha && sha !== expectedSha) throw new Error('Checkout SHA does not match approved_sha');
  return {root,sha,clean};
}
const depotExe = () => locateCli().resolved;
async function depotVersion(){
  const {stdout,stderr}=await runFile(depotExe(),['--version'],{windowsHide:true,timeout:15000,env:{...process.env,DEPOT_TOKEN:''}});
  return {version:(stdout||stderr).trim().slice(0,350)};
}

async function readBuild(args) {
  const client=await sdk();
  switch(args.operation){
    case 'list_projects': {const all=(await client.core.v1.ProjectService.listProjects({})).projects||[]; return textResult({projects:all.filter(p=>{try{projectId(p.id||p.projectId);return true;}catch{return false;}})});}
    case 'list_builds': {
      const r=await client.core.v1.BuildService.listBuilds({projectId:projectId(args.project_id),pageSize:pageSize(args.page_size),pageToken:args.page_token || undefined});
      return textResult({builds:r.builds || [],nextPageToken:r.nextPageToken || null});
    }
    case 'get_build': {
      const b=(await client.core.v1.BuildService.getBuild({buildId:requireId(args.build_id)})).build;
      const owner=b?.projectId || b?.project?.id;
      if(!owner) throw new Error('Cannot establish build project ownership from SDK result; refusing disclosure');
      projectId(owner);
      return textResult({build:b});
    }
    case 'get_build_steps': {
      const r=await client.build.v1.BuildService.getBuildSteps({projectId:projectId(args.project_id),buildId:requireId(args.build_id),pageSize:pageSize(args.page_size),pageToken:args.page_token||undefined});
      return textResult({steps:r.steps || r.buildSteps || [],nextPageToken:r.nextPageToken || null});
    }
    case 'get_build_step_logs': {
      const r=await client.build.v1.BuildService.getBuildStepLogs({projectId:projectId(args.project_id),buildId:requireId(args.build_id),buildStepDigest:requireId(args.step_digest),pageSize:pageSize(args.page_size),pageToken:args.page_token||undefined});
      return textResult(r);
    }
    case 'get_build_bundle': {
      const pid=projectId(args.project_id);const bid=requireId(args.build_id);
      const b=(await client.core.v1.BuildService.getBuild({buildId:bid})).build;
      const owner=b?.projectId || b?.project?.id;
      if(!owner||owner!==pid)throw new Error('Build does not belong to requested allowlisted project');
      const p=await client.build.v1.BuildService.getBuildSteps({projectId:pid,buildId:bid,pageSize:pageSize(args.page_size,20),pageToken:args.page_token||undefined});
      const steps=(p.steps||p.buildSteps||[]).slice(0,20);
      const logs=[];
      for(const step of steps){
        const digest=step.digest||step.buildStepDigest;
        if(!digest){logs.push({warning:'No step digest available',step:step.name||null});continue;}
        const lines=await client.build.v1.BuildService.getBuildStepLogs({projectId:pid,buildId:bid,buildStepDigest:digest,pageSize:100});
        logs.push({digest,data:lines});
      }
      return textResult({build:b,steps,logs,nextStepPageToken:p.nextPageToken||null,limits:'At most 20 steps, one 100-line log page per step, 64KB response; use paginated tools for more'});
    }
    default:throw new Error('Unknown SDK operation');
  }
}
function saveJob(file, body){const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(body,null,2));fs.renameSync(tmp,file);}
async function startBuild(args){
  if(process.env.QUMI_ALLOW_BUILDS !== '1') throw new Error('Host is read-only. Set QUMI_ALLOW_BUILDS=1 only after controlled approval.');
  const approvedSha=requireId(args.approved_sha);
  if(!/^[0-9a-f]{40}$/.test(approvedSha)) throw new Error('approved_sha must be full 40-character Git SHA');
  const state=await checkout(approvedSha);
  if (!state.clean) throw new Error('Checkout is dirty; freeze a clean candidate before building');
  const pid=projectId(args.project_id);
  const context=insideCheckout(state.root,args.context||'.');
  const dockerfile=insideCheckout(state.root,args.dockerfile||'Dockerfile');
  if(!fs.statSync(context).isDirectory())throw new Error('Context must be directory');
  if(!fs.statSync(dockerfile).isFile())throw new Error('Dockerfile missing');
  const tags=[];
  if(args.tag){const tag=sanitizeString(args.tag,200);if(!/^[A-Za-z0-9][A-Za-z0-9._:\/-]*$/.test(tag))throw new Error('Unsupported image tag');tags.push('--tag',tag);}
  const platform=args.platform||'linux/amd64';
  if(!['linux/amd64','linux/arm64','linux/amd64,linux/arm64'].includes(platform))throw new Error('Unsupported platform');
  const evidenceRoot=process.env.QUMI_DEPOT_EVIDENCE_DIR || path.join(path.dirname(state.root),'qumi-depot-evidence');
  if(!path.isAbsolute(evidenceRoot))throw new Error('Evidence directory must be absolute');
  fs.mkdirSync(evidenceRoot,{recursive:true});
  const jobId=crypto.randomUUID(); const logFile=path.join(evidenceRoot,`${jobId}.log`); const recordFile=path.join(evidenceRoot,`${jobId}.json`);
  const cliArgs=['build','--project',pid,'--progress=plain','--file',dockerfile,'--platform',platform,...tags,context];
  const metadata={jobId,status:'running',projectId:pid,sourceSha:state.sha,startedAt:new Date().toISOString(),dockerfile:args.dockerfile||'Dockerfile',context:args.context||'.',platform,tag:args.tag||null,logFile};
  const logStream=fs.createWriteStream(logFile,{flags:'wx',mode:0o600});
  const child=spawn(depotExe(),cliArgs,{cwd:state.root,env:await buildEnv(pid),shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const mask=data=>redact(data.toString('utf8'));
  child.stdout.on('data',chunk=>logStream.write(mask(chunk)));
  child.stderr.on('data',chunk=>logStream.write(mask(chunk)));
  jobs.set(jobId,metadata);saveJob(recordFile,metadata);
  let done=false;
  function finalize(status,exitCode,error=null){
    if(done)return; done=true;
    logStream.end(()=>{
      const hash=crypto.createHash('sha256').update(fs.readFileSync(logFile)).digest('hex');
      const result={...metadata,status,exitCode,finishedAt:new Date().toISOString(),logSha256:hash,error:error?errSafe(error):null};
      jobs.set(jobId,result);saveJob(recordFile,result);
    });
  }
  child.once('error',e=>finalize('failed',null,e));
  child.once('close',code=>finalize(code===0?'passed':'failed',code));
  return {jobId,status:'running',projectId:pid,sourceSha:state.sha,recordFile,logFile};
}
function jobResult(args){
  if(!/^[0-9a-f-]{36}$/.test(args.job_id||''))throw new Error('Invalid job ID');
  const evidenceRoot=process.env.QUMI_DEPOT_EVIDENCE_DIR || path.join(path.dirname(checkoutRoot()),'qumi-depot-evidence');
  const recordFile=path.join(evidenceRoot,`${args.job_id}.json`);
  const rec=jobs.get(args.job_id)||(fs.existsSync(recordFile)?JSON.parse(fs.readFileSync(recordFile,'utf8')):null);
  if(!rec)throw new Error('Unknown job');
  let recentLogs='';
  if(args.tail_lines){
    const count=Math.min(Math.max(Number(args.tail_lines)||0,1),120);
    const logfile=path.join(evidenceRoot,`${args.job_id}.log`);
    if(fs.existsSync(logfile)){
      const data=fs.readFileSync(logfile,'utf8');recentLogs=data.split(/\r?\n/).slice(-count).join('\n').slice(-16000);
    }
  }
  return {...rec,recentLogs};
}
function credentialRequest({credential='DEPOT_TOKEN',action='provision',reason='Depot integration requires a credential'}={}){
 if(!['provision','rotate'].includes(action))throw Error('Credential action must be provision or rotate');
 if(!['DEPOT_TOKEN','DEPOT_API_KEY','DEPOT_GIT_KEY'].includes(credential))throw Error('Unknown credential type');
 const base={status:'operator_input_required',credential_type:credential,reason,
  operator_question:`A fresh ${credential} is required. Please provision it through the secure operator-only vault; do NOT paste it into this chat.`,
  nonsecret_choices:['Provision new','Rotate exposed credential','Cancel'],
  local_command:`node deploy/operator-credentials.mjs ${action} ${credential}`,
  security:'MCP form elicitation cannot carry API tokens. Run the secure prompt locally or use an approved secret manager on the agent host.'};
 const raw=process.env.QUMI_CREDENTIAL_PORTAL_URL;
 if(!raw)return {...base,secure_portal_configured:false};
 let u;try{u=new URL(raw);}catch{throw Error('Credential portal URL is malformed');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('Credential portal must use a clean operator-approved HTTPS URL');
 return {...base,secure_portal_configured:true,secure_portal_url:u.toString(),
  note:'Use URL-mode elicitation if supported by the MCP client. The portal itself must authenticate the operator and bind any input to that identity.'};
}
async function execute(operation,args={},context={}){
  try {
    switch(operation){
      case 'health':{const secret=secretStatus();return {ok:true,mode:process.env.QUMI_ALLOW_BUILDS==='1'?'approved-builds':'read-only',configured:secret.configured,allowedProjects:(process.env.QUMI_DEPOT_PROJECT_IDS||process.env.DEPOT_PROJECT_ID||'').split(',').filter(Boolean),hasCheckout:!!process.env.QUMI_CHECKOUT_ROOT,cliMutationsEnabled:process.env.QUMI_DEPOT_CLI_MUTATIONS==='1',secrets:{configured:secret.configured,provider:secret.provider,hasGitKey:secret.keys?.DEPOT_GIT_KEY===true}};}
      case 'credentials_status':return {...secretStatus(),portableVault:portableVaultStatus()};
      case 'credential_request':return credentialRequest(args);
      case 'depot_cli_detect':return locateCli();
      case 'runtime_status':return {mcpTransport:'dependency-free stdio / stateless authenticated HTTP',node:process.version,cli:locateCli(),secrets:secretStatus(),portableVault:portableVaultStatus(),sdkAvailable:(()=>{try{import.meta.resolve('@depot/sdk-node');return true;}catch{return false;}})(),requiresDepotProjectAllowlist:true};
      case 'depot_cli_install_plan':return planInstall(args);
      case 'depot_cli_install':return installCli(args);
      case 'git_askpass_status':return gitAskpassStatus();
      case 'git_remote_probe':return gitRemoteProbe();
      case 'depot_upstream_status':return upstreamStatus();
      case 'depot_upstream_tools':return upstreamTools();
      case 'depot_upstream_call':return upstreamCall(args);
      case 'launch_secret_setup':return launchSecretSetup({remote:context.remote!==false});
      case 'depot_cli_catalog':return cliCatalog();
      case 'depot_cli_scan':return cliScan(args,{cliPath:depotExe});
      case 'depot_cli_help':return cliHelp(args,{cliPath:depotExe});
      case 'depot_cli_run':return cliRun(args,{projectId,checkout,runCli:async (argv,pid)=>{
        const env=await buildEnv(pid);let stdout='',stderr='',exitCode=0;
        try{const out=await runFile(depotExe(),argv,{cwd:checkoutRoot(),env,windowsHide:true,timeout:120000,maxBuffer:128*1024});stdout=out.stdout;stderr=out.stderr;}
        catch(e){stdout=e.stdout||'';stderr=e.stderr||errSafe(e);exitCode=typeof e.code==='number'?e.code:1;}
        return {stdout,stderr,exitCode};
      }});
      case 'verify_checkout':return checkout(args.approved_sha);
      case 'depot_cli_version':return depotVersion();
      case 'start_build':return startBuild(args);
      case 'build_job':return jobResult(args);
      default:return await readBuild({...args,operation});
    }
  }catch(e){throw new Error(errSafe(e));}
}
export {execute,errSafe};
