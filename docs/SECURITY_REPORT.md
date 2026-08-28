# Security report

Checked 2026-08-09.

## Result

Targeted repository, MCP, UI, and package reviews found five high-impact boundary gaps and several medium packaging/reliability gaps. The implementation now fixes the reachable high-impact findings: client/role/workspace entitlements, remote Qwen sandboxing, secret-bearing environment inheritance, raw outcome persistence, and fail-open process/lease termination.

Additional fixes include per-action and global quotas, request-size limits, service restart recovery, bounded transcript saturation behavior, correct insufficient-scope challenges, destructive annotations for start/send, cross-session UI race protection, session-bound stop confirmation, exact isolated Inspector locking, and explicit package allowlist/denylist validation.

## Verification

- Server tests: 34 passed, including auth, tenant/resource ownership, entitlements, schemas, metadata, redaction, quotas, recovery, and termination behavior.
- UI tests: 7 passed, including initialization, auth state, session switching, stale responses, and two-stage stop.
- Launcher tests: 15 passed, including plugin auto-edit mode and environment filtering.
- Dependency audits: root and isolated Inspector trees report zero vulnerabilities.
- Secret scan: required release gate; no findings in the last complete verify run.
- CSP/static manifest validation: narrow CSP, seven unique tools, all manifest paths resolved.
- Powerpack supply-chain gate: 14 repositories have exact Git commit pins, permissive-license allowlisting, and pinned license digests; online HEAD and license revalidation passed.
- Promptfoo 0.122.0 was removed after its installed tree reported six high and three moderate npm advisories. The remaining local powerpack audit reports zero vulnerabilities.
- Serena is untrusted and constrained to an explicit semantic/refactor tool allowlist; shell, raw file, and memory tools are excluded from Qwen's profile.

The managed deep security scanner was **BLOCKED BY EXTERNAL DEPENDENCY** after three attempts because its host did not expose the required filesystem permission profile. This is recorded as blocked, not passed; targeted manual review and automated security tests completed.

## Residual findings

| Severity | Risk                                              | Disposition                                                                  |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Medium   | Production retention/deletion job is not deployed | Block remote production enablement until policy and reaper are configured.   |
| Medium   | OAuth resource/client are not provisioned         | HTTP remains unavailable; trusted local stdio only.                          |
| Medium   | IP limiter is process-local                       | Acceptable for private staging; production edge must add distributed limits. |
| Low      | Local stdio trusts the local host                 | Documented separate boundary; no hostile-client claim.                       |

No validated high- or critical-severity finding remains open in the implemented private package.
