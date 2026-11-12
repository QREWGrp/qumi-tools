# NPM Bridge — 1.0.0-rc

**Start here:** [First-run setup: 1 → 2 → 3](FIRST-RUN.md). Install from the [Engineering Bridges Git marketplace](https://github.com/QREWGrp/qumi-tools), authorize through the secure operator question, then verify status before making changes.

**Vault unlocking:** Only the per-agent **`VAULT_PASSPHRASE`** is recognized for the release-candidate vault-unlock path. Choose **Saved Passwords** (operator-confirmed autofill, no silent agent access) or **Cloud Personal Vault** (configure `VAULT_PASSPHRASE` in the current agent's private secrets store). The UI does not directly write to a third-party vault. [Full security and migration guidance](FIRST-RUN.md).

---


**Developer:** Mohammed Mansour · **Publisher:** Qumi Teknolojis (trading name of QROO Inc.)  
**Website:** https://qumi.app · https://qr-oo.com · **Support:** support@qr-oo.com  
**Source:** https://github.com/QREWGrp/qumi-tools/tree/main/plugins/npm-bridge

## Purpose

A cross-platform, local MCP bridge for Codex, Claude Code, Replit, QAMAR, Mastra and other engineering agents to **discover and use the full npm CLI command surface installed in their environment**. It links to the [official npm CLI v11 reference](https://docs.npmjs.com/cli/v11/commands/) without freezing specific commands into the bridge. Actual available commands depend on the installed npm version (`npm --help`).

The agent can inspect dependencies, package metadata, audit output, npm version, workspaces, scripts, registry status, package publishing, organization permissions and other npm functions using the full CLI command surface, with guarded execution.

## Tools

| Tool | Role |
|---|---|
| `npm_bridge_status` | Detect OS, npm/Node versions and credential readiness (redacted) |
| `npm_command_catalog` | Parse every command advertised by the installed npm CLI |
| `npm_command_help` | Current CLI help and options |
| `npm_command_plan` | Exact command, argument list, working directory, risk and SHA-256 digest |
| `npm_command_run` | Run bounded CLI argv, with approval for mutations |
| `npm_credential_question` | Secure encrypted URL question, optional vault, unlock or clear; also official npm web-login guidance |
| `npm_credential_status` | Report session-only, vault-locked or existing-token status |
| `npm_cli_install_plan` | Prepare a scoped, approved npm@11 installation |
| `npm_cli_install` | Install npm@11 into a specified directory, if explicitly approved |

`npm config` token extraction and `npm token` administration are intentionally excluded from agent execution because they can expose or revoke credentials. Operators can use npm's official CLI for those operations directly. `npm run`, `npm exec`, package installs and publishing require exact operator approval because they can execute code or modify state.

## Credential question — optional storage by default

`npm_credential_question` asks the operator a question with a secure URL. An MCP client with URL-mode elicitation displays its own question UI; otherwise the bridge returns a loopback URL that can be opened on the same device as the MCP process. The secret is entered **in the protected page, not in chat**. Its WebCrypto RSA-OAEP/AES-GCM envelope is encrypted before submission to localhost and is decrypted only by the bridge process.

The operator explicitly chooses:

- **Current session only (default):** token held in process memory and discarded on process exit. No vault file is created.
- **Store encrypted for later:** token encrypted using AES-256-GCM and a scrypt-derived key, stored in the user's home config directory; only the operator's passphrase unlocks it in a future session.

A separate secure question supports **unlock** and **clear saved credentials**. No user data, token, custom registry, passphrase or locally resolved endpoint is hardcoded in the package. Existing npm login with `npm login --auth-type=web` is an alternative, but npm itself may persist auth in `.npmrc`.

**Remote agents:** a `127.0.0.1` link opened on an engineer's laptop cannot reach a cloud agent's localhost. Use a supported authenticated HTTPS credential portal or the agent platform's secret manager, not a forwarded unauthenticated localhost port.

## Installation, project selection, and approvals

Prerequisites: Node.js 20+ and npm installed on the agent host. Official installation: https://docs.npmjs.com/cli/v11/configuring-npm/install/. For npm v11, use a supported Node.js version. Check with `npm_bridge_status`.

The plugin's `mcp.json` and `.mcp.json` contain a generic local MCP `stdio` launcher: `node ${PLUGIN_ROOT}/server/index.mjs`. No Windows VHost or fixed user path is needed. The Engineering Bridges marketplace at `QREWGrp/qumi-tools` (`.agents/plugins/marketplace.json`) lists all four bridges: DEPOT, IONOS, Fly.io and NPM.

Specify an **absolute working directory** for each requested npm command. Operations do not silently run inside the plugin source directory. The run tool avoids an arbitrary OS shell: arguments are passed to the local npm executable as an array. On Windows it uses `node <installed npm-cli.js>` rather than an interpolated `npm.cmd` shell command.

For changes, use `npm_command_plan` to get the `operation` JSON. Save that non-secret object to a local JSON file; the operator reviews and approves it on their own terminal:

```sh
node bin/approve.mjs --plan-file /absolute/secure/plan.json
```

Then supply the resulting one-time approval ID to `npm_command_run` with *identical* command/args/cwd. The token expires after 10 minutes and is consumed on first use. This approval is a workflow gate, **not a hardened security boundary against a hostile agent with unrestricted local filesystem rights**. Running npm lifecycle scripts may execute arbitrary third-party code even without invoking a shell from the bridge. Use isolated CI and least privilege for sensitive workloads.

## Package manager setup and authentication

The CLI can query public npm packages without credentials. For authenticated operations, provide `authenticate:true` after secure provisioning. The bridge creates a short-lived private npmrc file containing an environment-variable **placeholder** for the token, scoped to the selected HTTPS registry, then removes that temporary file. It does not write the actual token into `.npmrc` or commit it to Git.

The npm CLI itself may execute package scripts or read project-specific configs; privileged actions are explicitly approved and should run in isolated engineering workspaces. The bridge blocks secret-reading configuration commands and arbitrary command-line registry/token overrides.

The `npm_cli_install_plan` / `npm_cli_install` tools can install `npm@11` as a user/project-local package with scripts disabled (requires an existing Node/npm and explicit approval). They do not install Node.js itself or modify system-owned npm by default.

## Distribution & acceptance

Published source should be installed through the Engineering Bridges Git marketplace, not the legacy personal plugin URL that previously returned 404 in Codex. Git pushes do **not** guarantee immediate refresh in an installed desktop client; use the supported marketplace upgrade/sync and restart MCP processes if required. Host-specific credential question UI is not identical in every client.

**Validation:** source-level MCP tests, simulated registry credential encryption, local execution and safety tests. Live npm publishing, actual Windows/macOS client UI, third-party registry access and automatic workspace sync must be verified under each engineer's own authorization.
