# Build report

Generated 2026-08-09.

## Result

Built QCoder as a governed local Qwen Code builder plus a private-use full-bundle ChatGPT/Codex plugin in a public source repository. The runtime uses Qwen Code 0.21.8 and the verified FORGE-hosted 27B abliterated model across two GPUs with CPU-offload headroom. The plugin supplies one focused controller skill, seven user-goal MCP tools, a versioned MCP Apps console, OAuth authorization contracts, local marketplace support, deterministic PowerShell automation, CI, tests, and release documentation. Eight Qwen-native skills cover governed coding, semantic navigation, autonomous issue solving, self-evaluation, authorized security, browser research, vision, and audio/voice routing.

The 0.3.0 capability powerpack pins 21 permissively licensed upstream repositories by exact Git commit and license digest. Qwen Code 0.21.8, Serena 1.6.1, ast-grep 0.45.1, and mini-SWE-agent 2.4.6 are installed; Serena is connected through an untrusted 16-tool semantic/refactor allowlist. Promptfoo remains reference-only after its 0.122.0 dependency tree failed the high-severity audit gate and was removed.

The release also adds `config/crucible-tool-catalog.json`, a separately validated
catalog now covering two reviewed batches of 20 repositories each (40 total),
every batch independently spanning low, medium, high, and critical risk tiers.
The catalog pins commits and license digests and maps every entry to a Crucible
or AI-red-team route. Batch 2 re-verified all 20 originally proposed candidates
live against GitHub; 12 (Nmap, Masscan, Nikto, SQLMap, theHarvester, Recon-ng,
Zeek, Suricata, Wazuh, Velociraptor, Semgrep, TruffleHog) carried a
non-permissive or unverifiable license and were replaced with equivalent
permissively-licensed tooling, including the catalog's first two generative-AI
red-teaming entries (Garak, PyRIT). It is an integration catalog, not a claim
that all 40 binaries are installed; active, fuzzing, or adversary-emulation
tools remain Crucible-scoped.

The original 8K Ollama tag could not fit Qwen 0.21.8's initialized agent, skill, and tool contract. A separate, reproducible `c3po-code:qcoder-32k` tag now preserves the source model while providing a 32,768-token operational context. A live headless adapter response returned the exact expected text, used 27,270 total tokens without truncation, and reported the full 18.64 GB model resident in VRAM; both 16 GB GPUs showed active allocation.

Continuous maintenance is now real rather than aspirational: a fail-closed autonomy tick is defined every six hours, reconciles one persistent GitHub issue on failures/recovery, and is paired with weekly Dependabot checks. GitHub accepted a manual dispatch but refused to allocate any hosted runner because the account is locked by a billing issue. A limited HAMMER Scheduled Task now runs the identical gate every six hours; its immediate execution completed with result `0`, all four gates green, and the next repetition interval verified as `PT6H`.

Echo Desktop now includes a truthful zero-cost `qcoder` provider bound to the exact local model and FORGE OpenAI-compatible route. Its source configuration, bridge routing, typecheck, build, governance tests, and a live bridge-to-model response were verified; a full packaged Desktop host certification was not claimed from the dirty Desktop checkout.

## Security hardening

Remote sessions are limited to registered workspace keys and entitled roles. The HTTP boundary validates exact resource audience, issuer, expiry, scopes, tenant, client ID, roles, and workspaces. Qwen runs in plugin `auto-edit` mode with shell/web/sub-agent tools denied and a minimal environment. Outputs are bounded/redacted; actions are idempotent and quota-limited; restart recovery and stop verify process-tree and lease cleanup.

## Verification summary

- Server: 34 tests passed.
- Web: 7 tests passed.
- Launcher: 17 tests passed.
- Powerpack/autonomy: 14 tests passed; 21/21 online repository HEAD and license digest checks passed.
- Golden metadata prompts: 60/60 passed.
- Typecheck, lint, format, build, manifest validation, dependency audits, secret scan, MCP smoke, and MCP Inspector passed.
- Qwen native skills: 8/8 installed under the personal Qwen skill root and source-hash checked.
- Serena: direct MCP initialization and a real Python symbol overview passed; Qwen Code reported the server connected after cold initialization.
- Qwen Code: installed executable reported 0.21.8; 32K headless adapter smoke returned `QCODER_ADAPTER_32K_OK`.
- Scheduled autonomy: local four-gate execution returned `QCODER_AUTONOMY_TICK_OK`.
- HAMMER scheduler: `ECHO QCoder Autonomy Tick` is enabled, limited, non-overlapping, and its first run returned `0`.
- Echo Desktop bridge: live `qcoder` call returned `ECHO_DESKTOP_QCODER_OK` exactly.
- Release package: `artifacts/echo-qcoder-console-0.3.0.zip` with its generated SHA-256 sidecar as the non-circular source of truth. The archive includes the powerpack, model-provisioning, and Serena contracts and excludes unrelated untracked files.

## External boundaries

The stable production resource `https://mcp.echo-op.com/oauth-mcp-qcoder-v1`, OAuth client/claims mapping, production retention reaper, ChatGPT Scan Tools result, and real `plugin_asdk_app...` identifier do not yet exist. `.app.json` is intentionally absent. GitHub-hosted jobs are account-blocked before runner allocation by a billing lock; the verified local schedule is the active recurrence. Public source distribution is complete; public ChatGPT-directory submission is not the target.

## Repository

Path: `C:\ECHO_MCP\echo-qcoder`. Remote: `https://github.com/ECHO-OMEGA-PRIME/echo-qcoder`. Unrelated ECHO worktree changes were not touched.
