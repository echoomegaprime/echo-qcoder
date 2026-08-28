# HANDOFF — QCoder Sovereign + Echo phone chat app (2026-08-11)

Paste everything below the line into the next session to resume.

---

You are resuming a multi-part build for Commander Bobby Don McWilliams II. Read these two memory files FIRST — they have full detail, evidence, and gotchas:
- `C:\Users\bobmc\.claude\projects\C--ECHO-OMEGA-PRIME\memory\project-qcoder-sovereign-buildout-20260810.md`
- `C:\Users\bobmc\.claude\projects\C--ECHO-OMEGA-PRIME\memory\reference-echo-qcoder-ground-truth-map-20260810.md`

## What this work is
Turning `qcoder` (Qwen Code → FORGE model) into a full Claude-Code peer, AND a phone-installable chat app for the Commander.

## DONE + VERIFIED (do not redo; verify before trusting)
1. **QCoder 128K**: model `c3po-code:qcoder-128k` (num_ctx 131072) live on FORGE Ollama container `echo-ollama`. Repo consistency committed (`echo-qcoder` f7f905a); powerpack tests 11/11.
2. **91 skills** in `~/.qwen/skills` (81 from github.com/echoomegaprime/echo-ai-skills cloned to `C:\ECHO_MCP\echo-ai-skills`, +8 qcoder qwen-skills, +elite-autonomous-engineering, +1).
3. **QWEN governance** placed: `C:\ECHO_OMEGA_PRIME\QWEN.md` + `~/.qwen/QWEN.md` (doorway), `C:\ECHO_OMEGA_PRIME\QWEN\QWEN_SOVEREIGN_AUTONOMY_KERNEL.md` + `QWEN_GLOBAL_CUSTOM_INSTRUCTIONS.txt` + `FLEET_ROLES_REGISTRY.md`.
4. **30 fleet roles**: `~/.qwen/commands/role.toml` (`/role <name>` → reads FLEET_ROLES/<name>.md+boot, loads skills, `sol_cli role switch`) + `roles.toml` (`/roles`). Registry auto-loads via `qwen-sovereign-settings.json` context.fileName. (TOML must use LITERAL `'''` strings — backslash Windows paths break basic strings.)
5. **Marketplaces** added as qwen sources: `echo-omega-prime-marketplace` (local) + `claude-code-plugins` (github). `qwen extensions sources list` confirms.
6. **Sovereign launcher**: `C:\ECHO_MCP\echo-qcoder\launcher\qcoder-sovereign.ps1` + `qwen-sovereign-settings.json` (128K model + QWEN context + 10 ECHO MCP servers). Profile command **`qcoders`** launches it. Windows Terminal set as default terminal (paste works). `qcoder` alias still routes to codex-auto→codex.exe exec (headless, "sticks") — use `qcoders`.
7. **Build-tracker builder prompt**: `C:\ECHO_MCP\echo-qcoder\prompts\build-tracker-builder.md`; CLAUDE.md doorway (L~191) lists QCoder as a lane.
8. **Echo phone chat PWA — LIVE**: `https://voicemem.echo-op.com/app/` (installable; served from the `echo-voice-memory` service on FORGE, files at `/home/forge/echo_chat_app/`, source `C:\ECHO_MCP\echo-qcoder\phone-chat\`). Backend `POST /chat` on voicemem proxies to Ollama model `qwen2.5:7b-instruct` (FAST ~0.6s warm; 128K was too heavy — 4min cold-load). CORS `*` added to voicemem. Verified: app 200, manifest valid, chat replies as "Echo Prime".

## OPEN THREADS (next actions, priority order)
1. **Authenticated all-caps agent for the phone app** (the Commander's active ask). Do NOT expose all ~13.8K caps behind the OPEN /chat endpoint — that is an internet-facing RCE (fail-open, forbidden). Build: (a) add echo-auth login to the PWA; (b) behind login, a tool-calling agent loop over ECHO caps via the LOCAL gate `http://127.0.0.1:8000/sdk/invoke` (X-Echo-API-Key = SOVEREIGN_KEY from `/home/forge/.echo_sovereign_key` — WORKS on the LAN gate; the PUBLIC sdk1.echo-op.com gate REJECTS that key). Scope to the Commander's identity.
2. **Verify the 10 ECHO MCP servers are CALLABLE inside qwen** (they spawn; `ECHO_VAULT_HMAC_SECRET` not in env → vault/sovereign/cluster-ops may fail auth; memory/queue/mega need only ECHO_SOVEREIGN_KEY = present).
3. **Wire true qwen hooks** (forge-check / arcanum-enhance / library-first as programmatic PreToolUse). qwen-code HAS hooks (`--safe-mode` disables "context files, hooks, extensions, skills, MCP servers"). Currently enforced only via QWEN.md/kernel instructions.
4. **End-to-end interactive proof**: run `qcoders` → `/roles` → `/role builder` live (not yet done; a headless smoke timed out at 150s on MCP/prefill).

## GOTCHAS (cost real errors this session)
- Killing processes by cmdline substring (`echo-memory\server`) ALSO kills Claude Code's own MCP servers (shared `server.py`). Scope kills by PID.
- `wt.exe` (WindowsApps alias) won't launch via Start-Process/`cmd start` from this runtime. Use `Start-Process pwsh` or have the Commander open a terminal.
- `forge_run.cmd` (cmd.exe) has an ~8KB command-line limit — use `scp -i C:\Users\bobmc\.ssh\id_ed25519_bravo forge@192.168.1.220:` for files; base64 heredocs die over the ssh path (use `printf|base64 -w0` → `echo $B64|base64 -d`).
- FORGE Ollama `MAX_LOADED_MODELS=1` → any model reloads (cold-load) after eviction; 128K = ~4min, 7B = ~1min cold / <1s warm. Keep phone chat on a small model.
- Reading an exit code through a pipe (`cmd|tail;echo $?`) is tail's status. Vercel MCP deploy 403s (no project-create permission).

Confirm each DONE item's live state before building on it. Ask the Commander which OPEN thread to take first (his last active ask was the authenticated all-caps agent).

> UPDATE 2026-08-12: renamed + clean domain LIVE at https://echo.echo-op.com (root, installs as "Echo"). Vanity host echo.echo-op.com -> voicemem:8340 added to echo-ept VANITY_HOST_PROXY; voicemem serves the app at root + /chat backend (relative, same-origin).
