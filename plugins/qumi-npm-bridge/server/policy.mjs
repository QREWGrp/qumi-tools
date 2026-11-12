import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {configDir} from './vault.mjs';
function safeDir(cwd){
 if(typeof cwd!=='string'||cwd.length<2||!path.isAbsolute(cwd))throw Error('Specify an absolute project working directory');
 const dir=fs.realpathSync(cwd);if(!fs.statSync(dir).isDirectory())throw Error('Working directory must exist');
 if(path.parse(dir).root===dir || /[\\/]Windows[\\/]System32(?:[\\/]|$)/i.test(dir))throw Error('Refusing system or filesystem root directory');
 if(process.env.QUMI_NPM_ALLOWED_ROOT){const root=fs.realpathSync(process.env.QUMI_NPM_ALLOWED_ROOT);if(dir!==root&&!dir.startsWith(root+path.sep))throw Error('Working directory outside permitted root');}
 return dir;
}
export function normalized(command,args,cwd){
 if(!/^[a-z][a-z0-9-]{0,50}$/.test(command??''))throw Error('Invalid npm subcommand');
 if(!Array.isArray(args)||args.length>70||args.some(a=>typeof a!=='string'||a.length>2048||/[\x00-\x1f]/.test(a)))throw Error('Arguments must be bounded literal strings');
 if(args.some(a=>/(?:_authtoken|_auth\b|password|npm_token|--userconfig|--globalconfig|--otp|--registry|--config|--https?-proxy|--prefix=|--prefix$)/i.test(a)))throw Error('Credentials, custom config, registry overrides and prefixes are not accepted as CLI arguments; configure per-user credentials out of band');
 return {command,args,cwd:safeDir(cwd)};
}
export function risk(command,args){
 const c=command.toLowerCase();
 if(args.includes('--help')||args.includes('-h'))return 'read';
 if(['view','search','ls','ll','explain','outdated','query','ping','prefix','root','help','help-search','fund','bugs','docs','repo','stars','whoami','sbom','doctor'].includes(c))return 'read';
 if(c==='audit'&&!args.some(a=>a==='fix'||/^--fix(?:=|$)/.test(a)))return 'read';
 if(c==='pkg'&&['get'].includes(args[0]))return 'read';
 if(c==='run'&&args.length===0)return 'read';
 if(c==='config'&&args[0]==='get'&&['registry','cache','fund','audit','loglevel','omit'].includes(args[1])&&args.length===2)return 'read';
 return ['exec','run','run-script','start','stop','restart','test','install','ci','publish','unpublish','access','owner','token','login','adduser','profile','org','team','config','set'].includes(c)?'privileged':'change';
}
export function denyUnsafe(command,args){
 if((command==='config'||command==='get')&&!(command==='config'&&args[0]==='get'&&['registry','cache','fund','audit','loglevel','omit'].includes(args[1])&&args.length===2))throw Error('Potentially secret-revealing npm config operations are disabled in MCP; use native CLI under operator supervision');
 if(command==='token')throw Error('npm token management can reveal or revoke credentials; perform this only in a directly supervised npm terminal');
 if(['login','adduser','logout','whoami'].includes(command) && args.some(x=>x.startsWith('--auth-type')))throw Error('Authentication mode flags are not accepted through MCP');
}
export function digest(spec){const normalized={command:spec.command,args:spec.args,cwd:spec.cwd,risk:risk(spec.command,spec.args)};return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');}
function approvalsDir(){return path.join(configDir(),'approvals');}
export function createApproval(spec){const id=crypto.randomUUID();const doc={id,digest:digest(spec),expires_at:Date.now()+10*60*1000};fs.mkdirSync(approvalsDir(),{recursive:true,mode:0o700});fs.writeFileSync(path.join(approvalsDir(),id+'.json'),JSON.stringify(doc),{flag:'wx',mode:0o600});return {approval_id:id,expires_at:new Date(doc.expires_at).toISOString(),operation_sha256:doc.digest};}
export function consumeApproval(id,spec){if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))throw Error('This operation requires an exact operator approval ID');const file=path.join(approvalsDir(),id+'.json');let doc;try{doc=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('Approval not found');}fs.unlinkSync(file);if(doc.id!==id||doc.expires_at<Date.now()||doc.digest!==digest(spec))throw Error('Approval expired or does not match exact command, arguments, and working directory');return true;}
