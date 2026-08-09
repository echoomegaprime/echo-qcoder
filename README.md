# Echo QCoder

Echo QCoder is the governed, local Qwen Code builder for the ECHO fleet. It runs the verified uncensored 27B Qwen model on FORGE, loads repository `AGENTS.md` and `CLAUDE.md` guidance, enters SOL missions with role-scoped broker access, and exposes a private ChatGPT/Codex plugin for controlled terminal sessions.

The implementation is under active construction. Release claims and exact verification evidence will be recorded in `docs/` as each gate passes.

## Security boundary

QCoder does not expose an unrestricted remote shell. Remote clients operate named QCoder sessions through strict tool contracts, scoped workspaces, bounded tasks, authorization, audit records, and explicit stop controls.
