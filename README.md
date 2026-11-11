# QUMI Dev Tools — Engineering Bridges

Official QUMI engineering plugin source for **QUMI Depot Bridge v0.5.0**.

**Publisher:** Qumi Teknolojis, trading name of QROO Inc.  
**Developer:** Mohammed Mansour  
**Web:** https://qumi.app · https://qr-oo.com  
**Support:** support@qr-oo.com

## Codex marketplace

The repository is a Codex marketplace with the supported manifest at `.agents/plugins/marketplace.json`. In a compatible Codex installation:

```sh
codex plugin marketplace add QREWGrp/qumi-dev-tools
codex plugin marketplace list
```

Then select **QUMI Engineering → QUMI Depot Bridge** in the Plugins Directory and install the plugin. The plugin code lives in `plugins/qumi-depot-bridge/`. A repository marketplace is distinct from the separate ChatGPT public plugin directory.

## Depot CLI and MCP

The plugin provides a generic per-agent local MCP server. It can detect the installed Depot CLI, request approval to download and SHA-256 verify the official CLI release, install into a user or project-local tool directory, catalog installed commands, and execute policy-allowed operations. It also exposes build inspection tools through separately provisioned Depot API credentials/SDK and an optional operator-configured upstream MCP adapter.

From `plugins/qumi-depot-bridge/`, run:

```sh
node deploy/agent-setup.mjs detect
node deploy/agent-setup.mjs install --project
```

See [Codex setup](plugins/qumi-depot-bridge/deploy/CODEX-IMPORT.md), [Claude setup](plugins/qumi-depot-bridge/deploy/CLAUDE-IMPORT.md), and [operator guide](plugins/qumi-depot-bridge/README.md).

## Credentials: each user brings their own

No Depot tokens, Git tokens, encryption passphrases, personally hosted MCP URLs, or local binaries are bundled. An authorized operator provisions credentials privately in their environment using an approved secret manager or a hidden terminal command such as:

```sh
node deploy/operator-credentials.mjs provision DEPOT_TOKEN
```

For Git access provision `DEPOT_GIT_KEY` separately. A per-user encrypted vault is stored outside the repository. Audit receipts contain only non-secret encrypted-record fingerprints and must never contain plaintext, ciphertext, or hashes of raw tokens. Rotate leaked credentials at the issuer; a Git audit commit is **not** revocation.

Never paste secrets into chat, issue comments, PRs, MCP arguments, logs, or files in this public repository.

## QUMI IONOS Bridge (new)

A second marketplace plugin, [QUMI IONOS Bridge](plugins/qumi-ionos-bridge/README.md), dynamically discovers the full official **IONOS Hosting MCP** tool catalog. Agents can inspect and execute authorized tools for domains, DNS, SSL, webhosting, VPS, dedicated hosting and BSS; additional tools appear automatically as upstream MCP capabilities change. Optional Cloudflare MCP forwarding uses separate per-user credentials. Mutable operations require independent one-time operator approval.

No provider PAT, client domain, account, or personal MCP server URL is committed. See [the operator setup instructions](plugins/qumi-ionos-bridge/README.md).

## QUMI FLY BRIDGE (v0.1.0)

[QUMI FLY BRIDGE](plugins/qumi-fly-bridge/README.md) integrates Fly.io's official [OAuth MCP](https://mcp.fly.io) with agent-local flyctl installation, dynamic CLI help/command discovery, and plan-and-approve execution. It does not bundle personal Fly apps, organizations or tokens. Fly MCP tools are exposed dynamically by Fly.io and bounded by each operator's OAuth consent; the CLI execution surface requires separate authorization for changes.

See the [Codex setup](plugins/qumi-fly-bridge/deploy/CODEX-IMPORT.md) and [Claude setup](plugins/qumi-fly-bridge/deploy/CLAUDE-IMPORT.md). CLI tokens are provisioned privately using Fly auth login, a supported platform secret store, or the per-user encrypted vault.

## Unified encrypted credential questions — Windows, Linux, macOS

All three bridges now share the same **MCP URL-mode credential question** behavior.

| Bridge | Release | Per-user credentials |
|---|---|---|
| [Depot](plugins/qumi-depot-bridge/README.md) | 0.5.0 | DEPOT_TOKEN, DEPOT_API_KEY, DEPOT_GIT_KEY |
| [IONOS](plugins/qumi-ionos-bridge/README.md) | 0.2.0 | IONOS Hosting MCP PAT, optional Cloudflare MCP token |
| [Fly](plugins/qumi-fly-bridge/README.md) | 0.2.0 | Fly CLI API token; official Fly MCP uses OAuth |

Agents invoke the bridge credential-request tool when authentication is missing. Clients supporting MCP URL elicitation display a user question linking to a secure, per-user browser input. Other clients receive a temporary secure URL fallback. **The operator types the secret only in the protected browser page, never in chat or an MCP argument.** The page encrypts its answer using one-time RSA-OAEP/AES-GCM before local submission. The bridge persists AES-256-GCM/scrypt-encrypted credentials outside Git in the user profile. Only non-secret encrypted-record fingerprints may appear in audit receipts.

For remote/cloud agents, localhost on the agent host cannot be opened on the operator's machine. Use a separately deployed authenticated HTTPS credential portal or the agent platform's secret manager. Browser question styling remains controlled by Codex, Claude, or the current MCP client; the plugin cannot force identical native bubbles in every client.

Tests validate protocol URL elicitation, encrypted browser submission, and existing CLI/MCP regression behavior under Linux. Real provider authentication and Windows/macOS manual UI tests remain pending.

## Status and licensing

Source-level tests have passed in local and simulated environments. GitHub repository publication does not establish authenticated Depot access or hosted MCP service availability. This repository retains its existing [MIT license](LICENSE) and its copyright notice.
