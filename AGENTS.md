# Echo QCoder Agent Instructions

This repository builds the governed local Qwen Code launcher and its private ChatGPT/Codex control plugin.

Before work:

1. Read `C:\ECHO_OMEGA_PRIME\AGENTS.md` and its required modules.
2. Read this repository's `CLAUDE.md` library-first protocol.
3. Retrieve moving ECHO state through the current SOL broker; never embed sovereign credentials.
4. Preserve unrelated changes and use test-first implementation for nontrivial behavior.

Security invariants:

- Remote plugin tools may control named QCoder sessions, but must never expose a generic shell tool.
- Constrain workspaces to configured roots and validate ownership server-side.
- Keep SOL broker tokens and model-provider values out of tool results, browser state, logs, and source control.
- Separate preview, execution, and stop operations with accurate tool annotations.
- Do not claim ChatGPT connection, deployment, or public submission without live evidence.

Verification commands will be maintained in `README.md` and `scripts/verify-plugin.ps1` as implementation lands.
