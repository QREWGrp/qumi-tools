# QUMI FLY BRIDGE v0.1.0

**Publisher:** Qumi Teknolojis, trading name of QROO Inc.  
**Developer:** Mohammed Mansour  
**Website:** https://qumi.app • https://qr-oo.com  
**Support:** support@qr-oo.com  
**Distribution:** QREWGrp/qumi-dev-tools → QUMI Engineering marketplace (public source, per-user credentials)

QUMI FLY BRIDGE combines **Fly.io's official OAuth remote MCP** with an independent local **flyctl** MCP tool server. It does not hardcode Fly organizations, apps, user identities, local paths, secrets, or a frozen set of Fly MCP tool names. The upstream Fly MCP is dynamically enumerated by the client; the CLI layer discovers commands through the installed binary's `--help` and lets agents plan any supported command with one-time operator approval for mutation/unknown commands.

## Architecture

| Component | Source | Authentication | Scope |
|---|---|---|---|
| `fly-official` | `https://mcp.fly.io` | Browser OAuth using Codex/Claude's MCP client | Apps, Machines, volumes, Sprites, Managed Postgres and more, subject to live server capabilities and consent |
| `qumi-fly-cli` | Local Node.js 20+ stdio MCP | Operator `fly auth login`, platform secret injection or AES-256-GCM local vault | Full installed flyctl command help and policy-approved CLI execution |

**Fly's official hosted MCP is not a complete mirror of every CLI command.** The two surfaces are intentionally complementary. Never assume the MCP supports a command solely because flyctl does.

The official endpoint is provider-wide and not personalized; **each user's OAuth session and CLI credentials are personalized**. Both connections can be installed independently.

## Quick installation

### Codex (marketplace)

```bash
codex plugin marketplace add QREWGrp/qumi-dev-tools
# Install 'QUMI FLY BRIDGE' from QUMI Engineering in the Plugins Directory
codex mcp add fly-mcp --url https://mcp.fly.io
codex mcp login fly-mcp
codex mcp list
```

The marketplace portable `mcp.json` declares **both** the official OAuth server and the local CLI server. You should not register duplicate names if the client already installed Fly MCP via the plugin. The explicit `codex mcp add` is an alternative for hosts that do not import remote declarations automatically.

### Claude Code

```bash
claude mcp add --transport http --scope user fly-mcp https://mcp.fly.io
claude mcp login fly-mcp
claude mcp get fly-mcp
```

For local flyctl tools, use the repo's `.mcp.json` as a template, or see [Claude import](deploy/CLAUDE-IMPORT.md). Claude web/desktop can add the official remote MCP as a custom connector; it cannot execute a local stdio process without an eligible local host.

### Fly CLI setup

The agent can call `fly_cli_install_plan` then request the operator to run `node bin/approve.mjs <plan-id>` privately. `fly_cli_install` downloads **only** official `superfly/flyctl` release binaries, requires the GitHub release's published SHA-256 digest, checks the byte count, extracts only the executable, and never silently overwrites a version. `project` scope installs under `.qumi-tools/fly/bin/` and adds that directory to `.git/info/exclude` if available; `user` scope installs under the user's local data directory. No global PATH mutation is performed.

Manual operator alternative: follow Fly's [official installation guide](https://fly.io/docs/flyctl/install/), or install with your operating system's package manager.

## Per-user credentials — no secrets in chat

**For official Fly MCP, no API key is required.** When an agent needs MCP access it asks: "Would you like to authorize your Fly.io organization through Fly's browser-based OAuth?" The operator consents directly in their client browser. Revoke consent under Fly Account → MCP Clients.

**For flyctl**, use `fly auth login` interactively or supply `FLY_API_TOKEN` using an approved agent secret manager. Operators who prefer an encrypted user-specific vault can run:

```bash
node bin/credentials.mjs store
```

The helper requests the token and passphrase using **hidden terminal input**, encrypts the value with AES-256-GCM using a random salt/nonce and scrypt-derived key, and stores a mode-0600 vault outside the Git worktree. The operator's passphrase is not stored or returned by MCP. Autonomous hosts may inject `QUMI_FLY_VAULT_PASSPHRASE` through their own secret store at startup; this is removed from the flyctl child process's environment. The bridge never accepts secret values as MCP tool arguments.

A local non-secret rotation receipt is written outside the repository. It records the hash of randomized ciphertext (never a direct hash of the raw token). Operator revocation at Fly is separately required if an old token is compromised. Never commit the vault, ciphertext, passphrase or raw token. Receipt commit, if desired, requires a separate operator-reviewed change.

The agent tool `fly_credential_request` returns a **question asking permission to connect**, never a form for entering tokens into chat. This works across Codex, Claude, and other clients even when the host has no custom elicitation UI.

## Agent workflow and tools

1. `fly_runtime_status` → local CLI detection, credential source presence, official MCP URL (does not assert live OAuth connection)
2. `fly_mcp_connection_guide` → connect and sign in through the client, then ask the client to list live Fly MCP tools
3. `fly_cli_install_plan` → inspect pinned Fly GitHub release + checksum; `fly_cli_install` only after operator approval
4. `fly_cli_catalog` / `fly_cli_help` → inspect **the installed fly binary** and subcommand syntax
5. `fly_cli_plan` → create a command plan; `fly_cli_execute` → execute safe reads or a one-time approved mutation
6. `fly_auth_whoami` → test CLI identity (may show a scoped token identity rather than a user)
7. `fly_agent_setup_guide` → `fly skills` and `fly setup agent` available after installation. These modify local agent configuration and must be approved.

CLI commands are spawned directly **without a shell**, output is bounded and redacted, and stdout is reserved for MCP JSON-RPC. Sensitive commands such as `fly auth token`, token creation and `fly secrets set` are refused through MCP: use a private operator terminal for these.

**Mutable operations are NOT auto-approved:** plan commands return an exact local plan and terminal approval path. Plans and approvals are local, expiring and one-time. The operator must not approve production changes without reviewing target app, organization, source SHA and rollback path.

## Known boundaries

- Live Fly MCP permissions are selected by the operator during OAuth; tool names and coverage can change. Direct server connection is the forward-compatible approach.
- Local CLI server can start without flyctl installed. `tools/list` must succeed first; installation and authentication are separate steps.
- ChatGPT web cannot run a local Node stdio bridge. It can connect directly to the official Fly MCP where the client supports custom OAuth MCP connectors. Cloud CLI execution needs a hosted, authenticated server operated by QUMI; this package does not invent one.
- The plugin repository itself does **not** automatically install itself for every engineer; the Codex/Claude client must select and enable it.
- Windows, Linux, macOS binaries are supported by the installer for x64 and arm64. Real cross-platform integration should be tested on each target OS; local simulated tests are not production authentication evidence.
- Successful source publication is not evidence of a live Fly account connection, deployment authorization, or passing production change gates.

## Sources

- [Fly agent changelog](https://fly.io/changelog/give-your-agent-the-fly-cli/)
- [Official Fly MCP](https://fly.io/mcp/)
- [Official flyctl releases](https://github.com/superfly/flyctl/releases)
- [Fly CLI documentation](https://fly.io/docs/flyctl/)
- [Fly API token authentication](https://fly.io/docs/flyctl/integrating/)
