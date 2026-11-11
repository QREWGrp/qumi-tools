> **v0.4.0 supersedes the Windows-only client assumptions below.** See the root README, `CODEX-IMPORT.md`, and `CLAUDE-IMPORT.md` for zero-dependency cross-platform stdio MCP and agent-local CLI installation. The sections below remain for legacy deployments.

# Agent clients

## Local MCP stdio (only where CLI/checkout exist)

Use the package's root `mcp.json` when the client supports portable plugin manifests. For clients that configure raw MCP servers, the equivalent (adapt to that client's syntax) is:

```json
{
  "mcpServers": {
    "qumi-depot-local": {
      "command": "node",
      "args": ["C:\\path\\to\\qumi-depot-bridge\\server\\index.mjs", "--stdio"]
    }
  }
}
```

The process uses the host environment's scoped Depot token and project allowlist. Do not add raw tokens to an agent's chat or into checked-in client configuration files.

## Remote MCP over HTTPS (preferred for distributed agents)

Start the bridge on the controlled Windows VHost and publish **the verified HTTPS `/mcp` endpoint** behind identity-aware access. Configure each client with its supported `streamable-http` transport, actual endpoint and trusted credential injection. Template:

```json
{
  "mcpServers": {
    "qumi-depot-remote": {
      "type": "streamable-http",
      "url": "https://REPLACE-WITH-VERIFIED-PRIVATE-FQDN/mcp"
    }
  }
}
```

The above is a deployment template, not a verified or deployed endpoint and is deliberately NOT part of the plugin's active `mcp.json`.

- **Codex**: configure a remote MCP server through the currently supported Codex configuration and credential store; verify discovered tools.
- **Claude**: register the HTTPS MCP endpoint using Claude's supported remote MCP integration, with organization access policy.
- **Replit**: configure a permitted HTTP MCP client/agent bridge from the Replit environment; Replit secrets must be scoped separately.
- **QUMI Mastra, Mastra Factory, QAMAR**: install an MCP HTTP client or their corresponding integration adapter; establish per-agent identity, tool call auditing and approvals for mutating tools.

Because client capabilities, policies, and remote-MCP syntax vary by deployment, the above is an integration contract, **not** proof that any of those clients is currently connected.

## Credential handoff

Use the existing Replit secret manager only to run an approved rotation/migration procedure. Do not read `DEPOT_GIT_KEY` or `DEPOT_API_KEY` from Git history or expose them to agents. Provision fresh VHost runtime credentials through an approved secret manager, and record secret IDs, not values, in the deployment ticket.

## v0.2.0 troubleshooting contract for any agent

Before attempting Depot access: call `health`, then `credentials_status` and `depot_cli_catalog`. For unknown CLI syntax use `depot_cli_help` with subcommand words such as `["projects", "list"]` or `["ci"]`. For recorded build diagnostics use `get_build_bundle` (bounded) or `get_build_steps`/`get_build_step_logs` (paged). Never send credential values in tool arguments. If no keys are configured, return a request for local Windows operator provisioning; do not attempt Git history extraction or repeatedly guess auth endpoints.

**Remote connectivity:** Agent MCP clients will not discover a Windows-local stdio server through this ChatGPT plugin. The VHost operator must deploy a real HTTPS endpoint with proxy identity policy and separately configure the clients. No verified endpoint was available at packaging time, so remote installation remains pending.


## v0.3 connection repair checklist

1. Install the MCP runtime dependencies under `server/` on the Windows VHost. `mcp.json` is **stdio** and can only spawn a Node process where the plugin files and runtime exist. A ChatGPT web chat cannot spawn the remote Windows process.
2. Run `deploy/provision-gitaskpass.cmd` on the VHost in an interactive desktop under the service identity. Configure both Git and Depot API credentials as encrypted DPAPI files. Never send a key as an MCP call argument or as a chat message.
3. Start the HTTP transport via `deploy/start-windows-bridge.cmd` after configuring `QUMI_MCP_BEARER_TOKEN`. Keep the built-in listener on `127.0.0.1`; expose it only behind a private TLS reverse proxy with authorized callers.
4. Use an MCP client to perform `initialize`, `tools/list`, and a `health` call against the *verified* remote HTTPS endpoint. Expect `health`, `list_builds`, `get_build`, `get_build_steps`, `get_build_step_logs`, `depot_cli_scan`, `git_askpass_status`, and upstream tools.
5. Register that endpoint in each supported client (ChatGPT, Codex, Claude, Replit, Mastra, Factory, QAMAR) using the client-specific MCP connection and credential store. Simply uploading a standalone plugin ZIP does not connect the endpoint.
6. If connecting a **separate upstream MCP**, configure `QUMI_DEPOT_UPSTREAM_MCP_URL`, `QUMI_DEPOT_UPSTREAM_ALLOWED_TOOLS`, and its dedicated bearer token on the VHost. The upstream server's tools are reached through the `depot_upstream_*` adapter; they do not replace Depot SDK operations.

No HTTPS endpoint is invented in this package. Without a verified host hostname/certificate/route, a successful MCP handshake in ChatGPT cannot be asserted.
