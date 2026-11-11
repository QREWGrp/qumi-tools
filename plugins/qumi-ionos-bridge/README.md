# QUMI IONOS Bridge v0.1.0

**Publisher:** Qumi Teknolojis (trading name of QROO Inc.) · **Developer:** Mohammed Mansour  
**Sites:** https://qumi.app · https://qr-oo.com · **Support:** support@qr-oo.com  
**Source distribution:** Public under QREWGrp/qumi-dev-tools; each user's accounts, endpoints and tokens are private.

## Purpose

Connect Codex, Claude Code, Replit and other MCP-enabled agents to the **official IONOS Hosting MCP** service, using dynamic discovery to support **every MCP tool** present in the user's authorized live account. The bridge does not hardcode any IONOS operation names, client domain names, subscription identifiers, or personal endpoints.

The IONOS Hosting MCP catalog currently covers Domains, DNS, SSL, Webhosting, CoreVPS, Dedicated Server and BSS. Operations are discovered by IONOS `tools/list` and invoked by `tools/call`; new provider tools become available without code modifications. The separate **IONOS Cloud** MCP server and its API tokens are not substitutes for IONOS Hosting MCP.

## First-time configuration (per agent identity)

**Prerequisite:** Node.js 20+; the agent client must be allowed to run a local MCP stdio process and reach the IONOS-hosted HTTPS MCP server over the network.

1. Sign in to the official [IONOS Hosting MCP portal](https://developer.hosting.ionos.com/mcp) and create a **Personal Access Token** with the minimum required tools/scopes. Copy the official hosted MCP URL from the portal's getting-started guide. Do not guess an endpoint.
2. Run in a trusted **interactive local terminal** (not in an agent chat):
   ```sh
   node bin/setup.mjs ionos
   ```
   The helper asks for the hosted HTTPS MCP URL, secret PAT (hidden input), and an encryption passphrase (hidden input). The saved AES-256-GCM vault stays in the individual user's external config directory (`~/.config/qumi-ionos-bridge/`), not in Git. Tokens are encrypted with a per-user passphrase (scrypt-derived key); their ciphertext commitment can be used for non-secret audit receipts.
3. To allow an unattended MCP process to decrypt the vault, inject **`QUMI_IONOS_VAULT_PASSPHRASE` via your per-agent secrets manager**. Do not commit this passphrase in environment files or scripts. Alternatively inject `IONOS_MCP_URL` and `IONOS_PAT` through the agent platform's existing secure secret manager; those values are not written to disk by the bridge. Never include PATs on command lines or inside MCP JSON arguments.
4. Restart your agent's MCP process and call `ionos_bridge_status`, then `ionos_discover_tools`. This verifies current authorization without echoing credentials.

The bridge's `ionos_credential_request` tool asks the nonsecret question **"Authorize IONOS Hosting MCP for this agent?"** and returns the secure setup instructions. It cannot force the same dialog UI in every MCP host. MCP in-band forms are **not appropriate for secret capture**; use the client's protected credential flow or local masked terminal helper.

## MCP tool access (full coverage, no hardcoded features)

The bridge always registers five stable tools:

- `ionos_bridge_status` — sanitized readiness and configuration source
- `ionos_credential_request` — nonsecret setup question
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

- **Codex marketplace:** `.agents/plugins/marketplace.json` in `QREWGrp/qumi-dev-tools`; install QUMI IONOS Bridge. The plugin's `mcp.json` uses `node ${PLUGIN_ROOT}/server/index.mjs` as a generic per-agent stdio launcher.
- **Claude Code:** import `.mcp.json` from this plugin with project-root paths adjusted to your checkout, or use `claude mcp add qumi-ionos-bridge -- node /absolute/path/to/plugin/server/index.mjs` in an approved environment.
- **Replit, Mastra, QAMAR:** launch the same stdio server and inject per-agent credentials via platform secret manager; no global VHost required.
- **ChatGPT web:** registering a local stdio plugin in a personal account does not make it reachable from ChatGPT web. A separate authenticated HTTPS MCP service and per-user delegated authentication would be required; no hosted endpoint is claimed by this package.

## Operational limitations

No live IONOS customer connection has been tested by the package author. New IONOS tools are discoverable if the provider publishes them on authenticated `tools/list`. REST endpoints not present in IONOS MCP are not silently fabricated. Upstream 401/403/429 errors, permissions and rate limits are surfaced to the caller without disclosing credentials.

**Documentation:** [IONOS Hosting MCP](https://developer.hosting.ionos.com/mcp), [IONOS Hosting API](https://developer.hosting.ionos.com/docs).
