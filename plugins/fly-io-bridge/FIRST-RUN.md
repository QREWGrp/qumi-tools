# Fly.io Bridge — First-run setup (1 / 2 / 3)

**Release:** 1.0.0-rc  
**Publisher:** Qumi Teknolojis, trading name of QROO Inc.  
**Marketplace:** https://github.com/QREWGrp/qumi-tools  
**Platforms:** Windows, macOS, Linux; Codex, Claude Code, Replit, and compatible agent MCP hosts.

## 1. Install / enable

Open the Git-backed **Engineering Bridges** marketplace in your agent client (repository `QREWGrp/qumi-tools`, branch `main`, sparse paths `.agents/plugins` and `plugins`) and select **Fly.io Bridge**. The local MCP launcher runs with Node.js 20+ and uses your agent's own OS account. Check the plugin status and exposed tools before proceeding. No shared credential is bundled.

## 2. Connect with a secure question

Request a credential using the plugin's credential-question tool. The MCP client displays a URL-mode secure question if supported; otherwise the operator opens the short-lived localhost URL from the **same machine**. Enter tokens only in that protected form, never in chat, arguments, Git, issues or logs. The browser encrypts the response before local submission.

**Choose where to keep your agent-specific `VAULT_PASSPHRASE`:**

- **Saved Passwords:** Use the browser / OS password manager, subject to the manager's own save/autofill UI. This is an operator-approved unlock on each new agent session; the bridge **cannot silently read your password manager**. Temporary random localhost ports may prevent automatic autofill, so a manual saved entry might be necessary.
- **Cloud Personal Vault:** Add a secret named **`VAULT_PASSPHRASE`** to the **current agent's own secret variables**, scoped to that agent and not shared across accounts. The agent runtime reads only `process.env.VAULT_PASSPHRASE` after your secrets manager injects it. This plugin **does not have permission to write to an arbitrary cloud vault**; finish setup inside your provider's own vault UI and restart the agent.

The preference is stored as **non-secret metadata in the operator's home directory**, separately for each `BRIDGE_AGENT_ID` (default: `default`). Neither the vault password nor API tokens are copied to the preference file. Existing encrypted vaults remain in their legacy per-user locations so prior operators do not lose access.

If you choose Saved Passwords, call the bridge's credential question in **unlock** mode when `VAULT_PASSPHRASE` is unavailable. The passphrase is accepted via encrypted question, validated against the existing encrypted vault, and held only in this MCP runtime's memory. If you choose Cloud Personal Vault, the agent should first check its injected `VAULT_PASSPHRASE` and prompt only if it is missing or incorrect.

## 3. Verify and operate

Check bridge runtime and credential status without revealing secret values. Verify provider/CLI authorization with a **read-only operation**. Use command discovery and help before executing writes. Review the exact command and explicit one-time approval for installation, deployment, publication, DNS changes or any other mutation. Save non-secret evidence; never commit encrypted credential files to Git.

## Notes

This is a **release candidate**, not a claim of live provider authentication. Live cloud-agent secrets injection, browser password-manager interoperability, native Windows/macOS UI and provider acceptance require tests on the target client's real environment. Localhost URLs are not remotely reachable; a cloud agent needs a platform-provided secret manager or a separately authorized HTTPS credential portal.

**Fly difference:** The official Fly.io remote MCP uses OAuth; `VAULT_PASSPHRASE` is for optional encrypted Fly CLI token storage, not Fly OAuth.
