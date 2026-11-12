# Plugin rebranding and vault migration — 1.0.0-rc

The old display names have been retired from the current Git marketplace. Four **new portable plugin package identities** replace them; they are not silent in-place upgrades:

| Prior package name | Current package name | Marketplace display |
|---|---|---|
| `qumi-depot-bridge` | `depot-bridge` | DEPOT Bridge |
| `qumi-ionos-bridge` | `ionos-bridge` | IONOS Bridge |
| `qumi-fly-bridge` | `fly-io-bridge` | Fly.io Bridge |
| `qumi-npm-bridge` | `npm-bridge` | NPM Bridge |

The repository was renamed to [QREWGrp/qumi-tools](https://github.com/QREWGrp/qumi-tools). The marketplace is `engineering-bridges`. Install the new plugin from `main` after upgrading/re-adding the Git marketplace; disable or uninstall a legacy plugin only after confirming its successor can access the intended provider.

**Secret storage:** Existing encrypted vault **file formats and legacy per-user vault directories remain unchanged** intentionally, so the new runtime can decrypt them. A file called `qumi-*.vault.json` is only an internal legacy on-disk path, not the new public product name. Do not move, rename, or commit these encrypted vault files to Git. Do not reuse a shared passphrase across unrelated agents.

**Unlock:** `VAULT_PASSPHRASE` is the sole new per-agent variable for unlock. Inject it from the agent's private cloud vault or ask the operator to unlock using Saved Passwords in a protected question. Old `QUMI_*_VAULT_PASSPHRASE` names are not read by the new RC. If you opt for cloud, configure the new variable in each agent's own secret manager before restarting its MCP runtime; the bridge does not create cloud secrets for you.

**Other legacy environment names:** Provider-specific policy/config variables may retain old technical prefixes temporarily for backward compatibility. They are not public plugin names and should not be interpreted as new secrets.

**Compatibility decision:** Renamed plugin identity is intentionally breaking for auto-installation; older private plugin records remain available but are not part of the current marketplace. Existing operator-managed vault files are retained.
