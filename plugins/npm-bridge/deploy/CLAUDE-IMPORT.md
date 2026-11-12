# NPM Bridge — Claude Code

Clone https://github.com/QREWGrp/qumi-tools into a directory under your control.

From the repository root, register the local stdio MCP server using a resolved absolute path:

`claude mcp add npm-bridge -- node /absolute/path/to/qumi-dev-tools/plugins/npm-bridge/server/index.mjs`

Confirm `npm_bridge_status` and `npm_command_catalog`. The bridge does not need a Windows VHost or a shared API key. Each Claude environment sets its own Node/npm binary and registry authorization. Tokens are requested through a secure URL-mode question or an approved secret manager; encrypted-vault storage is optional.
