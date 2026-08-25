# Local testing

## Complete local verification

```powershell
Set-Location C:\ECHO_MCP\echo-qcoder
npm ci --ignore-scripts
npm ci --prefix scripts/inspector --ignore-scripts
pwsh -File .\scripts\verify-plugin.ps1
pwsh -File .\scripts\test-mcp.ps1 -SkipBuild -Inspector
pwsh -File .\scripts\package-plugin.ps1
```

The first script runs JSON/manifest/path validation, type checking, lint, format check, server/UI/security tests, the 60-case deterministic routing evaluation, both builds, Python launcher tests, dependency audit, secret scan, local marketplace staging, and an MCP smoke unless skipped. `test-mcp.ps1` boots an isolated server, checks health/readiness/version, initializes MCP, lists tools, invokes representative calls, loads the UI resource, and optionally runs the exact lockfile-pinned Inspector.

## Local host modes

For trusted Codex stdio:

```powershell
pwsh -File .\scripts\run-local.ps1 -Mode stdio
```

For HTTP, set `QCODER_OAUTH_INTROSPECTION_URL`, `QCODER_OAUTH_CLIENT_ID`, `QCODER_OAUTH_CLIENT_SECRET`, and `QCODER_OAUTH_ALLOWED_CLIENT_IDS`, then run `pwsh -File .\scripts\run-local.ps1`. Secret values must come from the runtime secret store and must not be echoed.

## ChatGPT developer mode

Use the current ChatGPT Settings developer-mode connection workflow, register the stable HTTPS MCP resource, run Scan Tools, complete OAuth, and test in a new chat. Do not use localhost as a ChatGPT resource. For a private endpoint, use Secure MCP Tunnel when the current account surface supports it; a temporary HTTPS tunnel is development evidence only.

After registration, copy the real technical ID beginning `plugin_asdk_app` and run:

```powershell
pwsh -File .\scripts\configure-app-id.ps1 -AppId 'plugin_asdk_app_REAL_ID'
```

The script validates and atomically writes `.app.json`. As of 2026-08-09, the intended production route returns 404 and no real technical ID exists, so ChatGPT connection, OAuth, Scan Tools, and in-host UI tests are recorded as blocked rather than passed.
