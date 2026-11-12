> **v0.4.0:** Agent runtime portability, SHA-256 verified CLI installation, and operator AES vault are documented in the root README. Legacy Windows-specific procedures remain below.

# Operation catalog and W0 gates

Read-only tools: `health`, `list_projects`, `list_builds`, `get_build`, `get_build_steps`, `get_build_step_logs`, `verify_checkout`, `depot_cli_version`, `build_job`.

Mutating tool: `start_build` (disabled unless `QUMI_ALLOW_BUILDS=1` on host). It runs exactly one `depot build` subprocess, without a shell, with allowlisted paths and fixed arguments. It does not supply `--push`, `--load`, or arbitrary build arguments.

Build evidence record fields: jobId, projectId, sourceSha (full 40-char Git HEAD), Dockerfile, context, platform, startedAt, finishedAt, exitCode, status, logSha256, logFile. Evidence is host local until deliberately submitted to the authorized code review process.

Suggested W0 checks, **not automatic approval**:
- Candidate SHA and working tree: clean, frozen, exact SHA.
- Unblocked governance: D04, L06, L08-L16, L18, L17-L23 as applicable; L19 independent gate decision.
- Migration safety: canonical SQL hash, PostgreSQL 17.x and disposable Neon parity, role separation, cross-tenant negative tests.
- Repeatable images: clean checkout and verified build attestations; no undeclared registry uplinks.
- Platform health and resource safety: check R-05 capacity, startup_failure resolution or approved exception.
- Every required independent reviewer explicitly accepts exact candidate; otherwise REFUSE.

Never conflate Depot image-building with Docker execution on a VHost. Depot CLI can run in Windows CMD and submits builds to Depot builders; local Docker, composition, or deployment requires separate authorized tooling.

## v0.2.0 additions

- `get_build_bundle`: combines Depot metadata, up to 20 steps and one page of logs per step (bounded, may truncate). Use existing step tools for complete pagination.
- `depot_cli_catalog`: return docs/capability map/host policy, no execution.
- `depot_cli_help`: dynamic `depot <words> --help` from installed binary.
- `depot_cli_run`: argument-array execution; conservative read-only allowlist, explicit host approvals for other operations, separate audit SHA-256 receipt.
- `credentials_status`: returns existence of DPAPI encrypted secret slots/environment variables without values.
- `launch_secret_setup`: local interactive Windows popup only, never remote; uses Windows DPAPI CurrentUser.

Source to close a governance issue must include exact plugin version, tested Windows host runtime version, token scope without value, CLI `--version`, approved Git SHA, command argv minus secrets, project/build identifiers, evidence SHA-256, acceptance reviewer, and final PASS/REFUSE decision. A plugin update without VHost deployment is not an integration PASS.


## v0.3 security / runtime note

- Before launching any production bridge, run the local masked DPAPI provisioning form with `deploy/provision-gitaskpass.cmd`, and validate credentials with `credentials_status` and `git_askpass_status`. Secret values must never be accepted through MCP arguments, stdout, logs, evidence or commits.
- `GIT_ASKPASS` supplies **only Git HTTPS credentials**. It is not an API-token exchange mechanism. API access uses Depot SDK with host-managed `DEPOT_TOKEN` or `DEPOT_API_KEY`.
- The approved Git repository is `https://github.com/QREWGrp/qumi-suite.git` by default; changes require a VHost operator to set `QUMI_GIT_APPROVED_REPO` and verify provenance. The Git helper does **not** execute arbitrary Git commands for remote agents.
- The remote HTTP bridge is stateless and loopback-only. A verified TLS reverse proxy, application authentication and per-agent authorization are required; plugins do not deploy this network route automatically.
- There is no known first-party Depot MCP endpoint for ChatGPT in this package. Use a verified upstream MCP URL if one exists, or the QUMI-hosted SDK-backed MCP server. Never assume `https://api.depot.dev` is an MCP transport.
- CLI command discovery covers the installed binary; invoking dangerous subcommands remains policy restricted and explicitly audited. Avoid credentials-printing operations such as `depot login token` even if an operator approves other mutations.
