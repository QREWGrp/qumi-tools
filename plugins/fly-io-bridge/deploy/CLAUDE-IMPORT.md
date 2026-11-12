# Claude Code — Fly.io Bridge

Connect Fly's official MCP with browser-based OAuth:

```sh
claude mcp add --transport http --scope user fly-mcp https://mcp.fly.io
claude mcp login fly-mcp
claude mcp get fly-mcp
```

For the QUMI local flyctl tools, configure Claude Code to run `node` with an absolute path to `plugins/fly-io-bridge/server/index.mjs` in the cloned QUMI Dev Tools repository. Do not insert a personal directory into the public marketplace manifest; every operator uses their own checkout. The plugin's `.mcp.json` provides a portable example with `${PLUGIN_ROOT}` substitution supported by eligible hosts.

Claude web/desktop connects directly using `https://mcp.fly.io` under its custom connectors and does not run local Node tools from a remote chat. Scope grants in Fly OAuth, then review tools in Claude.
