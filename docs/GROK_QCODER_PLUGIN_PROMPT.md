# Grok build prompt: QCoder integration plugin

You are building an independent private plugin that controls ECHO QCoder through its MCP contract. Do not clone or expose the underlying terminal as a raw shell.

## Runtime facts

- QCoder is Qwen Code 0.15.6+ backed by `huihui_ai/Qwen3.6-abliterated:27b` on FORGE.
- The model is served OpenAI-compatibly as `c3po-code` and has verified dual-GPU residency on two 16 GB GPUs with host RAM available for offload.
- The governed Windows launcher is `C:\ECHO_MCP\echo-qcoder\launcher\qcoder.ps1`.
- Every session loads repository `AGENTS.md` and `CLAUDE.md`, enters a durable SOL mission, uses the scoped broker, acquires the GPU lease, and restores displaced GPU services after exit.
- Remote plugin mode is intentionally `auto-edit`: repository read/edit is allowed; Bash/shell, web fetch, and sub-agent spawning are denied.

## Required architecture

Build a current OpenAI full-bundle plugin: a focused skill, Streamable HTTP MCP server, optional MCP Apps UI, and `.codex-plugin/plugin.json`. Use current official OpenAI documentation. Do not use legacy OpenAPI Actions as the primary architecture and do not invent `.app.json`, OAuth registrations, URLs, credentials, or test output.

Implement exactly these user-facing tools with strict schemas and explicit output schemas: `list_qcoder_sessions`, `get_qcoder_session`, `preview_qcoder_task`, `start_qcoder_session`, `send_qcoder_task`, `stop_qcoder_session`, and `render_qcoder_console`. Keep data tools separate from the render tool. Use a versioned `ui://` resource and the MCP Apps bridge.

## Non-negotiable controls

- Never accept raw commands, paths, PIDs, environment variables, model endpoints, or arbitrary tool permissions.
- Map `workspace_key` server-side to an allowlisted path.
- Bind all session records to OAuth subject and tenant.
- Validate issuer, exact audience/resource, expiry, allowlisted client ID, minimum scope, `qcoder_roles`, and `qcoder_workspaces` on the server.
- Require preview fingerprint before start, idempotency keys on writes, expected revision on send/stop, and a session-bound second confirmation for stop.
- Mark start/send/stop destructive and open-world; list/get/preview/render are read-only.
- Launch with `shell: false`, a fixed argument vector, and a minimal OS environment. Strip tokens, cookies, secrets, passwords, credentials, and authorization values.
- Bound HTTP bodies, queues, runtime, result sizes, transcript lines/files, action rates, and global concurrency.
- Redact logs/transcripts/results. Stop the process tree, verify the GPU lease is released, retry bounded cleanup, recover interrupted sessions after restart, and stop all children on shutdown.
- Render untrusted values only as React text. Validate bridge messages, match request IDs, ignore stale cross-session results, clean listeners, support keyboard/focus/screen readers, and use narrow CSP with no wildcards.
- Use an explicit package allowlist and recursive denylist; exclude dependencies, caches, logs, runtime databases, credentials, `.env`, and compiled Python cache. Re-extract and validate the release archive, then emit SHA-256 metadata.

## Verification

Write failing tests before nontrivial behavior. Cover schemas, authorization, tenant boundaries, entitlements, idempotency, quotas, recovery, redaction, process cleanup, UI bridge/state/confirmation, adversarial input, CSP, manifests, MCP initialize/list/call/resource, and package contents. Run typecheck, lint, format, all tests, build, dependency audit, secret scan, local Streamable HTTP smoke, exact lockfile-pinned MCP Inspector, and package validation. Record PASS/FAIL/BLOCKED/NOT APPLICABLE honestly.

The production resource is intended to be `https://mcp.echo-op.com/oauth-mcp-qcoder-v1`, but use it only if it actually resolves and authenticates. If it does not, finish every independent artifact, leave `.app.json` absent, and document the precise registration dependency. Do not weaken security to manufacture a host pass.
