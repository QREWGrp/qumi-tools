# Security policy

**Support:** support@qr-oo.com.

Do not publish Depot API tokens, Git credentials, vault passphrases, client secrets, personal MCP endpoints, or stored ciphertext in this repository.

Use operator-only hidden terminal input or an approved per-user secret manager. Per-user encrypted vaults must remain outside any Git worktree and local decrypted tokens must not be logged or returned to an agent chat. `GIT_ASKPASS` should be scoped to approved HTTPS Git operations only.

The receipt mechanism stores an encrypted-record fingerprint, not a hash of a raw token. Revoking and rotating compromised tokens at the upstream issuer remains mandatory. Report suspected exposure privately to the support address above.

Build commands and CLI installation need explicit operator or platform authorization; avoid enabling unrestricted agent shell execution.
