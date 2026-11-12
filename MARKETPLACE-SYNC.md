# Engineering Bridges — Git source of truth and update behavior

**Repository:** https://github.com/QREWGrp/qumi-tools  
**Branch:** `main` · **Manifest:** `.agents/plugins/marketplace.json` · **Marketplace:** `engineering-bridges`

## Codex desktop

Add marketplace with source `https://github.com/QREWGrp/qumi-tools`, Git ref `main`, and sparse paths `.agents/plugins` and `plugins` (or no sparse filtering).

For compatible CLI versions:

```sh
codex plugin marketplace add QREWGrp/qumi-tools --ref main --sparse .agents/plugins --sparse plugins
codex plugin marketplace list
codex plugin marketplace upgrade engineering-bridges
```

Then select **DEPOT Bridge**, **IONOS Bridge**, **Fly.io Bridge**, or **NPM Bridge**.

**A Git push does not prove an installed desktop has upgraded.** Refresh the source via the marketplace's upgrade/sync control and restart the agent if tools remain stale. Some client versions may use UI-only controls.

## Workspace-level daily GitHub sync

An authorized workspace administrator must import the GitHub marketplace under Admin Console → Plugins → Add → Import marketplace. Choose **QREWGrp/qumi-tools**, `main`, no pinned commit SHA, approve GitHub access and review install policy. Confirm the marketplace's actual sync setting/status, and use **Sync now** if available. This source repository cannot activate workspace admin sync on its own.

## Vault and upgrade guarantees

Every bridge accepts one per-agent secret variable named **`VAULT_PASSPHRASE`**, injected by the agent's private cloud vault. The same variable name does not imply the same value across agents. Never set it in repository secrets intended for public CI, Git, chat, scripts or logs.

For Saved Passwords, the agent needs operator interaction to unlock; it cannot read the password manager automatically. User-selected storage-source preference is non-secret metadata only.

See [MIGRATION.md](MIGRATION.md) for old→new plugin identities. **Legacy source folders are not listed as installable plugins**. The old private plugin records are not automatically deleted or rewritten; switch your marketplace install to the new RC identity.

## Acceptance

A useful smoke test after installation:
1. MCP `initialize` / `tools/list` exposes the bridge's actual tools.
2. Runtime status shows expected version `1.0.0-rc`, CLI/SDK readiness and `VAULT_PASSPHRASE` availability (never its value).
3. A secure credential question offers **Saved Passwords** and **Cloud Personal Vault**.
4. Read-only provider operation works using the operator's authorization; mutation approval rejects unmatched operations.
