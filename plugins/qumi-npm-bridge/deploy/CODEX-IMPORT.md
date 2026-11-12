# QUMI NPM Bridge — Codex

Marketplace: https://github.com/QREWGrp/qumi-dev-tools at `main`.

In the Add marketplace UI, use source `https://github.com/QREWGrp/qumi-dev-tools`, Git ref `main`, and sparse paths `.agents/plugins` and `plugins` (or leave sparse paths empty).

Install **QUMI NPM Bridge** through QUMI Engineering. The MCP server is local `node ${PLUGIN_ROOT}/server/index.mjs`. Each engineer has their own npm credentials. Start with `npm_bridge_status`; then `npm_command_catalog`. Use an absolute project `cwd`, not `C:\Windows\system32`.

URL-mode elicitation securely asks the operator to enter the token in a protected browser page. **Session-only is the default.** The saved vault is strictly optional.

For local CLI marketplace refresh, use `codex plugin marketplace upgrade qumi-engineering` where supported. It cannot replace workspace admin GitHub auto-sync.
