# QCoder Plugin Source of Truth

Checked: 2026-08-09T10:45:29-05:00 (America/Chicago)

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

## Selected runtime and packages

Versions were checked against the npm registry on 2026-08-09.

| Component                        | Selected version | Reason                                                                                                                        |
| -------------------------------- | ---------------: | ----------------------------------------------------------------------------------------------------------------------------- |
| Node.js                          |       `>=24.0.0` | Current environment is `v24.13.1`; Node 24 provides the required built-in SQLite API and modern abort support.                |
| npm                              |       `>=11.0.0` | Current environment is `11.8.0`.                                                                                              |
| `@modelcontextprotocol/sdk`      |         `1.30.0` | Current npm release.                                                                                                          |
| `@modelcontextprotocol/ext-apps` |          `1.7.5` | Current npm release and version-compatible with the official ext-apps example.                                                |
| `zod`                            |          `4.4.3` | Current npm release for strict schemas.                                                                                       |
| `express`                        |          `5.2.1` | Current npm release for the HTTP host.                                                                                        |
| `react` / `react-dom`            |         `19.2.8` | Current npm release.                                                                                                          |
| `vite`                           |          `7.3.6` | Latest release compatible with `vite-plugin-singlefile` 2.3.0; Vite 8.2.1 was rejected because its peer range is unsupported. |
| `vitest`                         |         `4.1.10` | Current npm release.                                                                                                          |
| `typescript`                     |          `7.0.2` | Current npm release; the lockfile is authoritative after installation.                                                        |

Exact transitive versions are locked by `package-lock.json`. Runtime images and CI use the same Node major.

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
