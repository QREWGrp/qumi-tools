import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execute} from '../server/operations.mjs';

const before={...process.env};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qumi-depot-v03-'));
const depot=path.join(dir,'depot');
fs.writeFileSync(depot,`#!/bin/sh
if [ "$1" = "--help" ]; then
cat <<'TXT'
Depot example
Available Commands:
  build       Build image
  ci          Run CI
  list        List builds
  org         Organization
Flags:
  --help  Help
TXT
elif [ "$2" = "--help" ]; then
case "$1" in
ci) printf 'Available Commands:\\n  logs        View logs\\n  runs        CI runs\\n' ;;
list) printf 'Available Commands:\\n  builds      List builds\\n' ;;
*) printf 'No children\\n' ;;
esac
else
printf 'none\\n'
fi
`,{mode:0o700});
try{
 process.env.QUMI_DEPOT_CLI_PATH=depot;
 const scan=await execute('depot_cli_scan',{max_commands:30});
 assert.ok(scan.discoveredCommands.some(c=>c.command==='ci logs'),'CLI recursive help discovery');
 assert.ok(scan.discoveredCommands.some(c=>c.command==='list builds'),'CLI discovers command with policy');
 delete process.env.QUMI_DEPOT_UPSTREAM_MCP_URL;
 const upstream=await execute('depot_upstream_status');
 assert.equal(upstream.configured,false);
 await assert.rejects(()=>execute('depot_upstream_tools'),/No verified upstream MCP configured/);
 await assert.rejects(()=>execute('depot_upstream_call',{tool_name:'get_build'}),/allowlist/);
 process.env.QUMI_DEPOT_UPSTREAM_MCP_URL='http://127.0.0.1:9999/mcp';
 await assert.rejects(()=>execute('depot_upstream_status'),/clean HTTPS/);
 delete process.env.QUMI_DEPOT_UPSTREAM_MCP_URL;
 const git=await execute('git_askpass_status');
 assert.equal(git.gitKeyConfigured,false);
 assert.match(git.askpassFile,process.platform==='win32'?/git-askpass\.cmd$/:/git-askpass-unix\.sh$/);
 await assert.rejects(()=>execute('git_remote_probe'),/QUMI_CHECKOUT_ROOT/);
 console.log('PASS: recursive CLI discovery, upstream MCP fail-closed, Git askpass configuration contract');
}finally{
 for(const k of Object.keys(process.env))if(before[k]===undefined)delete process.env[k];
 Object.assign(process.env,before);fs.rmSync(dir,{recursive:true,force:true});
}
