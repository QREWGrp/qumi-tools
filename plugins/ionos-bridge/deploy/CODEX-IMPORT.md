# Codex marketplace import

The repository-backed marketplace in `QREWGrp/qumi-tools` declares this plugin at `plugins/ionos-bridge/`. For a compatible Codex release:

```bash
codex plugin marketplace add QREWGrp/qumi-tools
```

Open Plugins Directory → Engineering Bridges → IONOS Bridge. Installed source contains a cross-platform Node.js 20+ stdio MCP launcher; no fixed personal URL or PAT is packaged. The operator provisions their individual IONOS Hosting MCP endpoint and PAT securely via `ionos_secure_setup` (native masked Windows dialog, after operator permission), `node /absolute/plugin/path/bin/setup.mjs ionos`, or a host secret manager. After restarting the MCP process, call `ionos_bridge_status` then `ionos_discover_tools`.

Do not confuse a GitHub/Codex marketplace with a public ChatGPT hosted MCP connector; the latter requires its own authenticated HTTPS service.
