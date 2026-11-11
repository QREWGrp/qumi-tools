> **v0.4.0:** MCP form elicitation MUST NOT collect credentials. The operator uses a hidden terminal or a separately deployed approved HTTPS portal. Rotation receipts include ciphertext fingerprints only and provider revocation is mandatory. See the root README. Legacy DPAPI details below.

# QUMI Depot bridge security model

**Credentials**: Deploy a scoped organization Depot API token where SDK metadata methods require it, or a narrower project-scoped token for allowed build operations if supported. The official SDK expects `DEPOT_TOKEN`; `DEPOT_API_KEY` is a compatibility alias, not proof of token validity. Set the environment via OS service account or an approved secret manager. Never place secrets in manifests, source files, logs, ChatGPT messages or evidence.

`DEPOT_GIT_KEY` is solely for Git transport. The bridge never fetches encrypted GitAskPass material or invokes Git remote operations. Existing Replit secrets are not automatically available to Windows Depot VHost, nor to a private ChatGPT plugin. A secret encoded or encrypted in a Git commit can still pose exposure risk if keys or decryptors are also available; audit history, assess exposure, and rotate when warranted.

**Remote connectivity**: The HTTP service listens on 127.0.0.1 only, requires its own 32+ character `QUMI_MCP_BEARER_TOKEN`, rejects browser origins unless explicitly allowlisted, and supports stateless MCP POST calls. Publish to trusted remote agents only via a TLS terminating reverse proxy with independent identity enforcement (OIDC/mTLS, per-agent access controls, rate limits, request size, audit logs). Keep the VHost private; never forward port 8787 directly to the internet. Use a private DNS name and per-client credential rather than letting an agent learn the Windows machine's secrets.

**Authorization**: The host project allowlist limits API project selectors but a Depot organization token may have broader provider privileges; do not treat this process guard as a substitute for server-side token scope. `get_build` only takes build ID because that is the official SDK signature; use external identity/tenant authorization to prevent other project IDs from being queried if your token has access across projects. For strict isolation, deploy separate dedicated credentials/instances per project or verify ownership against project-scoped build listings. Do not offer cross-tenant `get_build` to untrusted agents.

**Execution**: Built-in tools never run arbitrary shell commands; start_build requires opt-in, full SHA, clean Git tree, path restrictions, and non-push CLI build flags. The source Dockerfile can execute code during remote build, so only allow trusted approved SHAs. Audit every build invocation and attach required approvals in GitHub/Notion independently.

**Privacy**: Build logs can contain sensitive content. Review/sanitize before pasting into issues or ChatGPT. The bridge attempts token redaction in subprocess logs but is not a DLP or compliance scanner. Rotate exposed credentials. Do not use Depot's public `ShareBuild` operation for private engineering logs.

## v0.2.0 vault / CLI policy

DPAPI (`ProtectedData.Protect`, CurrentUser) produces decryptable ciphertext tied to the Windows user identity. It is not a hash or digest and no decryption key is shipped in the plugin. The masked WinForms dialog is LOCAL ONLY and starts only when enabled on an interactive desktop. It is **not** a remote credential collection form. If the runtime runs as a service, use an approved service secret manager and inject `DEPOT_TOKEN` securely instead of attempting to open an interactive GUI. On-host users/processes executing as the same identity can potentially decrypt the credential; harden the account and machine.

CLI help discovery is read-only, but `depot_cli_run` is NOT an unrestricted shell. The runner uses `execFile` and fixed argv; a read-only path allowlist applies, credential-producing commands and command pass-through flags are denied, and all other command paths require host policy plus exact Git SHA and ticket approval. These are defense-in-depth, not a substitute for per-agent OAuth/RBAC at the remote HTTPS gateway. Host-level organization Depot API tokens may be powerful; use isolated roles/projects where supported.


## v0.3 security / runtime note

- Before launching any production bridge, run the local masked DPAPI provisioning form with `deploy/provision-gitaskpass.cmd`, and validate credentials with `credentials_status` and `git_askpass_status`. Secret values must never be accepted through MCP arguments, stdout, logs, evidence or commits.
- `GIT_ASKPASS` supplies **only Git HTTPS credentials**. It is not an API-token exchange mechanism. API access uses Depot SDK with host-managed `DEPOT_TOKEN` or `DEPOT_API_KEY`.
- The approved Git repository is `https://github.com/QREWGrp/qumi-suite.git` by default; changes require a VHost operator to set `QUMI_GIT_APPROVED_REPO` and verify provenance. The Git helper does **not** execute arbitrary Git commands for remote agents.
- The remote HTTP bridge is stateless and loopback-only. A verified TLS reverse proxy, application authentication and per-agent authorization are required; plugins do not deploy this network route automatically.
- There is no known first-party Depot MCP endpoint for ChatGPT in this package. Use a verified upstream MCP URL if one exists, or the QUMI-hosted SDK-backed MCP server. Never assume `https://api.depot.dev` is an MCP transport.
- CLI command discovery covers the installed binary; invoking dangerous subcommands remains policy restricted and explicitly audited. Avoid credentials-printing operations such as `depot login token` even if an operator approves other mutations.
