# Deployment

## Target

QCoder Console is a private ECHO deployment on HAMMER/FORGE. The MCP server runs beside the Windows launcher and reaches FORGE through the existing governed GPU-lease and SOL paths. A container is deliberately not supplied: containerizing the MCP process while delegating terminal control back to the host would add a privileged host-control bridge and weaken the boundary.

The Qwen model runtime itself is separately governed by the loopback-only deployment in [FORGE Qwen route](FORGE_QWEN_ROUTE.md). Raw Ollama remains `127.0.0.1:11436`; QCoder and SDK callers use the fail-closed gateway on port 11437 and the single stable 128K alias.

Production uses stable HTTPS at `https://mcp.echo-op.com/oauth-mcp-qcoder-v1`, Streamable HTTP `/mcp`, and the existing ECHO OAuth authority. The route is currently absent and must be deployed before host testing.

## Release procedure

1. Run `scripts/verify-plugin.ps1` and the Inspector smoke.
2. Package with `scripts/package-plugin.ps1` and retain the ZIP plus SHA-256 sidecar.
3. Install exact production dependencies with the lockfile under a dedicated, non-administrator service identity.
4. Supply OAuth/introspection configuration from the secret store; never bake it into the package.
5. Restrict outbound connections to the OAuth authority and governed FORGE endpoints.
6. Start on a staging port, run health/readiness/version and MCP protocol checks, then promote the reverse-proxy route.
7. Run ChatGPT Scan Tools and the golden direct/indirect/negative/authorization/destructive tests.
8. Roll back by restoring the previous versioned package and route, then re-run health and MCP initialization.

The edge must enforce valid TLS, request size/time limits, structured redacted logs, health monitoring, and rate limits. The service must run from a fast local volume; authoritative repository data remains in Git, not SQLite. Back up audit/session evidence only according to the approved retention policy.

## Compatibility

Keep tool names stable, add optional schema fields rather than changing required fields, preserve safety annotations, and version `ui://qcoder/console/v1` when UI behavior becomes cache-incompatible.
