# Credential-question UI verification — 2026-11-11

## Evidence classification

**Browser simulation only, not native Windows/macOS acceptance.** The tested host was Linux, Node.js 22, Chromium 144 with Playwright. It rendered the real HTML returned by each bridge's secure-question HTTP service under simulated Windows, macOS and Linux user-agent/platform values. Direct Chromium localhost navigation was blocked by the test sandbox (`ERR_BLOCKED_BY_ADMINISTRATOR`), so snapshots used Chromium `set_content` from actual server HTML. They show rendering, not a successful in-browser submission.

| Evidence gate | Depot 0.5.0 | IONOS 0.2.1 | Fly 0.2.0 |
|---|---|---|---|
| Windows browser profile rendering / masked required fields | PASS | PASS | PASS |
| macOS browser profile rendering / masked required fields | PASS | PASS | PASS |
| Linux browser profile rendering / masked required fields | PASS | PASS | PASS |
| Node WebCrypto encrypted HTTP submission / encrypted vault storage | PASS | PASS | PASS |
| Reject cross-origin request | PASS | PASS | PASS |
| One-time submission / no raw synthetic credential in response or stored files | PASS | PASS | PASS |
| MCP URL-mode `elicitation/create` unit test | PASS | PASS | PASS |
| Native OS GUI test | NOT RUN | NOT RUN | NOT RUN |
| Live provider authentication | NOT RUN | NOT RUN | NOT RUN |
| Codex/Claude native UI visual acceptance | NOT RUN | NOT RUN | NOT RUN |

Only synthetic credentials were used. A package regression sweep passed. IONOS initialization version drift was fixed in 0.2.1.

Screenshots: nine PNGs and an overview contact sheet were generated with the test report as a separate downloadable evidence archive. They are not attached to this repository commit. Ask the QUMI release owner for the 2026-11-11 UI verification evidence archive before certifying this test record independently.

## Release decision

**SOURCE-LEVEL PASS / NATIVE-OS + HOST UI + LIVE AUTH PENDING.** The verification is not an unconditional enterprise release PASS.

## Distribution

The three marketplace entries live in `.agents/plugins/marketplace.json` and follow their plugin directories on branch `main`. See [MARKETPLACE-SYNC.md](MARKETPLACE-SYNC.md) for refresh behavior and workspace-admin daily sync setup.
