# IONOS Bridge — 1.0.0-rc

**Start here:** [First-run setup: 1 → 2 → 3](FIRST-RUN.md). Install from the [Engineering Bridges Git marketplace](https://github.com/QREWGrp/qumi-tools), authorize through the secure operator question, then verify status before making changes.

**Vault unlocking:** Only the per-agent **`VAULT_PASSPHRASE`** is recognized for the release-candidate vault-unlock path. Choose **Saved Passwords** (operator-confirmed autofill, no silent agent access) or **Cloud Personal Vault** (configure `VAULT_PASSPHRASE` in the current agent's private secrets store). The UI does not directly write to a third-party vault. [Full security and migration guidance](FIRST-RUN.md).

---


**Publisher:** Qumi Teknolojis (trading name of QROO Inc.) · **Developer:** Mohammed Mansour  
**Sites:** https://qumi.app · https://qr-oo.com · **Support:** support@qr-oo.com  
**Source distribution:** Public under QREWGrp/qumi-tools; each user's accounts, endpoints and tokens are private.

## Purpose

Connect Codex, Claude Code, Replit and other MCP-enabled agents to the **official IONOS Hosting MCP** service, using dynamic discovery to support **every MCP tool** present in the user's authorized live account. The bridge does not hardcode any IONOS operation names, client domain names, subscription identifiers, or personal endpoints.

The IONOS Hosting MCP catalog currently covers Domains, DNS, SSL, Webhosting, CoreVPS, Dedicated Server and BSS. Operations are discovered by IONOS `tools/list` and invoked by `tools/call`; new provider tools become available without code modifications. The separate **IONOS Cloud** MCP server and its API tokens are not substitutes for IONOS Hosting MCP.

## First-time configuration (per agent identity)

**Prerequisite:** Node.js 20+; the agent client must be allowed to run a local MCP stdio process and reach the IONOS-hosted HTTPS MCP server over the network.

1. Sign in to the official [IONOS Hosting MCP portal](https://developer.hosting.ionos.com/mcp) and create a **Personal Access Token** with the minimum required tools/scopes. Copy the official hosted MCP URL from the portal's getting-started guide. Do not guess an endpoint.
2. In Codex, have the agent call `ionos_credential_request`, ask you for non-secret permission, then call `ionos_secure_setup` (Windows only). This opens a native Windows question dialog with masked token entry; it saves the endpoint and token using **Windows DPAPI CurrentUser** outside the repository. The same Windows account must run the MCP server. Alternatively, open a trusted **interactive local terminal** (not in an agent chat) and use an **absolute script path** or run from the extracted plugin directory:
   ```sh
   node bin/setup.mjs ionos
   ```
   On Windows this command launches the native masked DPAPI form; on macOS/Linux the helper asks for the hosted HTTPS MCP URL, secret PAT (hidden input), and an encryption passphrase (hidden input). The non-Windows AES-256-GCM vault stays in the individual user's external config directory (`~/.config/ionos-bridge/`), not in Git. Tokens are encrypted with a per-user passphrase (scrypt-derived key); their ciphertext commitment can be used for non-secret audit receipts.
3. On Windows with DPAPI there is **no vault passphrase to inject**; the encrypted record is only decryptable under the same Windows user. For cross-platform AES-256-GCM vaults, to allow an unattended MCP process to decrypt the vault, inject **`VAULT_PASSPHRASE` via your per-agent secrets manager**. Do not commit this passphrase in environment files or scripts. Alternatively inject `IONOS_MCP_URL` and `IONOS_PAT` through the agent platform's existing secure secret manager; those values are not written to disk by the bridge. Never include PATs on command lines or inside MCP JSON arguments.
4. Restart your agent's MCP process and call `ionos_bridge_status`, then `ionos_discover_tools`. This verifies current authorization without echoing credentials.

The bridge's `ionos_credential_request` tool asks a **nonsecret** permission question and identifies `ionos_secure_setup` as the next Windows action. The latter spawns an **OS-native masked question dialog**, not an MCP chat form. It cannot force the same UI in every MCP host. MCP in-band forms are **not appropriate for secret capture**; use the client's protected credential flow or local masked terminal helper.

## MCP tool access (full coverage, no hardcoded features)

The bridge always registers six stable tools:

- `ionos_bridge_status` — sanitized readiness and configuration source
- `ionos_credential_request` — nonsecret setup question, prompting the agent to request permission to open a local secure dialog
- `ionos_secure_setup` — launches Windows native masked credential dialog with DPAPI CurrentUser encryption; no tokens are returned through MCP
- `ionos_discover_tools` — all live upstream tools with search and pagination
- `ionos_describe_tool` — exact live schema, annotations and risk
- `ionos_invoke_tool` — passes validated arguments to any dynamically discovered upstream tool

Set `QUMI_IONOS_TOOL_MODE=eager` for clients that can accommodate all native tools. It registers each upstream tool as `ionos__<name>` or `cloudflare__<name>` from the **live** `tools/list` result, with original input schema. Default `dynamic` mode prevents tool-count overload and requires no change as IONOS adds new tools.

## Safe writes

Read-only requests are allowed using current tool hints and conservative name classification. All other operations **fail closed** until the operator approves the exact call with a private local terminal:

```sh
node bin/approve.mjs ionos <tool-name> --args-file /private/ionos-arguments.json
```

Enter `APPROVE` only after reading the exact JSON. The resulting one-time approval ID is bound to provider, tool, canonical argument SHA-256 digest, and 10-minute expiry; it is consumed before request dispatch. Use `ionos_invoke_tool` with `dry_run=true` to prepare the exact plan first. Never use a chat `approved:true` flag as an authority check. Some upstream providers enforce additional confirmation independently.

## Cloudflare, analytics, redirects, forwarding

IONOS MCP does **not automatically provide Cloudflare APIs** or website analytics. If needed, configure a **separate official or operator-approved Cloudflare MCP endpoint** and its access token using `node bin/setup.mjs cloudflare` or secure injected `QUMI_CLOUDFLARE_MCP_URL` and `QUMI_CLOUDFLARE_MCP_TOKEN`. `ionos_discover_tools` with provider `cloudflare` will then show the available Cloudflare tools, including analytics/redirects if the endpoint actually supports them. No Cloudflare API endpoints or token scopes are invented or hardcoded.

For migration, inventory DNS records, check authoritative nameserver delegation, capture pre-change backups, preserve email/security records, plan redirects vs DNS separately, obtain approval for writes and verify propagation/HTTP routing after cutover. A DNS CNAME or A record **is not itself an HTTP redirect**.

## Portable clients

- **Codex marketplace:** `.agents/plugins/marketplace.json` in `QREWGrp/qumi-tools`; install IONOS Bridge. The plugin's `mcp.json` uses `node ${PLUGIN_ROOT}/server/index.mjs` as a generic per-agent stdio launcher.
- **Claude Code:** import `.mcp.json` from this plugin with project-root paths adjusted to your checkout, or use `claude mcp add ionos-bridge -- node /absolute/path/to/plugin/server/index.mjs` in an approved environment.
- **Replit, Mastra, QAMAR:** launch the same stdio server and inject per-agent credentials via platform secret manager; no global VHost required.
- **ChatGPT web:** registering a local stdio plugin in a personal account does not make it reachable from ChatGPT web. A separate authenticated HTTPS MCP service and per-user delegated authentication would be required; no hosted endpoint is claimed by this package.

## Operational limitations

No live IONOS customer connection has been tested by the package author. New IONOS tools are discoverable if the provider publishes them on authenticated `tools/list`. REST endpoints not present in IONOS MCP are not silently fabricated. Upstream 401/403/429 errors, permissions and rate limits are surfaced to the caller without disclosing credentials.

**Documentation:** [IONOS Hosting MCP](https://developer.hosting.ionos.com/mcp), [IONOS Hosting API](https://developer.hosting.ionos.com/docs).

## Windows PowerShell / `MODULE_NOT_FOUND` recovery

`node bin/setup.mjs ionos` is a **relative** file path. It only works when your PowerShell working directory is the plugin root. Running it from `C:\WINDOWS\system32` attempts to load a nonexistent `system32\bin\setup.mjs`; it does not mean Node.js is broken.

To run from any directory, first clone the public source and call the **absolute** script path (the path can be changed to wherever Codex installed the plugin):

```powershell
$root = Join-Path $env:USERPROFILE 'QUMI\qumi-dev-tools'
if (!(Test-Path (Join-Path $root 'plugins\ionos-bridge\bin\setup.mjs'))) {
  git clone https://github.com/QREWGrp/qumi-tools.git $root
}
node (Join-Path $root 'plugins\ionos-bridge\bin\setup.mjs') ionos
```

The script now opens the native Windows masked input dialog; on Linux/macOS it prompts in the local terminal. For agents with the bridge MCP already connected, call `ionos_credential_request` then (with permission) `ionos_secure_setup`; no manual script path is necessary. Windows encrypted credentials are **not portable across Windows users**. **`GIT_ASKPASS` is exclusively for Git authentication; it is not the IONOS API credential mechanism.**

**Windows native UI acceptance:** implementation is reviewed and syntax-tested where possible, but must be exercised on an actual interactive Windows desktop before claiming a Windows runtime PASS. Never copy actual credentials into chat.


## Secure question (Windows, Linux, macOS)

When an agent needs a credential it calls its bridge credential-request tool. On an agent running on the operator's computer, the bridge starts a **single-use, five-minute loopback-only browser question** and returns a link. MCP clients advertising URL-mode elicitation see a native question/authorization prompt; other hosts receive the fallback link. The operator enters the credential, and their browser encrypts it with a one-time RSA-OAEP/AES-GCM envelope before submission. The bridge stores it again as AES-256-GCM ciphertext under the operator's home directory, outside Git. No key, passphrase or ciphertext is sent through MCP tool arguments, chat, stdout or a Git commit. The credential URL is valid only on the same machine hosting that agent.

For remote or cloud agents whose MCP process cannot be reached at localhost from the operator's browser, use an authenticated **HTTPS credential portal** bound to the operator's identity or the platform's secret manager instead. A localhost URL cannot magically bridge to another host. MCP clients determine whether and how they render URL elicitation; the plugin cannot force a specific Codex-style question bubble. The vault passphrase is needed for later agent access and must be supplied via the user-specific secret store; entering a token does not by itself establish an authenticated provider session.

The browser entry flow is optional for official third-party OAuth such as Fly MCP; for OAuth use the provider's sign-in consent dialog rather than soliciting a token.
