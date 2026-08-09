# Validation report

Checked 2026-08-09. Evidence is from real commands; skipped checks are not counted as passing.

| Level | Check                                           | Result                         | Evidence                                                                       |
| ----- | ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| 1     | Required files, JSON, paths, tool metadata, CSP | PASS                           | `PLUGIN_CONTRACT_VALID tools=7 paths=ok csp=narrow app_id=absent`              |
| 2     | TypeScript typecheck                            | PASS                           | Server and web `tsc --noEmit` exited 0                                         |
| 2     | Lint and format                                 | PASS                           | ESLint exited 0; Prettier check matched all files                              |
| 2     | Server/UI build                                 | PASS                           | Vite single-file UI and server TypeScript build exited 0                       |
| 3     | Server automated tests                          | PASS                           | 34/34                                                                          |
| 3     | UI automated tests                              | PASS                           | 7/7                                                                            |
| 3     | Python launcher tests                           | PASS                           | 15/15                                                                          |
| 3     | Qwen-native skill contracts                     | PASS                           | 4/4 manifests validated, installed, and source-hash checked                    |
| 3     | Golden prompt regression                        | PASS                           | 60/60, zero unsafe activations                                                 |
| 4     | Local MCP initialize/list/call/resource         | PASS                           | Streamable HTTP smoke returns seven tools and the UI resource                  |
| 4     | MCP Inspector                                   | PASS                           | Inspector 2.1.0 `tools/list` completed against local Streamable HTTP           |
| 5     | Dependency audit                                | PASS                           | Root and isolated Inspector audits: zero vulnerabilities                       |
| 5     | Secret/static security scan                     | PASS                           | Verification script exited without findings                                    |
| 5     | Managed deep repository scan                    | BLOCKED BY EXTERNAL DEPENDENCY | Scanner host lacks required filesystem permission profile after three attempts |
| 6     | ChatGPT developer-mode connection               | BLOCKED BY EXTERNAL DEPENDENCY | Production resource is 404; no OAuth registration or real app ID               |
| 6     | ChatGPT UI/OAuth/write tests                    | BLOCKED BY EXTERNAL DEPENDENCY | Cannot connect host before resource/client registration                        |
| 6     | Echo Desktop QCoder bridge                      | PASS                           | Live provider path returned `ECHO_DESKTOP_QCODER_OK` exactly                   |
| 6     | Echo Desktop packaged host                      | BLOCKED BY EXTERNAL DEPENDENCY | Dirty pre-existing checkout and unavailable authenticated Desktop host context |
| 7     | Private package                                 | PASS                           | Allowlisted ZIP re-extracted and revalidated; SHA-256 sidecar generated        |
| 7     | Public submission                               | NOT APPLICABLE                 | Version 0.1.0 is private ECHO distribution                                     |

The final package is built from a detached clean release commit so concurrent untracked output from the live QCoder terminal cannot enter the archive. Its sidecar is authoritative because embedding an archive hash inside the archive would be circular.
