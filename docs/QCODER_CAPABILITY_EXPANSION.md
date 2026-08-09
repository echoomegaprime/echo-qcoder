# QCoder Capability Expansion

Checked: 2026-08-09 (America/Chicago)

## Outcome

QCoder now ships four focused Qwen Code skills for coding, authorized all-color security operations, visual perception, and speech/voice routing. The skills reuse ECHO's scoped SOL broker, fleet roles, ShadowGlass, FORGE speech-to-text, Personality Forge, and Echo Desktop rather than granting an unaudited third-party agent unrestricted access.

Install them with `pwsh -File .\scripts\install-qwen-skills.ps1`. Qwen Code discovers personal skills from `~/.qwen/skills` on the next session.

## Upstream repository review

| Repository | Capability | License/adoption posture | Decision |
|---|---|---|---|
| `QwenLM/qwen-code` | Terminal coding agent, skills, subagents, MCP, OpenAI-compatible providers | Apache-2.0 | Already the QCoder shell. Upgrade only after launcher regression tests because HAMMER currently runs 0.15.6. |
| `QwenLM/Qwen-Agent` | Function calling, MCP, code interpreter, RAG, browser assistant | Apache-2.0 repository | Candidate for a sandboxed sidecar; do not replace the working Qwen Code terminal. |
| `OpenHands/software-agent-sdk` and `OpenHands/OpenHands-CLI` | Modular coding-agent SDK and CLI | MIT for these repositories | Evaluate in an isolated coding benchmark before adding another builder lane. |
| `QwenLM/Qwen3-VL` | OCR, document/video understanding, computer use, visual coding | Apache-2.0 | Preferred future vision sidecar. Do not co-load on the leased two-GPU 27B runtime without measured capacity. |
| `usestrix/strix` | Agentic application pentesting, skills, PoC validation, remediation | Apache-2.0 | Best immediate security candidate, but only behind ECHO scope validation, confirmation, containment, and audit. |
| `GreyDGL/PentestGPT` | Docker-first autonomous penetration-testing agent and benchmarks | Review pinned license and submodules before use | Benchmark/research candidate; no direct production integration. |
| `aliasrobotics/CAI` | Offensive/defensive security agents, guardrails, HITL, tracing | Research-use additions; commercial/professional use requires a license | Do not integrate into ECHO production without a commercial license and telemetry review. |
| `SYSTRAN/faster-whisper` | Efficient local speech-to-text | MIT | Already represented by the live FORGE `echo.stt.transcribe` path; keep as the hearing default. |
| `ggml-org/whisper.cpp` | Portable C/C++ Whisper, realtime microphone example | MIT | Fallback candidate for edge/CPU nodes where Python/CTranslate2 is undesirable. |
| `resemble-ai/chatterbox` | Local TTS and voice cloning | MIT | Aligns with the existing ECHO voice stack; use through Personality Forge and consent controls. |

## Capacity and sequencing

The active `huihui_ai/Qwen3.6-abliterated:27b` runtime occupies both FORGE GPUs. Coding remains primary and the sensory services are routed as separate services. A Qwen3-VL deployment is a later measured sidecar or a different-node placement, not an unbounded third model on the same lease.

## Security adoption gate

Before importing any upstream agent or skill:

1. Pin a commit and verify its license.
2. Review install scripts, containers, telemetry, network destinations, and credential handling.
3. Run secret, dependency, and static security scans.
4. Wrap it in an allowlisted target/scope contract with bounded time, output, and filesystem access.
5. Require the ECHO pentester role and exact confirmation for active operations.
6. Preserve evidence, clean up, and independently retest.

No reviewed repository was cloned or executed during this pass; this avoids silently giving an external agent network, shell, or credential authority.

## Current limitation

The live capability registry exposes local FORGE speech-to-text and Personality Forge operations, but did not return the documented generic `echo.voice.speak` alias. QCoder voice therefore routes through Echo Desktop/local playback until that specific registration is restored and verified. This is recorded as degraded capability, not a successful synthesis claim.
