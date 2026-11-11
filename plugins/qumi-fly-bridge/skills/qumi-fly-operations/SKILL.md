---
name: qumi-fly-operations
description: Use when a QUMI engineer asks to inspect or administer Fly.io resources through official Fly MCP OAuth and the Fly CLI, including app health, deployments, Machines, volumes, networking, secrets, agent skills or release evidence.
---

# QUMI Fly engineering operations

Always prefer `fly-official` MCP tools for capabilities exposed by the live Fly provider server. The upstream Fly MCP's tool list and JSON schemas are authoritative. Do NOT invent MCP operations from CLI names; the MCP does not support every flyctl operation. For other operations use the `qumi-fly-cli` bridge and discover command syntax from the installed CLI.

## Onboard agent

1. Call `fly_runtime_status` and report CLI availability without exposing any token, vault value or passphrase.
2. If official Fly MCP is not enabled, use `fly_mcp_connection_guide`. The operator chooses organization/resource scopes in the **official browser OAuth** flow; no PAT should be pasted into the conversation. The CLI is separately authenticated.
3. If flyctl is missing, request an install plan; show the version, verified digest, target directory and impact, then ask the operator to approve from a secure terminal. Never install without authorization.
4. Optionally run `fly_agent_setup_guide` to discover `fly skills` and `fly setup agent`. These change local agent configuration and require an explicit CLI plan and approval.

## Operational discipline

- For reads, prefer scoped MCP reads, CLI status/logs/list command help, and exact app+organization context.
- For writes, inspect current state, present proposed target, diff, source SHA, roll-forward and rollback, then request explicit client/tool approval. CLI mutations require a one-time local approval receipt; do not bypass policy by using a side-effecting operation disguised as a read.
- For destructive operations (delete/scale down/volume removal/secrets changes), require additional operator confirmation and plan for data safety before action.
- Never issue `fly auth token` or `fly secrets set` through the MCP CLI bridge. Use a secure operator terminal and approved secret manager for any secret values.
- Pin build evidence to exact commit SHA; attach meaningful log excerpts, app release identifier, timestamp, command contract and tests. Redact tokens.
- Never infer that fly.io hosting or a deployment is production ready from a source test. Verify actual app health and release guards.

## Authentication and credential rotation

The Fly MCP uses **OAuth**, not a pasted secret. For CLI auth, use local `fly auth login`, platform secret injection of `FLY_API_TOKEN`, or the per-user encrypted local vault. If an operator requests credential entry in a question bubble, ask only for permission to launch the secure flow. Refer them to `node bin/credentials.mjs store` for hidden terminal entry or an approved hosted provider secret flow. Do not echo, cache in Git, upload or store plaintext in MCP outputs. To rotate, create a new provider token, update the per-user vault, verify access, revoke the old provider credential, and retain a non-secret receipt.
