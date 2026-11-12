#!/bin/sh
# Only invoked by the approved Git process; do not expose this command as an MCP tool.
[ "${QUMI_GIT_ASKPASS_ACTIVE:-}" = 1 ] || exit 1
[ -n "${QUMI_NODE_EXEC:-}" ] || exit 1
[ -n "${QUMI_GIT_ASKPASS_SCRIPT:-}" ] || exit 1
exec "$QUMI_NODE_EXEC" "$QUMI_GIT_ASKPASS_SCRIPT" "$@"
