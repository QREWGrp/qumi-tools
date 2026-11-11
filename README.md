# QUMI Dev Tools — Depot Bridge

Official QUMI engineering plugin source for **QUMI Depot Bridge v0.4.0**.

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

## Status and licensing

Source-level tests have passed in local and simulated environments. GitHub repository publication does not establish authenticated Depot access or hosted MCP service availability. This repository retains its existing [MIT license](LICENSE) and its copyright notice.
