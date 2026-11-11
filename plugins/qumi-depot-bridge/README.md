# QUMI Depot Bridge — Private v0.4.0

**Publisher:** Mohammed Mansour · Qumi Teknolojis (trading name of QROO Inc.)  
**Websites:** https://qumi.app · https://qr-oo.com  
**Support:** support@qr-oo.com  
**Audience:** Internal QUMI engineering teams only. Not a public plugin.

## What is working, and what is not

This package contains a **dependency-free MCP transport** (`server/standalone-mcp.mjs`) that can run immediately with Node.js ≥ 20 under Codex, Claude Code, Replit, and other agents capable of launching a local MCP `stdio` process. It exposes 27 MCP tools. The agent environment must have these files and Node.js. ChatGPT web cannot magically execute a local MCP server on a remote machine: connect it to a **real, separately deployed, authenticated HTTPS** MCP endpoint to use from web chat. No hostname, Depot MCP upstream endpoint, or credentials are fabricated here.

The bridge includes three distinct integration surfaces:

1. **Depot CLI**: detect/install into the agent's own user directory or inside a Git workspace; recursively inspect every command in the locally installed `depot --help` tree; execute policy-approved commands, without arbitrary shell execution.
2. **Depot API**: call Depot's official `@depot/sdk-node` for builds, steps, logs and projects. The optional SDK dependency must be installed in the agent runtime before API tools can operate. Its absence does **not** prevent the MCP server or CLI installer from starting.
3. **Upstream MCP adapter**: connect to an independently verified/authorized HTTPS MCP server when `QUMI_DEPOT_UPSTREAM_MCP_URL` is configured by the operator. This is not a claim that Depot offers a universal first-party public MCP URL.

## Quick start: Codex (local or agent-provisioned)

1. Place this package in the Codex plugin directory or load it as an Agent Plugins package. Root `plugin.json` and `mcp.json` are the portable manifest. `.codex-plugin/plugin.json` and `.mcp.json` are compatible Codex overlays.
2. Ensure Node ≥20. The MCP starts through `node <plugin-root>/server/standalone-mcp.mjs --stdio`. **No npm install is required merely to obtain tools/list, CLI detection, CLI installation, or encrypted-vault guidance.**
3. Supply `QUMI_PROJECT_ROOT` or `QUMI_CHECKOUT_ROOT` (absolute path to authorized Git checkout), `QUMI_DEPOT_PROJECT_IDS` (comma-separated IDs) and an approved Depot credential through environment-specific secrets injection or operator vault unlock.
4. Call `runtime_status` → `depot_cli_detect` → if necessary `depot_cli_install_plan` → explicitly approve `depot_cli_install`, provided host policy `QUMI_ALLOW_AGENT_CLI_INSTALL=1` was enabled by the operator. Run `depot_cli_scan` and `depot_cli_help` to discover actual syntax. Read-only calls work only with their configured allowlists.
5. For `list_builds`, `get_build` and log tools install the SDK separately with `npm install --ignore-scripts --prefix <plugin-root>/server` in an approved networked environment. The package does not embed downloaded Node dependencies.

## Quick start: Claude Code

Download the **separate Claude Code variant** produced alongside this plugin. Its root `.mcp.json` follows Claude's name-to-server convention and uses `${CLAUDE_PLUGIN_ROOT}`. Its `.claude-plugin/plugin.json` identifies the Claude plugin. Do not simply copy the Codex `.mcp.json` into Claude; the shapes differ. With a manual MCP connection, point Claude at `node <absolute-plugin-root>/server/standalone-mcp.mjs --stdio`. For hosted agents ensure the plugin files exist and their MCP client permits local processes.

## Install Depot CLI in the agent environment (no Windows VHost)

Depot's official release channel is https://github.com/depot/cli/releases and installation documentation is https://depot.dev/docs/cli/installation. This bridge chooses an OS/architecture-specific official GitHub asset, verifies its **published SHA-256 digest** and archive size, then extracts only the expected executable. It does **not** use `curl | sh` and it does not silently replace an existing CLI.

Agent-facing tools:
- `depot_cli_detect`: source and path of a local, project, user or operator-installed binary.
- `depot_cli_install_plan`: determine scope (`project` or `user`), exact version, GitHub download source, digest, destination, and operator approval requirements.
- `depot_cli_install`: execute a short-lived plan with explicit `approved=true`, only if the agent host has `QUMI_ALLOW_AGENT_CLI_INSTALL=1`. A separate `QUMI_DEPOT_INSTALL_APPROVAL_ID` may be required by host policy. `replace_existing` must be explicit.
- `depot_cli_scan`, `depot_cli_help`, `depot_cli_run`: inspect and run locally installed commands. **All installed command help is discoverable, but execution is restricted by project, command and approval policies.**

The standalone operator command is:

```sh
node deploy/agent-setup.mjs detect
node deploy/agent-setup.mjs install --project
# Or: node deploy/agent-setup.mjs install --user --version=2.101.77
```

`--project` installs to `<QUMI_PROJECT_ROOT>/.qumi-tools/depot/bin/` and adds an entry only to `.git/info/exclude`, so normal Git status remains clean. `--user` installs under `~/.qumi/depot-cli/bin`. Installer returns an explicit binary path; PATH is not globally mutated. Project-local binaries and receipts are never added to Git commits.

## Operator question → protected entry → encryption → receipt commit

**Never ask the operator to paste a Depot token or Git key into a Codex/Claude/ChatGPT chat answer.** The MCP specification forbids collecting API keys through ordinary in-band form elicitation. Instead, the agent calls `credential_request` and asks a **non-secret question** like: “Provision/rotate DEPOT_GIT_KEY now? Please run the secure local terminal helper.” The user then enters the key privately in a terminal (characters hidden) or an approved out-of-band HTTPS credential portal if their organization has deployed one. A URL is only returned if `QUMI_CREDENTIAL_PORTAL_URL` is explicitly configured; this package does not claim to host that portal.

For a portable encrypted vault on macOS, Linux or Windows:

```sh
node deploy/operator-credentials.mjs provision DEPOT_TOKEN
node deploy/operator-credentials.mjs provision DEPOT_GIT_KEY
# Rotation of exposed credential + optional *non-secret* Git commit:
node deploy/operator-credentials.mjs rotate DEPOT_GIT_KEY --commit --repo=/absolute/path/to/approved/repository
```

Hidden input encrypts credentials with **AES-256-GCM** and a random salt/nonce, with a **scrypt passphrase-derived key**. The vault is outside the checkout by default, and on Unix uses mode `0600`. The master passphrase is entered privately at each operator unlock and **is not stored in Git**. Windows DPAPI provisioning remains supported as a legacy alternative.

For a specific operator-controlled session, unlock and launch an MCP process (or agent parent process) with ephemeral secrets injected only into that child process:

```sh
node deploy/operator-credentials.mjs unlock-run -- node server/standalone-mcp.mjs --stdio
```

Do this only where the operator can own the controlling terminal and MCP channel. For managed/sandboxed agents without that interaction, inject credentials through the platform's authorized secret manager instead. **The bridge cannot force a cloud agent to display the Codex “Question” dialog or obtain secrets invisibly from the operator.**

A rotation produces `qumi.depot.credential-receipt.v1` containing an event ID, timestamp, which credential was changed, and a SHA-256 commitment of the AES ciphertext (not the key or a direct hash of the key). The encrypted vault stays outside Git. When `--commit --repo=...` is chosen, or `QUMI_CREDENTIAL_AUDIT_REPO` is set to the approved checkout, the operator is asked to confirm `YES` and Git commits only `evidence/depot/credential-rotations/<event-id>.json`, after checking there are no staged changes. The new Git commit SHA is returned. **Revoking the previous token at Depot/GitHub and verifying the new token are separate mandatory operator steps.** The plugin cannot remotely revoke a provider's credential without permissions and a documented provider workflow.

## Git HTTPS authentication

The bridge uses `GIT_ASKPASS` only for an approved GitHub HTTPS origin and read-only `git ls-remote`. The helper never displays the token through MCP. It accepts `DEPOT_GIT_KEY` only from a secret injected into the controlled agent process (or Windows DPAPI) and never extracts it from Git history. Repository default is `QREWGrp/qumi-suite`; override explicitly with `QUMI_GIT_APPROVED_REPO`. It does not grant arbitrary Git shell operations to agents.

## MCP connectivity and supported clients

- **Codex:** portable `mcp.json` + root `plugin.json`, or Codex overlays.
- **Claude Code:** separate Claude export `.claude-plugin/plugin.json` + Claude-format `.mcp.json`.
- **Depot agents/Replit/Mastra/QAMAR:** use a local Node stdio process with the package installed in the agent environment, or separately deploy the dependency-free HTTP mode behind authenticated TLS (`node server/standalone-mcp.mjs --http`). Operator-managed `QUMI_MCP_BEARER_TOKEN` is mandatory in HTTP mode.
- **ChatGPT web:** only a verified reachable remote HTTPS MCP endpoint can expose this bridge; saving a personal plugin ZIP alone does not connect one.

All clients must verify `initialize`, `tools/list`, `health`, and an authorized Depot operation in their actual target environment. A successful local test does not prove any cloud agent is connected.

## Security and operations

- Never commit `.env`, raw credentials, vault ciphertext, master passphrases, GitAskPass output, or shell history containing secrets.
- No unattended `npm install`, CLI overwrite, release fallback to unverified archives, or remote arbitrary command interpreter.
- Host approval needed for CLI installation, write/mutate commands, and Git receipt commits. Sandbox execution must obey its own approval system.
- Exposed token rotation is incomplete until the old provider token is revoked and the replacement is tested.
- SDK package is separately installable; no dynamic direct Connect endpoint is guessed.
- Official installation: https://depot.dev/docs/cli/installation; official CLI reference: https://depot.dev/docs/cli/reference/overview; MCP elicitation specification: https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation.

## Tests

Run from plugin root: `node tests/smoke.mjs`, `node tests/integration-local.mjs`, `node tests/integration-mcp-v03.mjs`, `node tests/integration-v040.mjs`. The zero-dependency stdio MCP handshake can be verified with JSON-RPC `initialize` and `tools/list`. No live Depot API, real GitHub credential, or remote MCP endpoint was exercised by these tests.
