# QCoder Plugin Source of Truth

Checked: 2026-08-09T13:32:30-05:00 (America/Chicago)

## Official OpenAI documentation reviewed

The implementation is grounded in the current OpenAI plugin architecture, not the retired OpenAPI-only plugin format.

- [Plugin quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [Plan tools](https://developers.openai.com/plugins/plan/tools)
- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Build ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui)
- [Authentication](https://developers.openai.com/plugins/build/auth)
- [Build skills](https://developers.openai.com/plugins/build/skills)
- [Package plugins](https://developers.openai.com/plugins/build/plugins)
- [Plugin examples](https://developers.openai.com/plugins/build/examples)
- [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Public submission](https://developers.openai.com/plugins/deploy/submission)
- [App review](https://developers.openai.com/plugins/deploy/app-review)
- [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors)
- [Security and privacy](https://developers.openai.com/plugins/guides/security-privacy)
- [Metadata optimization](https://developers.openai.com/plugins/guides/optimize-metadata)
- [Plugin guidelines](https://developers.openai.com/plugins/app-guidelines)
- [Plugin reference](https://developers.openai.com/plugins/reference)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

The current developer-mode path is ChatGPT **Settings -> Security and login -> Developer mode**, subject to workspace policy. A developer-mode plugin is created from the ChatGPT Plugins page. Secure MCP Tunnel is appropriate for this private HAMMER-hosted MCP server and does not qualify as a public-submission endpoint.

## Official examples examined

- `openai/openai-apps-sdk-examples`, commit `18cc38e78a968712c357bacdc3c79fead5bfc6b4`, especially `mcp_app_basics_node`.
- `modelcontextprotocol/ext-apps`, commit `92f46a574568a3ddac7600343b7d3c4c4ed7b588`, especially `examples/system-monitor-server`.

The system-monitor example is the closest match because QCoder renders a live process/session console. The QCoder implementation keeps data and mutation tools separate from the render tool, which avoids remounting the widget for every operation.

## Qwen and capability repositories reviewed

Current upstream repository state and license text were checked again on 2026-08-09 before selecting power-ups. Exact commits and license SHA-256 values are machine-readable in `config/qcoder-powerpack.json`:

- [Qwen Code](https://github.com/QwenLM/qwen-code) for terminal skills, checkpoints, subagents, MCP, review, and provider compatibility. The live npm registry selected `@qwen-code/qwen-code` 0.21.8.
- [Qwen-Agent](https://github.com/QwenLM/Qwen-Agent) for function calling, MCP, RAG, browser, and sandboxed code-interpreter patterns.
- [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) for future OCR, UI understanding, visual coding, and computer-use sidecar work.
- [Serena](https://github.com/oraios/serena) and [ast-grep](https://github.com/ast-grep/ast-grep) for bounded semantic and structural repository navigation.
- [Aider](https://github.com/Aider-AI/aider), [Goose](https://github.com/aaif-goose/goose), [OpenHands software-agent-sdk](https://github.com/OpenHands/software-agent-sdk), and [mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent) for repository maps, recoverable agent loops, lifecycle isolation, and issue-to-patch patterns.
- [browser-use](https://github.com/browser-use/browser-use) for browser recovery patterns, not credential or browser authority.
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) for accessibility-tree browser control, isolated profiles, and bounded origin patterns; its own documentation explicitly does not treat it as a security boundary.
- [GitHub Spec Kit](https://github.com/github/spec-kit) for spec-driven development and cross-artifact acceptance planning.
- [MarkItDown](https://github.com/microsoft/markitdown) for deterministic document-to-Markdown context extraction.
- [PR-Agent](https://github.com/qodo-ai/pr-agent) for pull-request review and test-suggestion patterns without automated merge authority.
- [Superpowers](https://github.com/obra/superpowers) for test-first, systematic-debugging, and verification workflow patterns.
- [Nuclei](https://github.com/projectdiscovery/nuclei) and [Garak](https://github.com/NVIDIA/garak) as governed security sidecars.
- [Promptfoo](https://github.com/promptfoo/promptfoo) as a reference only; the selected 0.122.0 package was removed because its installed dependency graph failed the high-severity audit gate.
- [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [Chatterbox](https://github.com/resemble-ai/chatterbox), and [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) as separately placed perception and voice sidecars.

Serena, ast-grep, and mini-SWE-agent were installed from exact package versions. Serena's MCP connection and a real Python symbol query passed. Repository inclusion does not grant shell, network, target, or credential authority; unintegrated projects remain patterns or independently governed sidecars.

## Selected runtime and packages

Versions were checked against the npm registry on 2026-08-09.

| Component                        | Selected version | Reason                                                                                                                        |
| -------------------------------- | ---------------: | ----------------------------------------------------------------------------------------------------------------------------- |
| Node.js                          |       `>=24.0.0` | Current environment is `v24.13.1`; Node 24 provides the required built-in SQLite API and modern abort support.                |
| npm                              |       `>=11.0.0` | Current environment is `11.8.0`.                                                                                              |
| `@qwen-code/qwen-code`           |         `0.21.8` | Exact installed CLI version; verified from the executable actually resolved by `PATH`.                                        |
| `@modelcontextprotocol/sdk`      |         `1.30.0` | Current npm release.                                                                                                          |
| `@modelcontextprotocol/ext-apps` |          `1.7.5` | Current npm release and version-compatible with the official ext-apps example.                                                |
| `zod`                            |          `4.4.3` | Current npm release for strict schemas.                                                                                       |
| `express`                        |          `5.2.1` | Current npm release for the HTTP host.                                                                                        |
| `react` / `react-dom`            |         `19.2.8` | Current npm release.                                                                                                          |
| `vite`                           |          `7.3.6` | Latest release compatible with `vite-plugin-singlefile` 2.3.0; Vite 8.2.1 was rejected because its peer range is unsupported. |
| `vitest`                         |         `4.1.10` | Current npm release.                                                                                                          |
| `typescript`                     |          `7.0.2` | Current npm release; the lockfile is authoritative after installation.                                                        |

Exact transitive versions are locked by `package-lock.json`. Runtime images and CI use the same Node major.

The live Ollama metadata reports the source Qwen model as 27.8B, Q4_K_M, architecture `qwen35`, with an upstream 262,144-token architectural maximum. QCoder deliberately provisions a bounded 32,768-token derivative because its current initialized agent/tool contract uses roughly 27K tokens and could not operate under the former 8K tag. The lower 32K operational limit preserves GPU/CPU-offload headroom on FORGE.

## Compatibility decisions

- MCP Apps (`ui/initialize`, notifications, `tools/call`, and `ui/message`) is the primary UI bridge. `window.openai` is optional and feature-detected only.
- Streamable HTTP is served at `/mcp`; SSE-only and legacy OpenAPI plugin transports are rejected.
- `.codex-plugin/plugin.json` is the package root contract. `.app.json` is intentionally absent until ChatGPT supplies a real `plugin_asdk_app...` identifier.
- `.mcp.json` describes the QCoder MCP server because this package owns it; it is not used as a substitute for `.app.json`.
- No compatibility alias weakens tool scopes or turns a read tool into a write tool.

## Repository patterns rejected or retained

- Rejected the older ECHO `echo-apps-mcp` scaffold as the implementation base because it does not provide the complete current auth, packaging, test, or MCP Apps bridge contract.
- Retained ECHO's live OAuth authority at `mcp.echo-op.com` as the identity provider. It issues opaque tokens from an encrypted transactional store, so QCoder uses token introspection and must not attempt JWT/JWKS validation.
- Retained the governed `launcher/qcoder.ps1` as the only process entry point. The plugin never exposes arbitrary shell commands.

## Live limitations affecting host validation

- The live ECHO OAuth authority currently returns `404` for `/oauth/introspect`; a bounded authority integration is required before protected production tool calls can be connected.
- No ChatGPT-generated `plugin_asdk_app...` ID has been observed for QCoder. The repository therefore contains no `.app.json`.
- Secure MCP Tunnel creation requires Platform tunnel permissions and a real `tunnel_id`; neither is invented in source.
- ChatGPT developer-mode and write-tool availability depend on the active workspace policy and plan. Local protocol and authorization tests remain authoritative until the real host connection is exercised.
