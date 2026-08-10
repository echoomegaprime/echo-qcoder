# Security report

Checked 2026-08-09.

## Result

Targeted repository, MCP, UI, and package reviews found five high-impact boundary gaps and several medium packaging/reliability gaps. The implementation now fixes the reachable high-impact findings: client/role/workspace entitlements, remote Qwen sandboxing, secret-bearing environment inheritance, raw outcome persistence, and fail-open process/lease termination.

Additional fixes include per-action and global quotas, request-size limits, service restart recovery, bounded transcript saturation behavior, correct insufficient-scope challenges, destructive annotations for start/send, cross-session UI race protection, session-bound stop confirmation, exact isolated Inspector locking, and explicit package allowlist/denylist validation.

## Verification

- Server tests: 34 passed, including auth, tenant/resource ownership, entitlements, schemas, metadata, redaction, quotas, recovery, and termination behavior.
- UI tests: 7 passed, including initialization, auth state, session switching, stale responses, and two-stage stop.
- Launcher tests: 17 passed, including plugin auto-edit mode, environment filtering, Qwen 0.21.8 stream-output reduction, and the 32K model contract.
- Dependency audits: root and isolated Inspector trees report zero vulnerabilities.
- Secret scan: required release gate; no findings in the last complete verify run.
- CSP/static manifest validation: narrow CSP, seven unique tools, all manifest paths resolved.
- Powerpack supply-chain gate: 21 repositories have exact Git commit pins, permissive-license allowlisting, and pinned license digests; online HEAD and license revalidation passed.
- Promptfoo 0.122.0 was removed after its installed tree reported six high and three moderate npm advisories. The remaining local powerpack audit reports zero vulnerabilities.
- Serena is untrusted and constrained to an explicit semantic/refactor tool allowlist; shell, raw file, and memory tools are excluded from Qwen's profile.
- Public-source hardening removed generated Python bytecode from Git tracking while preserving local runtime files. The six-hour workflow has only read-content and issue-write permissions; it cannot push, merge, release, deploy, or read repository secrets.
- The HAMMER fallback task runs with the current interactive identity at `RunLevel Limited`, ignores overlapping runs, has a 30-minute execution limit, stores only sanitized local evidence, and posts only failed gate names to the public issue.

The managed deep security scanner was **BLOCKED BY EXTERNAL DEPENDENCY** after three attempts because its host did not expose the required filesystem permission profile. This is recorded as blocked, not passed; targeted manual review and automated security tests completed.

## Residual findings

| Severity | Risk                                              | Disposition                                                                  |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Medium   | Production retention/deletion job is not deployed | Block remote production enablement until policy and reaper are configured.   |
| Medium   | OAuth resource/client are not provisioned         | HTTP remains unavailable; trusted local stdio only.                          |
| Medium   | IP limiter is process-local                       | Acceptable for private staging; production edge must add distributed limits. |
| Low      | Local stdio trusts the local host                 | Documented separate boundary; no hostile-client claim.                       |

No validated high- or critical-severity finding remains open in the implemented private package.

Public repository visibility changes the disclosure surface, not the runtime authorization model. The full tracked history and release package receive secret scans before publication; private endpoints are operational configuration, while credentials, tokens, client records, transcripts, and runtime state remain excluded.
