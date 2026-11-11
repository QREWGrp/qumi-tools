# Codex — QUMI Fly bridge

1. `codex plugin marketplace add QREWGrp/qumi-dev-tools`
2. Install `qumi-fly-bridge` from the QUMI Engineering marketplace.
3. Enable the `qumi-fly-cli` stdio MCP entry, requiring Node.js >=20 on the executing agent host.
4. The plugin also declares the official `fly-official` MCP server; sign in with Fly's OAuth. If your Codex edition does not import remote MCP definitions automatically, run:
   ```sh
   codex mcp add fly-mcp --url https://mcp.fly.io
   codex mcp login fly-mcp
   codex mcp list
   ```
5. In a new session, ask the agent to run `fly_runtime_status`, enumerate CLI tools and inspect Fly MCP tools only after completing OAuth.

No repository-specific paths or credentials are included. The local MCP process inherits only operator/platform configuration. Do not paste API tokens in chat.
