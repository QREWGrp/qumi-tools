# Import DEPOT Bridge into Claude Code

Use the separately distributed `depot-bridge-claude-v0.4.0.zip` export, NOT the Codex ZIP's `.mcp.json` directly. The Claude export uses `.claude-plugin/plugin.json` and a Claude-compatible root `.mcp.json` with `${CLAUDE_PLUGIN_ROOT}`.

1. Install the unpacked `depot-bridge` plugin via Claude Code's documented plugin installation flow. Ensure Node.js 20+ is in the agent environment.
2. Confirm the local MCP starts and registers `runtime_status`, `depot_cli_detect`, `depot_cli_install_plan`, `depot_cli_install`, `credential_request`, and build tools.
3. When operating on a Git project, inject absolute `QUMI_PROJECT_ROOT`, and Depot project restrictions `QUMI_DEPOT_PROJECT_IDS` through the agent's environment settings. Enable `QUMI_ALLOW_AGENT_CLI_INSTALL=1` **only** if operator has approved on-demand binary installation.
4. Ask the operator to provision secrets outside the conversation. On a private terminal run `node deploy/operator-credentials.mjs provision DEPOT_TOKEN`, or use the approved agent secret manager. To rotate use `rotate`, and optionally commit a non-secret receipt.
5. If API build lookups are needed, install the SDK dependencies from `server/package.json` in the agent environment. MCP initialization/CLI bootstrap requires only Node.

The local MCP server is not a separately published Depot MCP endpoint. For Claude cloud environments that cannot spawn stdio child processes, a trusted operator must provide an authenticated and verified HTTPS MCP endpoint. This export does not create one automatically.

Security: do not paste API keys or Git tokens into any Claude question/answer field; follow the MCP out-of-band secret-entry requirement.
