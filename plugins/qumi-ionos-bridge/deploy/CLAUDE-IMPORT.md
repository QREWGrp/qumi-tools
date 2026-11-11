# Claude Code / Claude Desktop import

Use the package through a local MCP runtime, not a personal ChatGPT plugin catalog ID.

```bash
claude mcp add qumi-ionos-bridge -- node /ABSOLUTE/PATH/qumi-ionos-bridge/server/index.mjs
```

The operator must provision the official IONOS Hosting MCP URL and PAT privately with `node bin/setup.mjs ionos`, then inject the vault unlock passphrase through Claude's approved local secret configuration. Alternatively the two `IONOS_MCP_URL` and `IONOS_PAT` values may be injected securely by the host. Never place PATs in CLI arguments or a repository file.

Use `ionos_bridge_status`, `ionos_credential_request`, `ionos_discover_tools`, `ionos_describe_tool`, and `ionos_invoke_tool`. All upstream tools are discoverable at runtime, without a hardcoded per-tool list.
