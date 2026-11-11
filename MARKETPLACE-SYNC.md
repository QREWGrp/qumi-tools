# QUMI Engineering — GitHub marketplace installation and updates

Source: [QREWGrp/qumi-dev-tools](https://github.com/QREWGrp/qumi-dev-tools), branch `main`. Manifest: `.agents/plugins/marketplace.json`. The marketplace contains `qumi-depot-bridge`, `qumi-ionos-bridge`, and `qumi-fly-bridge`.

## Local Codex / ChatGPT desktop

In Settings → Plugins → Add marketplace, specify:

- Source: `https://github.com/QREWGrp/qumi-dev-tools`
- Git ref: `main`
- Sparse paths: two lines, `.agents/plugins` and `plugins`.

CLI equivalent:

```sh
codex plugin marketplace add QREWGrp/qumi-dev-tools --ref main --sparse .agents/plugins --sparse plugins
codex plugin marketplace list
codex plugin marketplace upgrade qumi-engineering
```

The Git-backed marketplace tracks the repository, but **a Git push is not proof that an already running local client has refreshed**. Marketplace `upgrade` explicitly refreshes the Git source; reopen Codex/restart the desktop client if its installed plugin stays stale. Test the MCP `tools/list` result after refreshing.

## ChatGPT workspace-admin GitHub import (automatic daily sync)

A workspace admin can enable the documented daily synchronization:

1. Admin Console → Plugins → Add → **Import marketplace**.
2. Source: `https://github.com/QREWGrp/qumi-dev-tools`; Path: empty; Branch: `main` (do **not** pin a SHA).
3. Authorize the GitHub account, complete import, review the role/installation policy and each plugin's required access.
4. Under Plugins → Marketplaces, verify **automatic daily sync**, inspect status, and use **Sync now** for an immediate refresh.

Repository publication alone does not create this workspace import or authorize individual operators. Imported local-stdio MCP plugins may be Desktop-only; no live hosted endpoint or provider tokens are included.

See [OpenAI help: importing and syncing marketplaces](https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github) and [Codex CLI marketplace documentation](https://developers.openai.com/plugins/build/plugins).

## Acceptance

Verify 3 plugin names and expected versions (Depot 0.5.0, IONOS 0.2.1, Fly 0.2.0), MCP tools/list, secure question delivery, a user-local encrypted vault, and optional provider authentication under the operator's own credentials. Never enter credentials into chat.
