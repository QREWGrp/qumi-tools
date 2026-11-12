import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {seal,writeVault,portableVaultStatus,sanitizedChildEnv} from '../server/portable-vault.mjs';

test('vault status requires authenticated decryption, not merely an environment variable',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'depot-vault-status-'));
 const formerFile=process.env.QUMI_PORTABLE_VAULT_FILE;
 const formerPassphrase=process.env.VAULT_PASSPHRASE;
 try{
  process.env.QUMI_PORTABLE_VAULT_FILE=path.join(dir,'vault.json');
  delete process.env.VAULT_PASSPHRASE;
  assert.equal(portableVaultStatus().configured,false);
  assert.equal(portableVaultStatus().locked,true);
  writeVault(seal({DEPOT_TOKEN:'synthetic-test-token-not-real'},'synthetic-test-passphrase-long'));
  assert.equal(portableVaultStatus().locked,true);
  process.env.VAULT_PASSPHRASE='incorrect-synthetic-passphrase';
  assert.equal(portableVaultStatus().locked,true);
  assert.equal(portableVaultStatus().unlock_verified,false);
  process.env.VAULT_PASSPHRASE='synthetic-test-passphrase-long';
  assert.equal(portableVaultStatus().locked,false);
  assert.equal(portableVaultStatus().unlock_verified,true);
 }finally{
  if(formerFile===undefined)delete process.env.QUMI_PORTABLE_VAULT_FILE;else process.env.QUMI_PORTABLE_VAULT_FILE=formerFile;
  if(formerPassphrase===undefined)delete process.env.VAULT_PASSPHRASE;else process.env.VAULT_PASSPHRASE=formerPassphrase;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('non-authentication child processes cannot inherit bridge credentials',()=>{
 const env=sanitizedChildEnv({HOME:'/tmp/operator',VAULT_PASSPHRASE:'fake-passphrase',
  DEPOT_TOKEN:'fake-depot-token',DEPOT_API_KEY:'fake-api-key',DEPOT_GIT_KEY:'fake-git-key',
  QUMI_MCP_BEARER_TOKEN:'fake-mcp-token'});
 assert.deepEqual(env,{HOME:'/tmp/operator'});
});
