---
name: npm-operations
description: Use NPM Bridge for governed npm CLI inventory, package dependency inspection, registry authorization, workspace installs, builds, package publishing, and npm administrative operations through an agent.
---

# NPM Bridge — engineering agent operating guide

1. Call `npm_bridge_status` first. Report actual Node/npm versions, platform, and whether token is session-only, vault-locked, or not configured. **Never invent npm v11 availability**; the local CLI version controls accepted commands.
2. Discover commands dynamically using `npm_command_catalog` and `npm_command_help`. Official npm v11 documentation: https://docs.npmjs.com/cli/v11/commands/. No static list of commands is sufficient for all npm versions.
3. Set `cwd` to the operator-approved absolute project directory. Never run from a system directory or the marketplace plugin directory by accident.
4. Plan exact commands using `npm_command_plan`. Read-only inspection such as `npm view`, `npm ls`, and `npm audit` can run without mutation approval if no mutating flags are supplied.
5. For installs, lifecycle scripts, `npm exec`/`npx`, publishing, role/token changes, or other writes: show the exact argv, cwd, and risk. Do not run until the operator has independently approved that exact plan using `node bin/approve.mjs --plan-file <file>`. Return only the approval ID, never secrets.
6. If registry access is needed, call `npm_credential_question`. Host MCP clients supporting URL elicitation display the secure question. Otherwise provide the protected localhost URL for an operator on the *same host*. Explain that a remote cloud agent requires a separate protected HTTPS portal or its own platform secret manager.
7. The operator chooses `Current session only` (default, **no vault file**), or `Store encrypted` (explicit opt-in, requires passphrase). A saved vault must be unlocked with a new secure question on subsequent sessions. No secret answer is ever entered into chat.
8. Use npm's native interactive `npm login --auth-type=web` as an alternative when an operator wants the official OAuth-style browser login, noting that npm itself writes authentication to `.npmrc` in that workflow.
9. For authenticated calls set `authenticate:true`, and keep tokens out of command arguments and logs. Do not use `npm config list`, `npm token`, or credential-exporting commands through MCP. Registry token is injected into an ephemeral npmrc *placeholder* referencing an environment variable and the temporary config file is removed after each invocation.
10. For releases: capture source SHA, npm/node versions, lockfile digest, exact command, exit status, reproducible build/test evidence, and publishing result. Prefer trusted publishing with OIDC and provenance where available. Do not claim a successful publish without a real receipt.

## Security and authority

The agent's MCP/CLI process only has the permissions of its operating-system user. This cooperative approval control is **not an OS security boundary** against an adversary already holding arbitrary execution or file-writing permissions as that user. Operators should use separate users, sandboxing, scoped tokens, and human-approved CI release workflows for sensitive package publishing.

Never commit `.npmrc`, vault files, tokens, or decrypted credentials. Never store tokens by default; explicit opt-in is mandatory. Browser-side encryption and localhost controls protect responses in transit but do not defend an already compromised agent machine. Revoke exposed npm tokens at the npm registry.
