# Security Policy

## Supported version

Security fixes are applied to the current `0.3.x` release line. The source repository is public; QCoder Console remains neither a public service nor a public ChatGPT-directory plugin.

## Reporting

Report suspected vulnerabilities privately to `security@echo-op.com`. Do not include OAuth tokens, transcripts, client data, or exploit payloads in a public issue.

## Boundaries

- The MCP server accepts only registered `workspace_key` values and configured fleet roles.
- HTTP deployments require resource-bound OAuth introspection, least-privilege scopes, an allowlisted client ID, and explicit workspace/role entitlements.
- The ChatGPT-facing launcher runs Qwen Code in `auto-edit` mode with shell, web-fetch, and sub-agent tools denied.
- Process environments are reconstructed from a minimal OS allowlist; caller secrets are not inherited.
- Session IDs are opaque and every lookup is bound to OAuth subject and tenant.
- Stop is a two-stage, idempotent operation and is not marked complete until process-tree termination and GPU-lease cleanup are verified.

## Secrets and retention

Secrets belong in the deployment secret store and never in source, `.app.json`, widget state, tool results, or logs. Transcripts are redacted, entry- and file-bounded, and are operational evidence rather than authoritative business data. Production operators must configure their approved retention/deletion job before enabling persistent HTTP access.

## Dependencies

Dependencies are exact-version locked. The MCP Inspector is isolated under `scripts/inspector` so its terminal UI peer dependencies cannot alter the React application graph. CI runs dependency audit, tests, build, MCP protocol validation, secret scan, and package validation.

The scheduled autonomy tick has only `contents: read` and `issues: write`; it cannot push, merge, release, deploy, or read repository secrets. Generated Python bytecode, local runtime state, logs, environment files, and release artifacts are excluded from source control.
