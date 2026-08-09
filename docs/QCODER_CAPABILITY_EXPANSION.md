# QCoder Capability Expansion

Checked: 2026-08-09 (America/Chicago)

## Outcome

QCoder now launches directly as a governed `cli-build` agent and ships eight focused Qwen skills. A bounded Serena MCP gives it symbol navigation, reference graphs, diagnostics, and symbolic refactoring across TypeScript, Python, and PowerShell. Local ast-grep adds structural search, mini-SWE-agent supplies an independently invoked issue-to-patch reference loop, and QCoder's deterministic golden evaluator remains the release gate.

Install or refresh the full local powerpack:

```powershell
pwsh -File .\scripts\install-qcoder-powerpack.ps1
```

The installer validates the pinned manifest first, uses exact package versions, keeps npm payloads under `.runtime/powerpack`, preserves other personal Qwen skills, and grants no new target, credential, or network authority. Qwen Code discovers the added skills and MCP configuration on the next session.

## Verified repository set

`config/qcoder-powerpack.json` is the machine-readable source of truth. Every entry pins the repository HEAD checked on 2026-08-09, an MIT or Apache-2.0 license, and the SHA-256 of that license text.

| Repository                     | Capability                                                      | Posture            | Result                                                                                        |
| ------------------------------ | --------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `oraios/serena`                | Semantic symbols, references, diagnostics, symbolic refactoring | Integrated         | Serena 1.6.1 installed; MCP connected; real Python symbol overview passed.                    |
| `ast-grep/ast-grep`            | AST search, rewrite, custom structural lint                     | Integrated         | `@ast-grep/cli` 0.45.1 installed locally and version-verified.                                |
| `SWE-agent/mini-swe-agent`     | Small issue-to-patch loop and SWE-bench patterns                | Installable        | 2.4.6 installed with `uv`; invocation remains explicit and separately governed.               |
| `Aider-AI/aider`               | Repository maps, edit formats, Git-aware coding                 | Reference          | Patterns retained; no competing interactive agent added to the live Qwen session.             |
| `aaif-goose/goose`             | Extensions, recoverable workflows, MCP agent patterns           | Reference          | Patterns retained for future lane evaluation.                                                 |
| `OpenHands/software-agent-sdk` | Agent lifecycle and ephemeral workspace patterns                | Reference          | Patterns retained; no second runtime embedded.                                                |
| `browser-use/browser-use`      | Browser recovery loops and structured page state                | Reference          | QCoder skill routes web work through ECHO's governed browser path.                            |
| `projectdiscovery/nuclei`      | Template-driven protocol and vulnerability validation           | Sidecar            | Reserved for scoped pentester execution; never loaded into ordinary coding sessions.          |
| `NVIDIA/garak`                 | LLM vulnerability and prompt-injection evaluation               | Sidecar            | Reserved for isolated model-security evaluation.                                              |
| `promptfoo/promptfoo`          | Model regression and red-team evaluation                        | Reference/withheld | 0.122.0 was removed after its installed tree reported six high and three moderate advisories. |
| `QwenLM/Qwen3-VL`              | Visual code, document understanding, computer-use perception    | Sidecar            | Separate-node/service placement only; not co-loaded with the leased 27B coder.                |
| `SYSTRAN/faster-whisper`       | Local speech-to-text                                            | Sidecar            | Routed through the existing FORGE speech service.                                             |
| `resemble-ai/chatterbox`       | Local TTS and registered voice cloning                          | Sidecar            | Routed through Personality Forge and existing consent controls.                               |
| `PaddlePaddle/PaddleOCR`       | OCR, layout parsing, multilingual documents                     | Sidecar            | Preferred deterministic OCR companion before expensive multimodal inference.                  |

## Qwen skill inventory

- `qcoder-coding-builder`: governed repository implementation and verification.
- `qcoder-semantic-navigator`: symbol-first investigation and bounded refactoring.
- `qcoder-autonomous-issue-solver`: evidence-to-patch loop with recovery and regression proof.
- `qcoder-self-evaluator`: deterministic tests, golden prompts, MCP checks, and security gates.
- `qcoder-authorized-security`: scoped all-color security planning, execution, cleanup, and retest.
- `qcoder-browser-researcher`: source-grounded browser research through the governed ECHO browser path.
- `qcoder-vision-operator`: OCR and visual analysis through sidecars without displacing the coder.
- `qcoder-audio-operator`: local speech-to-text, voice routing, and consent-aware output.

## Runtime boundaries

The active `huihui_ai/Qwen3.6-abliterated:27b` runtime holds the FORGE two-GPU coding lease. Vision, OCR, hearing, voice, and security scanners remain services or separately authorized sidecars. The ChatGPT plugin continues to use `qwen-plugin-settings.json`, where MCP, shell, web fetch, and sub-agent spawning are denied; only direct local QCoder sessions receive the bounded Serena profile in `qwen-settings.json`.

## Security adoption gate

Before any reference or sidecar becomes integrated:

1. Revalidate its exact commit and license digest.
2. Review installers, containers, telemetry, network destinations, and credential handling.
3. Run dependency, secret, and static security scans.
4. Bind the capability to an allowlisted target, bounded time/output/filesystem, and explicit role.
5. Require confirmation and audit for active security or destructive actions.
6. Preserve evidence, clean up, and independently retest.

The online validator fails closed on repository HEAD drift or license-text changes. A manifest entry is research provenance, not authority.
