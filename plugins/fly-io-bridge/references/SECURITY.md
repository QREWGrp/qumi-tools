# Security controls

- Upstream Fly MCP uses provider OAuth at https://mcp.fly.io, managed by the user's MCP client; no credentials distributed in the public plugin.
- CLI reads are allowlisted; all other commands require one-time operator approval stored in a per-user restricted state directory.
- No arbitrary shell command execution, and `stdin` is disabled for agent CLI calls.
- CLI command values are validated, secrets-related commands and sensitive flags are refused, and output is bounded/redacted.
- The official release installer accepts only `superfly/flyctl` assets from GitHub release metadata with a published SHA-256 digest and exact archive length. Refuse missing digests or mismatches.
- The installation target is user-local or project-local; never silently overwrite a prior installation.
- Agent credential input is out of band, in hidden terminal TTY or the platform secret manager, not MCP chat arguments.
- Local encrypted vault uses AES-256-GCM with scrypt, random salt and nonce, passphrase stored nowhere in the repository.
- Risky Fly MCP tools are governed by OAuth scope and the *client's tool approvals*, not local CLI approvals; engineers must enable their own client confirmations.
- No claims of live Fly resource access without a real authenticated check.
