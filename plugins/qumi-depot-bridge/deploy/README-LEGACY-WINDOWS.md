# Windows VHost migration note

Previous v0.3.0 scripts are preserved for existing operators. As of v0.4.0, these Windows VHost scripts are optional legacy paths. The default MCP runtime is cross-platform `server/standalone-mcp.mjs`. Do not require Windows DPAPI or a Windows checkout for agents using project-local Depot CLI and encrypted portable vault.
