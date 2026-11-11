# Codex marketplace import

The repository-backed marketplace in `QREWGrp/qumi-dev-tools` declares this plugin at `plugins/qumi-ionos-bridge/`. For a compatible Codex release:

```bash
codex plugin marketplace add QREWGrp/qumi-dev-tools
```

Open Plugins Directory → QUMI Engineering → QUMI IONOS Bridge. Installed source contains a cross-platform Node.js 20+ stdio MCP launcher; no fixed personal URL or PAT is packaged. The operator provisions their individual IONOS Hosting MCP endpoint and PAT securely via `node bin/setup.mjs ionos` or a host secret manager. After restarting the MCP process, call `ionos_bridge_status` then `ionos_discover_tools`.

Do not confuse a GitHub/Codex marketplace with a public ChatGPT hosted MCP connector; the latter requires its own authenticated HTTPS service.
