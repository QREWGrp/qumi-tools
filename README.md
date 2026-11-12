# Engineering Bridges — Depot, IONOS, Fly.io, NPM
Four portable **1.0.0-rc** developer plugins distributed through the Git-backed marketplace in **QREWGrp/qumi-tools**.

**Developer:** Mohammed Mansour · **Publisher:** Qumi Teknolojis, trading name of QROO Inc.  
**Websites:** https://qumi.app · https://qr-oo.com · **Support:** support@qr-oo.com

| Plugin | First-run guide | Capabilities |
|---|---|---|
| [DEPOT Bridge](plugins/depot-bridge/README.md) | [1–2–3 setup](plugins/depot-bridge/FIRST-RUN.md) | Depot CLI installation/discovery, build SDK, logs, evidence and optional upstream MCP |
| [IONOS Bridge](plugins/ionos-bridge/README.md) | [1–2–3 setup](plugins/ionos-bridge/FIRST-RUN.md) | Dynamic IONOS Hosting MCP tool discovery, DNS, domains, SSL, hosting and optional Cloudflare |
| [Fly.io Bridge](plugins/fly-io-bridge/README.md) | [1–2–3 setup](plugins/fly-io-bridge/FIRST-RUN.md) | Official Fly OAuth MCP plus agent-local flyctl install, discovery and controlled execution |
| [NPM Bridge](plugins/npm-bridge/README.md) | [1–2–3 setup](plugins/npm-bridge/FIRST-RUN.md) | npm CLI command catalog and help, package operations and guarded registry actions |

## First run: 1 → 2 → 3

**1. Add the marketplace and install a bridge.** In Codex Settings → Plugins → Add marketplace choose:

- **Source:** `https://github.com/QREWGrp/qumi-tools`
- **Git ref:** `main`
- **Sparse paths:** `.agents/plugins` and `plugins` (two separate lines), or leave sparse paths empty.

The manifest is at `.agents/plugins/marketplace.json`. Select the requested bridge; no local credentials or fixed endpoints are shipped.

**2. Answer a private credential question.** The agent identifies the required provider token and requests an MCP URL-mode **secure question**. The operator answers in an encrypted browser input—not in chat. If saving an encrypted per-user vault, choose how to manage **`VAULT_PASSPHRASE`**:

- **Saved Passwords:** save it in an approved browser/OS password manager; future unlocks require operator-approved autofill or re-entry. The bridge cannot retrieve saved passwords silently. Temporary localhost ports may prevent automatic manager matching.
- **Cloud Personal Vault:** create a secret called **`VAULT_PASSPHRASE`** in this agent's own protected secrets configuration. The agent runtime reads it after secret injection; the bridge cannot directly write to an unconnected cloud vault. Never use a repository variable, chat message or plaintext file.

The choice is stored only as non-secret preference metadata in the operator profile, separated by bridge and `BRIDGE_AGENT_ID`. Actual tokens remain in provider-approved secret injection or agent-local encrypted storage. **NPM defaults to session-only tokens with no vault/passphrase.**

**3. Verify and operate.** Check MCP tool discovery, installed CLI and credential-readiness status. Make a read-only provider check before builds, DNS writes, deployment or publishing; mutations require separate exact-operation approval. No bridge installation or public source push proves live provider authentication.

## Client support and limitations

Local Node.js 20+ MCP works on Windows, Linux and macOS with authorized agent process access. Browser-based localhost questions work only when the browser and MCP server share a host; cloud agents must use their platform's protected secret manager or a deployed, authenticated HTTPS credential portal. URL-mode elicitation UI styling is owned by the client.

**The repo is public but credentials are private.** No API tokens, Git keys, vault passphrases, arbitrary customer domains or personal MCP URLs are bundled. Older encrypted vault files stay in their legacy per-user locations for seamless decryption after migration; do not commit them.

See [Migration and compatibility](MIGRATION.md), [Marketplace sync and updates](MARKETPLACE-SYNC.md) and [Security](SECURITY.md). The repository preserves its original MIT license and copyright notice.

**Release decision:** Source-level RC; native host UI, actual password-manager interoperability, automatic workspace sync and live provider authorization require separate acceptance.
