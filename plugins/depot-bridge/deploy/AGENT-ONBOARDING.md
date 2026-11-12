# QUMI Depot agent onboarding — Codex / Claude / Replit / Depot

1. Install the private plugin package *inside the environment where the agent runs*. Node.js 20+ is required. No Windows VHost or Depot CLI installation is presumed.
2. Start the included `server/standalone-mcp.mjs --stdio` (see `mcp.json` for Codex or the separate Claude export). Call `initialize`, `tools/list`, `runtime_status` and `health`.
3. Set `QUMI_PROJECT_ROOT` to an absolute approved checkout path, `QUMI_DEPOT_PROJECT_IDS` to allowed projects. For a CLI install, the operator enables `QUMI_ALLOW_AGENT_CLI_INSTALL=1` and authorizes a `depot_cli_install_plan` before executing `depot_cli_install`. Install scope `project` writes only under `.qumi-tools/depot/bin`; `user` writes under `~/.qumi/depot-cli/bin`.
4. When auth is missing, use `credential_request` to ask operator for **approval to provision**, not for the actual token. The operator runs `node deploy/operator-credentials.mjs provision DEPOT_TOKEN`, `DEPOT_API_KEY`, or `DEPOT_GIT_KEY` in a private local terminal, or injects credentials through the agent platform's trusted secret manager. No chat message or MCP form should contain a secret.
5. To rotate an exposed token, revoke it at the provider, provision a fresh one and run `node deploy/operator-credentials.mjs rotate <KEYNAME> --commit --repo=<absolute-repo>` from a private interactive session. Review only the non-secret receipt commit. Confirm authentication works and old access is denied.
6. For SDK build tools, separately install the pinned dependencies from `server/package.json` in a networked environment using your dependency-review procedure. CLI tools and install workflows do not require npm dependencies.
7. CLI syntax is read from the actual installed version via `depot_cli_scan`/`depot_cli_help`. Agent instructions must not improvise flags, bypass approval policy, or print output from token commands.
8. For ChatGPT web and distributed clients without local stdio, separately host `server/standalone-mcp.mjs --http` behind HTTPS and identity-aware access; do not invent a Depot MCP URL. Confirm the MCP `tools/list` response in each target client.

Release gate: SOURCE_VERIFIED / LOCAL_MCP_PASS only until a real Depot build, authentication, agent-local installation, and agent-client connection are tested.
