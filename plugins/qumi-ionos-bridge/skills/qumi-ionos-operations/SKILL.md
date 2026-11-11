---
name: qumi-ionos-operations
description: Use when QUMI engineering agents need to discover, inspect or operate IONOS Hosting MCP tools, domain and DNS infrastructure, SSL, webhosting, VPS, or optional Cloudflare tooling, with individual credentials and governed mutation approvals.
---

# QUMI IONOS Bridge — Agent Operating Policy

1. First call `ionos_bridge_status` and describe missing credential or endpoint without ever requesting token plaintext in an agent chat.
2. If not configured, call `ionos_credential_request` to present the operator-facing question: *Would you like to connect your IONOS MCP account?* The operator chooses **Yes**, then enters official hosted MCP endpoint and PAT **only** in a private client secret configuration or `node bin/setup.mjs ionos` in a trusted terminal. Never collect a token in `ionos_invoke_tool`, chat, forms embedded in prompts, issues, Git, logs, commits, or a raw MCP elicitation message. Rotation must revoke issuer-side tokens separately.
3. Discover the **live upstream MCP catalog** with `ionos_discover_tools`; use `ionos_describe_tool` to inspect the current JSON input schema. All families, new tools, and changed schemas are discovered dynamically. Never assert that a given named tool exists unless the upstream returns it.
4. Default mode is five **meta-tools**, so clients with tool-count limits work. An operator may configure `QUMI_IONOS_TOOL_MODE=eager` to expose all upstream tools as namespaced native tools on `tools/list`, subject to the same permission gate.
5. Use `ionos_invoke_tool` with `dry_run=true` to show risk and exact argument digest before making changes. Known read-only tools can be called immediately. Mutations require operator approval **outside the agent**, via `node bin/approve.mjs ionos <tool> --args-file <trusted local JSON>`; the generated one-time approval ID is bound to provider, tool, exact arguments, and expiry. An agent may not self-approve.
6. For DNS changes, verify current zone/record, TTL and delegated nameservers; propose before/after records and a rollback plan, avoid CNAME conflicts and email MX/SPF/DKIM/DMARC disruption, and verify authoritative propagation after execution.
7. Cloudflare uses a **separate** configured provider MCP endpoint and token. Discover its tools dynamically with provider=`cloudflare`. Do not claim IONOS Hosted MCP directly manages Cloudflare. Treat analytics, redirects and forwarding as provider-capability-dependent until discovered.
8. On 401/403, ask the operator for the smallest extra PAT scope or rotation; on 429, honor limits and do not retry aggressively; never infer a successful mutation before checking the returned resource and read-back.
9. IONOS Hosting MCP is distinct from the IONOS Cloud MCP implementation. Never substitute Cloud credentials or Cloud MCP tools for Hosting MCP PATs.

## Required agent credential onboarding
When `ionos_bridge_status` reports missing credentials or `ionos_discover_tools` returns an authorization/configuration error: call `ionos_credential_request`; then ask the operator the **nonsecret** consent question, "May I open QUMI IONOS Bridge's local secure credential dialog?" If approved, call `ionos_secure_setup` on Windows, which spawns a password-masked Windows DPAPI dialog. After the operator finishes, call `ionos_bridge_status` and `ionos_discover_tools` again. If the agent host cannot display local windows, tell the operator to run `node /absolute/path/to/plugin/bin/setup.mjs ionos` in their interactive desktop session. Never ask operators to paste PATs, token values, vault passwords, Git keys or ciphertext into a chat question bubble. `GIT_ASKPASS` only handles Git remotes, not IONOS MCP bearer tokens. If credentials fail, stop and report a sanitized readiness problem rather than retrying blindly.


## Mandatory cross-platform secure questions

On missing credentials, invoke the bridge's credential question tool rather than sending the operator to a directory or asking for a token in chat.
The tool requests **MCP URL-mode elicitation** when the client supports it, otherwise provides a short-lived localhost secure question link for the operator.
Questions work with any Node.js 20+ agent runtime on Windows, Linux or macOS. The operator's browser encrypts each response before loopback submission; the agent stores per-user AES-256-GCM ciphertext under the home directory, outside Git, and reports only sanitized readiness.
The secure URL is reachable only from the machine running the agent MCP process. For remote/cloud agents, ask for an approved identity-bound HTTPS portal or use a supported platform secret manager; never pretend localhost reaches a remote desktop.
Never accept plaintext tokens, encryption passphrases, or answers to secret questions through ordinary MCP forms, tool arguments, chat, or Git. If the provider offers OAuth, prefer OAuth over token collection. Reconfirm any mutation and retain only non-secret audit commitments.
