# QCoder tool workflows

## Inspect

`list_qcoder_sessions` -> select only from returned owned IDs -> `get_qcoder_session` -> optionally `render_qcoder_console`.

## Start

`preview_qcoder_task` -> verify `accepted=true` -> `start_qcoder_session` with the exact fingerprint and a unique idempotency key -> optionally render.

## Continue

`get_qcoder_session` -> `send_qcoder_task` with the current revision and a unique key -> on `CONFLICT`, fetch again before resubmitting.

## Stop

`get_qcoder_session` -> name the target and effect -> `stop_qcoder_session` with the current revision, `STOP_QCODER_SESSION`, reason, and unique key -> fetch until terminal state.

## Recovery

- `AUTH_REQUIRED`, `AUTH_INVALID`, `SCOPE_REQUIRED`: use the returned OAuth challenge; never ask for a credential.
- `NOT_FOUND`: list sessions; do not probe neighboring IDs.
- `CONFLICT`: fetch current state and reassess.
- `RATE_LIMITED`: respect the returned retry interval.
- `UNAVAILABLE` or `LAUNCH_FAILED`: report the recorded state; an exact mutation retry must reuse its idempotency key.
