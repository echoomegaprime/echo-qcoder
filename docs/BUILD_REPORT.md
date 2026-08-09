# Build report

Generated 2026-08-09.

## Result

Built QCoder as a governed local Qwen Code builder plus a private full-bundle ChatGPT/Codex plugin. The runtime uses the verified FORGE-hosted 27B abliterated model across two GPUs and retains CPU-offload capacity. The plugin supplies one focused skill, seven user-goal MCP tools, a versioned MCP Apps console, OAuth authorization contracts, local marketplace support, deterministic PowerShell automation, CI, tests, and release documentation.

## Security hardening

Remote sessions are limited to registered workspace keys and entitled roles. The HTTP boundary validates exact resource audience, issuer, expiry, scopes, tenant, client ID, roles, and workspaces. Qwen runs in plugin `auto-edit` mode with shell/web/sub-agent tools denied and a minimal environment. Outputs are bounded/redacted; actions are idempotent and quota-limited; restart recovery and stop verify process-tree and lease cleanup.

## Verification summary

- Server: 34 tests passed.
- Web: 7 tests passed.
- Launcher: 15 tests passed.
- Golden metadata prompts: 60/60 passed.
- Typecheck, lint, format, build, manifest validation, dependency audits, secret scan, MCP smoke, and MCP Inspector passed.
- Release package is generated under `artifacts/` with a JSON SHA-256 sidecar.

## External boundaries

The stable production resource `https://mcp.echo-op.com/oauth-mcp-qcoder-v1`, OAuth client/claims mapping, production retention reaper, ChatGPT Scan Tools result, and real `plugin_asdk_app...` identifier do not yet exist. `.app.json` is intentionally absent. Public submission is not the target.

## Repository

Path: `C:\ECHO_MCP\echo-qcoder`. Remote: `https://github.com/ECHO-OMEGA-PRIME/echo-qcoder`. Unrelated ECHO worktree changes were not touched.
