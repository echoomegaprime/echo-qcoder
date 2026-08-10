---
name: qcoder-session-operator
description: Operate ECHO's governed QCoder builder sessions by previewing work, starting an allowlisted workspace session, inspecting progress, sending bounded follow-up tasks, rendering the console, or stopping a session. Use when the user explicitly asks to run or control QCoder, the free local Qwen builder, or an existing QCoder session. Do not trigger for general coding advice, arbitrary shell access, unrelated process control, or secret retrieval.
---

# QCoder Session Operator

Use the QCoder MCP tools as a goal-oriented session controller. Never approximate the workflow with a shell command or infer a workspace path, session ID, authorization, completion state, or test result.

## Expected input

Identify the user's intended outcome, registered workspace key, fleet role, mission, and task. A direct request to operate QCoder is required. If the user refers to "that session," resolve it with `list_qcoder_sessions`; ask only when multiple plausible owned sessions remain.

## Required sequence

1. For status or history, call `list_qcoder_sessions`, then `get_qcoder_session` when detail is needed.
2. For new work, call `preview_qcoder_task` first. Stop if it rejects the workspace, role, or policy.
3. Summarize the accepted preview and call `start_qcoder_session` with the returned fingerprint and a new idempotency key.
4. Use `send_qcoder_task` only for a returned session ID and its latest revision. Refresh on `CONFLICT` before deciding whether to retry.
5. Call `render_qcoder_console` only after current session data has been retrieved and the user benefits from the visual console.
6. For cancellation, refresh the session, state the exact target and effect, then call `stop_qcoder_session` with the latest revision and exact confirmation literal. Do not stop other processes.
7. Report only the state and evidence returned by the tools. A queued or running task is not complete.

## Decision points

- Use `builder` for ordinary implementation, `cli-build` for launcher/CLI work, and another fleet role only when its responsibility materially matches the task.
- When QCoder is busy, accept the returned queue position; do not start a parallel process outside the controller.
- If authentication is missing or scopes changed, surface the tool's relink challenge. Never request or handle a token.
- If a mutation's transport result is uncertain, retry the exact request with the same idempotency key.
- If the user changes the task payload, use a new idempotency key.

## Facts that must not be inferred

Do not infer session completion, workspace ownership, QCoder health, GPU residency, tests, commits, deployment, or authorization. Do not infer that a human-visible terminal exists; this controller manages governed headless tasks and presents a bounded console view.

## Stop conditions

Stop the workflow when authorization fails closed, the workspace is not registered, the preview is rejected, the session is not owned, the requested operation would require arbitrary shell access, or a doctrine hard limit is reached. Return the typed failure and the safe recovery path.

## Output format

State the session ID, workspace key, role, status, current/queued task IDs, latest bounded outcome, and next governed action. Never include local paths, PIDs, command lines, tokens, environment variables, or unredacted transcript data.

## Supporting reference

Read `references/tool-workflows.md` when routing is ambiguous or when recovering a failed mutation.
