# Import DEPOT Bridge into Codex

Use the `depot-bridge-v0.4.0.zip` plugin package. It includes a portable `plugin.json`/`mcp.json` and Codex compatibility `.codex-plugin/plugin.json`/`.mcp.json`. The MCP entrypoint is `node <PLUGIN_ROOT>/server/standalone-mcp.mjs --stdio`, with no npm dependencies needed for the handshake or CLI installation tools.

The agents must have Node.js 20+ and the plugin files in their execution environment. Call `runtime_status` first; use `depot_cli_detect` then a consented SHA-256 verified CLI installation (project or user). For official Depot API SDK calls, separately install dependencies under `server` and inject authorized Depot credentials through a secrets manager.

To provision a missing `DEPOT_API_KEY`, `DEPOT_TOKEN` or `DEPOT_GIT_KEY`, the agent must ask the operator a **non-secret question** and provide a private terminal setup command. No token may be entered as an ordinary Codex question answer. Optional Git evidence commits contain only encrypted ciphertext fingerprints and audit metadata.

If tools are missing, check that the plugin is **installed in the same Codex runtime** being used, that the MCP stdio process can start, and that the plugin is enabled. ChatGPT web requires a separately deployed, verified HTTPS MCP server.
