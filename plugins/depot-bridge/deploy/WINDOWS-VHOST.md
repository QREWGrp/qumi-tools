# Windows Depot VHost deployment checklist

1. Use a dedicated non-admin service identity with read access to the clean Git checkout, write to a separate restricted evidence directory, outbound HTTPS to `api.depot.dev`, and only necessary CLI/Docker/Depot permissions.
2. Install Node 20+, install the official Depot CLI, and extract the plugin source under an access-controlled directory. `cd server && npm install --ignore-scripts`; apply a lockfile and vulnerability scanning in the operational release process before production use.
3. Provide process environment *through a machine-managed secret store/service manager*, not `.env`, a persistent `setx` invocation or a committed CMD script:

```
QUMI_CHECKOUT_ROOT=C:\Program Files\Depot\qumi
QUMI_DEPOT_CLI_PATH=C:\Program Files\Depot\bin\depot.exe
QUMI_DEPOT_PROJECT_IDS=42pctzdz2g
DEPOT_PROJECT_ID=42pctzdz2g
QUMI_DEPOT_EVIDENCE_DIR=C:\ProgramData\QUMI\DepotEvidence
DEPOT_TOKEN=<secret from approved vault>
QUMI_ALLOW_BUILDS=0
QUMI_MCP_BEARER_TOKEN=<different random secret, 32+ chars>
QUMI_MCP_PORT=8787
```

4. Start `node index.mjs --http` using a Windows service manager, ensure restart and logging policies, and confirm loopback bind with `netstat -ano`. The bridge uses `/mcp` and supports JSON responses for stateless MCP POST; it is not an SSE server.
5. Configure an identity-aware TLS reverse proxy (prefer private networking such as corporate VPN plus OIDC/mTLS) **from the VHost to authorized remote MCP clients**. Keep port 8787 non-public and require authenticated identity before reaching the bridge. Configure approved client origins only when browser-originated MCP calls are needed.
6. Do not publish a sample/provisional hostname in `mcp.json`: insert the actual tested HTTPS MCP endpoint into each client's remote MCP settings after deployment.
7. Verify least-privilege token scope against Depot's token matrix; organization API tokens may have broad powers. The bridge's local project allowlist is defense-in-depth, not provider-enforced authorization.
8. Run the acceptance tests described in `README.md`; record exact SDK package version, Depot CLI version, Git SHA, project, build ID, timestamps, log digest, who approved builds, and GitHub/Notion evidence links.

## CMD troubleshooting

From the same service user context, check `node --version`, `C:\Program Files\Depot\bin\depot.exe --version`, `git -C "C:\Program Files\Depot\qumi" rev-parse HEAD`, and remote port/proxy connectivity. Do not print any environment variables or credentials in CI logs. If `list_projects` fails, verify organization-token permission rather than increasing scope automatically.

## v0.2.0 Windows DPAPI operator dialog

Run in an **interactive Windows desktop** under the SAME Windows user/service identity intended to run the MCP bridge:

```cmd
powershell.exe -NoProfile -STA -File "C:\path\to\depot-bridge\deploy\setup-secrets.ps1" -VaultDirectory "%LOCALAPPDATA%\QUMI\DepotVault"
```

The WinForms dialog uses masked fields and Windows DPAPI CurrentUser encryption with restricted ACLs. `DEPOT_TOKEN` is preferred for the official SDK; `DEPOT_API_KEY` can be provided as a fallback only if it is a real Depot token. `DEPOT_GIT_KEY` is stored independently but is NEVER read into SDK calls or exposed to MCP clients. For a service-account deployment, use its credential manager/approved vault; do not provision under an engineer's Windows profile and expect the service identity to decrypt it.

`credentials_status` only returns presence/availability. A locally connected MCP client can call `launch_secret_setup` only with `QUMI_ALLOW_LOCAL_SECRET_DIALOG=1`. Remote MCP calls always reject popup requests; cloud agents must ask an operator to perform local provisioning. These scripts are not Windows-tested in the artifact build environment.

## CLI diagnostics

`depot_cli_catalog` returns categories and policy; `depot_cli_help` runs `depot <subcommands> --help` against the **installed** binary without any token. `depot_cli_run` executes explicit argument arrays with `shell:false`, a project allowlist, and a bounded command timeout. Mutating commands are blocked without `QUMI_DEPOT_CLI_MUTATIONS=1`, `QUMI_DEPOT_CLI_APPROVED_PATHS`, exact candidate SHA and approval identifier. Some CLI commands run other programs or produce credentials; those flags/commands remain forbidden. Do not expose a generic CMD runner.


## v0.3 security / runtime note

- Before launching any production bridge, run the local masked DPAPI provisioning form with `deploy/provision-gitaskpass.cmd`, and validate credentials with `credentials_status` and `git_askpass_status`. Secret values must never be accepted through MCP arguments, stdout, logs, evidence or commits.
- `GIT_ASKPASS` supplies **only Git HTTPS credentials**. It is not an API-token exchange mechanism. API access uses Depot SDK with host-managed `DEPOT_TOKEN` or `DEPOT_API_KEY`.
- The approved Git repository is `https://github.com/QREWGrp/qumi-suite.git` by default; changes require a VHost operator to set `QUMI_GIT_APPROVED_REPO` and verify provenance. The Git helper does **not** execute arbitrary Git commands for remote agents.
- The remote HTTP bridge is stateless and loopback-only. A verified TLS reverse proxy, application authentication and per-agent authorization are required; plugins do not deploy this network route automatically.
- There is no known first-party Depot MCP endpoint for ChatGPT in this package. Use a verified upstream MCP URL if one exists, or the QUMI-hosted SDK-backed MCP server. Never assume `https://api.depot.dev` is an MCP transport.
- CLI command discovery covers the installed binary; invoking dangerous subcommands remains policy restricted and explicitly audited. Avoid credentials-printing operations such as `depot login token` even if an operator approves other mutations.
