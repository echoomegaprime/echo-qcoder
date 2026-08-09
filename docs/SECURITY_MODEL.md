# Security model

## Trust boundaries

The boundaries are user to ChatGPT, ChatGPT to the MCP edge, MCP edge to the OAuth authority, MCP server to the local QCoder process, QCoder to the registered workspace, QCoder to the FORGE GPU lease service, widget to host bridge, and plugin package to the local Codex host. QCoder has no database, public-posting, payment, email, or arbitrary network tool.

## Threats and controls

| Threat                                  | Concrete control                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt or indirect prompt injection     | Tasks are data passed to a constrained Qwen profile; shell, web fetch, and sub-agent tools are denied in plugin mode. Retrieved text cannot add OAuth scopes or workspaces. |
| Cross-tenant access / IDOR              | Every session lookup binds opaque ID to token subject and tenant; role/workspace entitlements are rechecked on writes.                                                      |
| Token substitution / audience confusion | HTTPS introspection verifies active state, issuer, exact audience, expiry, client allowlist, tenant, scopes, roles, and workspaces.                                         |
| Replay / duplicate writes               | Required idempotency keys, request fingerprints, and expected session revision.                                                                                             |
| Command injection                       | No command or path parameter reaches a shell; launcher uses `shell: false` and a fixed argument vector.                                                                     |
| Path traversal                          | Client supplies a registry key, never a filesystem path; session IDs and transcript filenames use strict formats.                                                           |
| Secret and log leakage                  | Minimal child environment, central redaction, bounded results/transcripts, correlation IDs, no authorization headers or tokens in logs.                                     |
| Resource exhaustion                     | 256 KiB HTTP request cap, IP request limiter, per-subject hourly action quotas, per-session queue cap, global queue cap, bounded output, and 12-hour task deadline.         |
| Orphaned processes / GPU contention     | Process-tree termination, three bounded lease-release attempts, startup recovery, shutdown `stopAll`, and verified lease restoration.                                       |
| Destructive action without confirmation | Start/send/stop accurately declare destructive/open-world behavior; start requires a signed preview; UI stop requires a second session-bound confirmation.                  |
| XSS / malicious messages                | React text rendering, validated tool results, MCP Apps bridge, request matching, stale-response guards, no `innerHTML`/`eval`, and narrow CSP.                              |
| Malicious package content               | Explicit package allowlist, recursive denylist, archive re-extraction, manifest validation, secret scan, dependency audit, and hash sidecar.                                |

## Data handling

OAuth tokens and credentials are prohibited from storage. Session metadata is internal; tasks and transcripts may be confidential and are minimized. Transcript entries are capped at 2,000 characters, files at 8 MiB plus one archive, and tool reads at 200 lines. Production must install a retention reaper appropriate to ECHO policy before enabling persistent remote use. The current private developer package does not claim a configured production retention service.

## Outbound access and CSP

The widget has no wildcard network, frame, image, font, or resource domains. The MCP server calls only the configured HTTPS introspection endpoint and the fixed QCoder/lease runtime. The remote-safe Qwen profile denies general web access.

## Residual risks

- Local stdio trusts the local operator and is not equivalent to hostile-client HTTP isolation.
- Qwen can edit files inside an entitled workspace; Git review and tests remain required before release.
- The OAuth route and retention reaper are not deployed yet.
- The managed deep repository security scanner could not run because its host lacked the required filesystem permission profile; targeted manual review and automated security tests ran instead.
