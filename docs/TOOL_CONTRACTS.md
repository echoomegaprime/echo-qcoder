# QCoder MCP Tool Contracts

## Shared conventions

- All tools require OAuth 2.1 through the ECHO authorization server. There is no anonymous fallback.
- `session_id` format: `qcs_` followed by 32 lowercase hexadecimal characters.
- `task_id` format: `qct_` followed by 32 lowercase hexadecimal characters.
- `audit_id` format: `qca_` followed by 32 lowercase hexadecimal characters.
- `workspace_key` format: `^[a-z0-9][a-z0-9._-]{0,63}$`; the server resolves it through an allowlist.
- `idempotency_key` format: 16-128 URL-safe ASCII characters.
- Fleet roles are limited to: `commander`, `deputy_commander`, `architect`, `innovator`, `observer`, `builder`, `cli-build`, `publisher`, `enhancer`, `researcher`, `trainer`, `sentinel`, `curator`, `quartermaster`, `steward`, `beta`, `echo-prime`, `marketing`, `osint`, `surveyor`, `troubleshooter`, `landman`, `reverse-engineer`, `pentester`, `judge`, `harbormaster`, `product-manager`, `experience-designer`, `data-engineer`, and `compliance-officer`.
- Unknown object properties are rejected. String lengths and array sizes are bounded.
- User-safe errors use stable codes: `AUTH_REQUIRED`, `AUTH_INVALID`, `SCOPE_REQUIRED`, `TENANT_FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_INPUT`, `RATE_LIMITED`, `UNAVAILABLE`, `LAUNCH_FAILED`, and `INTERNAL_ERROR`.
- Internal paths, PIDs, command lines, tokens, environment values, and stack traces never appear in tool results.

## 1. `list_qcoder_sessions`

1. **Title:** List QCoder sessions.
2. **Description:** Use this when the user wants to see their governed QCoder sessions or determine what the local builder is doing. Do not use it to inspect another user, arbitrary host processes, or raw logs.
3. **Input schema:** `{ status?: enum, cursor?: string(1..256), limit?: integer(1..50)=20 }`, strict.
4. **Output schema:** `{ sessions: SessionSummary[0..50], next_cursor: string|null }`.
5. **Arguments:** `status` is one of `queued|running|stopping|completed|failed|stopped`; cursor is opaque.
6. **Authorization:** OAuth required.
7. **Scope:** `qcoder.sessions.read`.
8. **External systems:** local session SQLite only.
9. **Side effects:** none.
10. **Idempotency:** naturally idempotent snapshot read.
11. **Failures:** auth/scope, invalid cursor, unavailable persistence.
12. **User-safe recovery:** relink auth, remove invalid filters, or retry after service recovery.
13. **Retry:** safe after transport or unavailable failure.
14. **Confirmation:** none.
15. **UI resource:** none.
16. **Annotations:** `readOnlyHint=true`, `destructiveHint=false`, `openWorldHint=false`, `idempotentHint=true`.
17. **Security scheme:** `oauth2` with `qcoder.sessions.read`.

## 2. `get_qcoder_session`

1. **Title:** Get QCoder session.
2. **Description:** Use this when the user needs the current state, bounded transcript tail, or queued tasks for one known QCoder session. Do not use it with guessed IDs or as a raw log download.
3. **Input schema:** `{ session_id, transcript_lines?: integer(0..200)=80 }`, strict.
4. **Output schema:** `{ session: SessionDetail, transcript: TranscriptLine[0..200], tasks: TaskSummary[0..50] }`.
5. **Authorization:** OAuth required; subject and tenant ownership enforced.
6. **Scope:** `qcoder.sessions.read`.
7. **External systems:** local SQLite and bounded transcript store.
8. **Side effects:** none.
9. **Idempotency:** naturally idempotent per state revision.
10. **Failures:** not found is indistinguishable from not owned; unavailable storage.
11. **User-safe recovery:** list owned sessions and retry with a returned ID.
12. **Retry:** safe.
13. **Confirmation:** none.
14. **UI resource:** none; call `render_qcoder_console` after this tool when visual console output is requested.
15. **Annotations:** `readOnlyHint=true`, `destructiveHint=false`, `openWorldHint=false`, `idempotentHint=true`.
16. **Security scheme:** `oauth2` with `qcoder.sessions.read`.

## 3. `preview_qcoder_task`

1. **Title:** Preview QCoder task.
2. **Description:** Use this when the user wants to validate a governed QCoder task before starting it. Do not use it to execute work or to validate arbitrary commands or paths.
3. **Input schema:** `{ workspace_key, role, mission: string(1..240), task: string(1..12000) }`, strict.
4. **Output schema:** `{ accepted: boolean, normalized: {workspace_key, role, mission, task_hash}, queue: {running, queued}, policy: PolicyDecision[], preview_fingerprint }`.
5. **Authorization:** OAuth required; workspace entitlement checked.
6. **Scope:** `qcoder.sessions.read`.
7. **External systems:** workspace registry and session database.
8. **Side effects:** none.
9. **Idempotency:** deterministic for the same policy revision and normalized input.
10. **Failures:** invalid or unauthorized workspace/role, unsafe or oversized input, unavailable registry.
11. **User-safe recovery:** choose an allowed workspace/role or reduce task size.
12. **Retry:** safe after unavailable failure.
13. **Confirmation:** none.
14. **UI resource:** none.
15. **Annotations:** `readOnlyHint=true`, `destructiveHint=false`, `openWorldHint=false`, `idempotentHint=true`.
16. **Security scheme:** `oauth2` with `qcoder.sessions.read`.

## 4. `start_qcoder_session`

1. **Title:** Start QCoder session.
2. **Description:** Use this when the user has approved a validated task and wants a new governed QCoder builder session. Do not use it for arbitrary shell commands, unregistered workspaces, or background work the user did not request.
3. **Input schema:** `{ workspace_key, role, mission: string(1..240), task: string(1..12000), preview_fingerprint: 64 lowercase hex, idempotency_key }`, strict.
4. **Output schema:** `{ session: SessionSummary, task: TaskSummary, duplicate: boolean }`.
5. **Authorization:** OAuth required; subject, tenant, workspace entitlement, and fresh preview fingerprint enforced.
6. **Scope:** `qcoder.sessions.start`.
7. **External systems:** local persistence, governed `qcoder.ps1`, SOL, and FORGE GPU lease/model through that launcher.
8. **Side effects:** creates records and may edit the allowlisted workspace through QCoder.
9. **Idempotency:** key plus request fingerprint persisted; exact duplicate returns the original IDs; mismatched reuse returns `CONFLICT`.
10. **Failures:** stale preview, rate limit, queue unavailable, launch failure, auth/scope/tenant denial.
11. **User-safe recovery:** preview again when stale; retry exact request with same key after uncertain transport result.
12. **Retry:** only with the same idempotency key.
13. **Confirmation:** host write confirmation applies; preview is the first stage.
14. **UI resource:** none; render separately.
15. **Annotations:** `readOnlyHint=false`, `destructiveHint=false`, `openWorldHint=true`, `idempotentHint=true`.
16. **Security scheme:** `oauth2` with `qcoder.sessions.start`.

## 5. `send_qcoder_task`

1. **Title:** Send QCoder task.
2. **Description:** Use this when the user wants an existing owned QCoder session to perform one follow-up task. Do not use it to create a new workspace session, change workspace/role, or send arbitrary terminal input.
3. **Input schema:** `{ session_id, expected_revision: integer>=1, task: string(1..12000), idempotency_key }`, strict.
4. **Output schema:** `{ session_id, session_revision, task: TaskSummary, queue_position, duplicate }`.
5. **Authorization:** OAuth required; subject/tenant ownership enforced.
6. **Scope:** `qcoder.sessions.write`.
7. **External systems:** local persistence and governed launcher when the task reaches the queue head.
8. **Side effects:** enqueues work that may edit the already-bound workspace.
9. **Idempotency:** same persisted key/fingerprint strategy as start.
10. **Failures:** not owned/not found, terminal session state, stale revision, queue bound, rate limit, launch failure.
11. **User-safe recovery:** refresh session on conflict, then submit against the new revision; reuse the same key after uncertain transport failure.
12. **Retry:** bounded and same key only.
13. **Confirmation:** host write confirmation applies.
14. **UI resource:** none; widget may call it through MCP Apps `tools/call`.
15. **Annotations:** `readOnlyHint=false`, `destructiveHint=false`, `openWorldHint=true`, `idempotentHint=true`.
16. **Security scheme:** `oauth2` with `qcoder.sessions.write`.

## 6. `stop_qcoder_session`

1. **Title:** Stop QCoder session.
2. **Description:** Use this when the user explicitly wants to cancel one governed QCoder session. Do not use it to stop arbitrary processes, services, GPUs, other users' sessions, or completed sessions as a cleanup shortcut.
3. **Input schema:** `{ session_id, expected_revision: integer>=1, confirmation: literal "STOP_QCODER_SESSION", reason: string(3..240), idempotency_key }`, strict.
4. **Output schema:** `{ session_id, status: "stopping"|"stopped", session_revision, audit_id, duplicate }`.
5. **Authorization:** OAuth required; subject/tenant ownership enforced.
6. **Scope:** `qcoder.sessions.stop`.
7. **External systems:** managed child process tree and the launcher's lease-release cleanup.
8. **Side effects:** cancels queued tasks and terminates the managed QCoder process; interrupted workspace changes are not reverted.
9. **Idempotency:** repeated exact stop returns the prior outcome; stopping/stopped is treated as success.
10. **Failures:** wrong confirmation, stale revision, not owned/not found, process-control unavailable.
11. **User-safe recovery:** refresh state for conflicts; retry exact request with same key after uncertain transport failure.
12. **Retry:** same key only.
13. **Confirmation:** explicit literal plus destructive host confirmation.
14. **UI resource:** none; console stop button invokes this tool.
15. **Annotations:** `readOnlyHint=false`, `destructiveHint=true`, `openWorldHint=true`, `idempotentHint=true`.
16. **Security scheme:** `oauth2` with `qcoder.sessions.stop`.

## 7. `render_qcoder_console`

1. **Title:** Render QCoder console.
2. **Description:** Use this after retrieving a QCoder session when the user wants an interactive visual console. Do not use it as a substitute for fetching current state or for a session the caller cannot read.
3. **Input schema:** `{ session_id, expected_revision?: integer>=1 }`, strict.
4. **Output schema:** `{ rendered: true, session_id, resource_uri: "ui://qcoder/console/v1" }`.
5. **Authorization:** OAuth required; ownership rechecked.
6. **Scope:** `qcoder.sessions.read`.
7. **External systems:** local session database and UI resource.
8. **Side effects:** none; later explicit widget actions call the separate write/stop tools.
9. **Idempotency:** naturally idempotent.
10. **Failures:** not owned/not found, stale revision, UI resource unavailable.
11. **User-safe recovery:** get the latest session, then render again.
12. **Retry:** safe.
13. **Confirmation:** none.
14. **UI resource:** `ui://qcoder/console/v1`; this is the only tool carrying `_meta.ui.resourceUri`.
15. **Annotations:** `readOnlyHint=true`, `destructiveHint=false`, `openWorldHint=false`, `idempotentHint=true`.
16. **Security scheme:** `oauth2` with `qcoder.sessions.read`.

## Shared output types

`SessionSummary` contains only `session_id`, `workspace_key`, `role`, `mission`, `status`, `revision`, `created_at`, `updated_at`, `active_task_id`, `queued_task_count`, and `last_outcome`. `SessionDetail` adds bounded policy/audit metadata but never paths, PIDs, commands, or environment data. `TranscriptLine` contains `sequence`, `timestamp`, `stream`, and redacted `text` capped at 2,000 characters. `TaskSummary` contains `task_id`, status, timestamps, queue position, and bounded outcome; it omits raw command arguments.
