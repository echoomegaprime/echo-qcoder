# QCoder Plugin Specification

## 1. Architecture classification

**Selected archetype: D - full plugin bundle.**

QCoder needs a focused operating skill, a protected MCP server for live process state and controlled actions, an MCP Apps console for inspection and steering, packaged assets, and private distribution metadata. The UI is justified because operators need to see session state, bounded transcript output, queued work, and stop controls together. It is not a public-directory product.

## 2. Product identity

| Field             | Value                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Plugin name       | Echo QCoder Console                                                                                                  |
| Stable identifier | `echo-qcoder-console`                                                                                                |
| Display name      | QCoder Console                                                                                                       |
| Description       | Start, inspect, steer, and stop governed QCoder builder sessions from ChatGPT or Codex without exposing a raw shell. |
| Intended users    | The ECHO Commander and explicitly authorized ECHO workspace operators.                                               |
| Audience          | Private ECHO workspace.                                                                                              |
| Primary category  | Developer tools                                                                                                      |
| Surfaces          | ChatGPT developer-mode plugins; Codex local/workspace plugins.                                                       |
| Access            | Authenticated only. No anonymous tool is registered.                                                                 |
| Deployment host   | HAMMER, because the governed PowerShell launcher and SOL state live there.                                           |
| Model backend     | FORGE dual-GPU Ollama model `c3po-code`, reached only by the governed launcher.                                      |

## 3. User goals and workflows

### 3.1 Inspect sessions

- Outcome: see active, queued, completed, failed, and stopped QCoder sessions without reading host files.
- Direct prompts: "Show my QCoder sessions"; "What is QCoder building now?"
- Indirect prompts: "Did the local builder finish?"; "Show me what the free builder is doing."
- Reads: session database and bounded, redacted transcript summaries.
- Writes/side effects: none.
- Authorization: `qcoder.sessions.read`; tenant and subject filtering is enforced server-side.
- Output: typed session summaries and stable IDs.
- Failure/recovery: return a typed unavailable or empty result; never fabricate activity.
- UI: optional list or console render.

### 3.2 Preview a task

- Outcome: validate a proposed workspace, fleet role, mission, and task before execution.
- Direct prompts: "Preview a builder task for echo-qcoder"; "Check whether QCoder can work in this repo."
- Required data: configured workspace key, allowed role, task, optional mission label.
- Reads: allowlisted workspace registry and policy.
- Writes/side effects: none.
- Authorization: `qcoder.sessions.read`.
- Output: normalized plan, policy decisions, estimated queue state, and a preview fingerprint.
- Failure/recovery: explain rejected workspace/role/input with a stable code; caller corrects input.
- UI: not required.

### 3.3 Start a governed session

- Outcome: create one logical QCoder session and enqueue its first task through `qcoder.ps1`.
- Direct prompts: "Start QCoder on the plugin tests"; "Have the free builder fix the failing tests in echo-qcoder."
- Required data: workspace key, fleet role, mission/task, idempotency key, preview fingerprint.
- Reads: workspace registry, queue state, prior idempotency record.
- Writes: session/task/audit records and transcript files; launches a governed child process when capacity is available.
- External side effects: QCoder can edit the selected workspace through its SOL-governed toolchain and temporarily acquire the FORGE GPU lease.
- Authorization: `qcoder.sessions.start`; ownership and workspace access checked server-side.
- Output: stable session/task IDs and current state.
- Failure/recovery: duplicate requests return the existing result; launch failure is recorded and the lease/controller cleanup path runs.
- UI: optional console render after the data tool returns.

### 3.4 Send follow-up work

- Outcome: enqueue a bounded task for an existing owned session.
- Direct prompts: "Tell that QCoder session to run the full tests"; "Continue with the next acceptance gate."
- Required data: session ID, expected session revision, task, idempotency key.
- Reads: session ownership/state and task queue.
- Writes: task and audit records; may launch the next governed process.
- External side effects: same bounded workspace effects as starting a session.
- Authorization: `qcoder.sessions.write`.
- Output: task ID, queue position, session revision.
- Failure/recovery: stale revisions fail with a conflict; duplicates return the prior task; busy sessions queue one task at a time.
- UI: console can call the tool without remounting.

### 3.5 Stop a session

- Outcome: cancel queued work and terminate the managed QCoder process tree for one owned session.
- Direct prompts: "Stop QCoder session qcs_..."; "Cancel the local builder."
- Required data: session ID, expected revision, exact confirmation token, reason, idempotency key.
- Reads: ownership/state/process record.
- Writes: state and audit records; cancels tasks and terminates a managed process tree.
- External side effects: releases QCoder's GPU lease through the launcher's `finally` path; interrupted edits may remain in the selected workspace.
- Authorization: `qcoder.sessions.stop`.
- Output: terminal session state and stop audit ID.
- Failure/recovery: already-stopped is an idempotent success; stale revision or wrong confirmation fails closed.
- UI: a stop control is useful; host confirmation remains authoritative.

### 3.6 Render the console

- Outcome: view one prepared session snapshot in an accessible live console.
- Direct prompts: "Open the QCoder console for that session."
- Reads: session snapshot prepared by `get_qcoder_session`.
- Writes/side effects: none during render; explicit UI actions call protected data tools.
- Authorization: `qcoder.sessions.read`.
- Output: a render acknowledgement plus the `ui://qcoder/console/v1` resource.
- Failure/recovery: show loading, empty, auth-required, recoverable error, and stale-snapshot states.
- UI: required for this workflow.

## 4. Non-goals

- No arbitrary shell, PowerShell, SSH, filesystem, registry, service-control, or package-install tool.
- No accepting raw local paths, executable names, command lines, environment variables, access tokens, API keys, or SOL broker tokens from the model.
- No bypass of the QCoder launcher, SOL mission, repository instructions, GPU lease, or verification policy.
- No multi-user public terminal hosting.
- No secret retrieval, credential entry, personal/client-data access, or unrestricted log download.
- No deletion of repositories, session history, or workspace files.
- No force push, account deletion, mass external messaging, or unrelated external automation.
- No activation for general coding questions that do not ask to operate QCoder.

## 5. Data classification

| Data                                                          | Class                                         | Storage and exposure                                                                       |
| ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Plugin metadata and tool schemas                              | Public                                        | Repository and MCP discovery.                                                              |
| Workspace keys and fleet roles                                | Internal                                      | Repository/config; exposed only as allowed identifiers.                                    |
| Mission/task text                                             | Confidential                                  | SQLite and redacted audit; returned only to the owning subject in bounded form.            |
| Session/task IDs and timestamps                               | Internal                                      | SQLite; typed tool results.                                                                |
| Process IDs and host paths                                    | Internal, prohibited from model output        | Stored locally only when needed for lifecycle control.                                     |
| Transcript output                                             | Confidential                                  | Bounded local files; redacted before storage and model/UI output.                          |
| OAuth access/refresh tokens                                   | Authentication data, prohibited from storage  | Parsed from the request and sent only to trusted introspection; never logged or persisted. |
| OAuth client/introspection secret                             | Secret, prohibited from source/results        | Environment or host secret store only.                                                     |
| SOL broker tokens and model credentials                       | Secret, prohibited from plugin storage/output | Resolved only inside the governed launcher/runtime.                                        |
| Personal, financial, health, government-ID, or client records | Prohibited from collection                    | Rejected/redacted; not a supported workflow.                                               |
| Audit records                                                 | Confidential                                  | Local SQLite; subject, action, result, correlation ID, and hashes only.                    |

Raw user prompts are not retained beyond the task text required to operate the requested session. Authentication headers, cookies, secrets, environment blocks, and unrestricted process output are never retained.

## 6. Operational requirements

- Availability target: 99% during HAMMER uptime; fail closed if auth, persistence, launcher, or workspace registry is unavailable.
- Read latency: p95 under 500 ms locally. Mutation acknowledgement: p95 under 2 seconds, excluding QCoder execution.
- Timeouts: 5 seconds introspection, 10 seconds database lock wait, 15 seconds graceful stop followed by process-tree termination, configurable task wall limit capped at 12 hours.
- Retry: one bounded retry for introspection transport failures; no blind retry of process launches. Clients may repeat idempotent mutations with the same key.
- Idempotency: all mutations require a caller idempotency key, persist a request fingerprint, and return the original result for exact duplicates.
- Rate limits: reads 60/minute/subject; starts 6/hour/subject; task sends 30/hour/subject; stops 12/hour/subject.
- Concurrency: one running QCoder process globally because the verified FORGE GPU lease is exclusive; additional tasks remain FIFO queued.
- Persistence: local SQLite in WAL mode plus bounded transcript segments written atomically.
- Retention: session/audit metadata 30 days; transcripts 14 days; daily bounded reaper. Stop does not delete records.
- Deletion: operator-only retention process, never exposed as an MCP tool; legal/security holds override reaping.
- Audit: every auth decision and mutation records correlation ID, subject hash, tenant, action, resource, outcome, and idempotency hash without tokens or task bodies.
- Deployment: HAMMER Windows service or foreground development process, reached privately through Secure MCP Tunnel.
- Rollback: stop the new service, restore the prior versioned package/config, restart, and verify `/healthz`, `/readyz`, `/version`, MCP initialization, and a read-only tool before re-enabling writes.

## 7. Authorization boundary

The resource server uses the public ECHO OAuth authorization server with PKCE S256 and opaque access tokens. Production validation calls a trusted, narrowly exposed introspection endpoint and verifies `active`, audience/resource, expiry, subject, tenant, client binding, and required scope for every protected call. The plugin never treats an opaque token as a JWT and never trusts model-supplied ownership fields.

Workspaces are configured out of band as `workspace_key -> absolute path` mappings. Tools accept only keys. Every session is bound to the authenticated subject and tenant at creation; later calls resolve ownership from persistence.
