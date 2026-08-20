# QCoder Capability Expansion

Checked: 2026-08-09 (America/Chicago)

## Outcome

QCoder launches directly as a governed `cli-build` agent on Qwen Code 0.21.8 and ships eight focused Qwen skills. A bounded Serena MCP gives it symbol navigation, reference graphs, diagnostics, and symbolic refactoring across TypeScript, Python, and PowerShell. Local ast-grep adds structural search, mini-SWE-agent supplies an independently invoked issue-to-patch reference loop, and QCoder's deterministic golden evaluator remains the release gate. The production model uses the single stable `c3po-code:echo-abliterated-128k` alias behind the fail-closed FORGE route; former 32K and 64K aliases are historical and are not selected by launchers or registry entries.

Install or refresh the full local powerpack:

```powershell
pwsh -File .\scripts\install-qcoder-powerpack.ps1
```

The installer validates the pinned manifest first, uses exact package versions, keeps npm payloads under `.runtime/powerpack`, preserves other personal Qwen skills, and grants no new target, credential, or network authority. Qwen Code discovers the added skills and MCP configuration on the next session.

## Verified repository set

`config/qcoder-powerpack.json` is the machine-readable source of truth. Every entry pins the repository HEAD checked on 2026-08-09, an MIT or Apache-2.0 license, and the SHA-256 of that license text.

| Repository                     | Capability                                                      | Posture            | Result                                                                                         |
| ------------------------------ | --------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `QwenLM/qwen-code`             | Terminal agent, skills, MCP, checkpoints, worktrees             | Integrated         | 0.21.8 installed into the resolved executable prefix and exact-version verified.               |
| `QwenLM/Qwen-Agent`            | Function calling, RAG, MCP, sandboxed interpreter patterns      | Sidecar            | Patterns retained for future service-side orchestration without embedding a second live agent. |
| `oraios/serena`                | Semantic symbols, references, diagnostics, symbolic refactoring | Integrated         | Serena 1.6.1 installed; MCP connected; real Python symbol overview passed.                     |
| `ast-grep/ast-grep`            | AST search, rewrite, custom structural lint                     | Integrated         | `@ast-grep/cli` 0.45.1 installed locally and version-verified.                                 |
| `SWE-agent/mini-swe-agent`     | Small issue-to-patch loop and SWE-bench patterns                | Installable        | 2.4.6 installed with `uv`; invocation remains explicit and separately governed.                |
| `Aider-AI/aider`               | Repository maps, edit formats, Git-aware coding                 | Reference          | Patterns retained; no competing interactive agent added to the live Qwen session.              |
| `aaif-goose/goose`             | Extensions, recoverable workflows, MCP agent patterns           | Reference          | Patterns retained for future lane evaluation.                                                  |
| `OpenHands/software-agent-sdk` | Agent lifecycle and ephemeral workspace patterns                | Reference          | Patterns retained; no second runtime embedded.                                                 |
| `browser-use/browser-use`      | Browser recovery loops and structured page state                | Reference          | QCoder skill routes web work through ECHO's governed browser path.                             |
| `microsoft/playwright-mcp`     | Accessibility-tree browser control and isolated profiles        | Sidecar            | Reserved for bounded browser sessions; never treated as a security boundary.                   |
| `github/spec-kit`              | Spec-driven development and acceptance task generation          | Reference          | Patterns feed QCoder's spec-to-test workflow without introducing a competing runtime.          |
| `microsoft/markitdown`         | Office/document conversion to bounded Markdown                  | Sidecar            | Selected for deterministic context extraction before model ingestion.                          |
| `qodo-ai/pr-agent`             | Pull-request review and test-suggestion patterns                | Reference          | Review patterns retained; no automatic public review or merge authority granted.               |
| `obra/superpowers`             | Test-first, debugging, and verification workflow patterns       | Reference          | Workflow patterns reinforce QCoder's existing verification gates.                              |
| `projectdiscovery/nuclei`      | Template-driven protocol and vulnerability validation           | Sidecar            | Reserved for scoped pentester execution; never loaded into ordinary coding sessions.           |
| `NVIDIA/garak`                 | LLM vulnerability and prompt-injection evaluation               | Sidecar            | Reserved for isolated model-security evaluation.                                               |
| `promptfoo/promptfoo`          | Model regression and red-team evaluation                        | Reference/withheld | 0.122.0 was removed after its installed tree reported six high and three moderate advisories.  |
| `QwenLM/Qwen3-VL`              | Visual code, document understanding, computer-use perception    | Sidecar            | Separate-node/service placement only; not co-loaded with the leased 27B coder.                 |
| `SYSTRAN/faster-whisper`       | Local speech-to-text                                            | Sidecar            | Routed through the existing FORGE speech service.                                              |
| `resemble-ai/chatterbox`       | Local TTS and registered voice cloning                          | Sidecar            | Routed through Personality Forge and existing consent controls.                                |
| `PaddlePaddle/PaddleOCR`       | OCR, layout parsing, multilingual documents                     | Sidecar            | Preferred deterministic OCR companion before expensive multimodal inference.                   |

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

The active `huihui_ai/Qwen3.6-abliterated:27b` runtime is exposed to QCoder as `c3po-code:echo-abliterated-128k` and holds the FORGE two-GPU coding lease. The derivative is reproducible with `deployment/forge/provision-qcoder-model.sh`, pins `num_ctx` to 131,072, and refuses a source-digest mismatch. Raw Ollama remains isolated on loopback port 11438; launcher traffic reaches the audited gateway on port 11437. The gateway requires exact digest, model, context, container health, and full two-GPU residency; performs authoritative no-truncate/no-shift token preflight; and enforces one active request plus a bounded queue. Vision, OCR, hearing, voice, and security scanners remain services or separately authorized sidecars. The ChatGPT plugin continues to use `qwen-plugin-settings.json`, where MCP, shell, web fetch, and sub-agent spawning are denied; only direct local QCoder sessions receive the bounded Serena profile in `qwen-settings.json`.

## Recurring self-maintenance

`.github/workflows/qcoder-autonomy-tick.yml` runs every six hours and on manual dispatch. It verifies exact upstream drift, audits root and Inspector dependencies, and executes the regression suite. One persistent issue is opened or refreshed on failure and closed after recovery. `.github/dependabot.yml` supplies weekly dependency proposals. Neither system may push or merge changes automatically.

## Security adoption gate

Before any reference or sidecar becomes integrated:

1. Revalidate its exact commit and license digest.
2. Review installers, containers, telemetry, network destinations, and credential handling.
3. Run dependency, secret, and static security scans.
4. Bind the capability to an allowlisted target, bounded time/output/filesystem, and explicit role.
5. Require confirmation and audit for active security or destructive actions.
6. Preserve evidence, clean up, and independently retest.

The online validator fails closed on repository HEAD drift or license-text changes. A manifest entry is research provenance, not authority.
