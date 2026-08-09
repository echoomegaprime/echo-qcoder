# Echo QCoder

Echo QCoder is ECHO's governed, zero-metered builder backed by the FORGE-hosted `huihui_ai/Qwen3.6-abliterated:27b` model. The `qcoder` PowerShell alias launches Qwen Code 0.21.8 with the repository's `AGENTS.md` and `CLAUDE.md`, a durable SOL mission, role-scoped broker access, a 32K context profile, and a verified dual-GPU lease.

This public source repository also packages QCoder Console, a private-use full-bundle ChatGPT/Codex plugin with one focused skill, seven MCP tools, and an accessible MCP Apps console. It starts, inspects, steers, and stops named builder sessions without exposing raw shell, arbitrary paths, process IDs, or credentials. Publishing the source does not publish ECHO's OAuth authority, private model endpoint, credentials, registered workspaces, or ChatGPT connection.

## Supported workflows

- Launch interactive QCoder locally with `qcoder`.
- Preview and start a governed task in an allowlisted repository.
- List sessions or inspect bounded, redacted transcripts.
- Queue a follow-up task with optimistic concurrency and idempotency.
- Render the session console and stop a session with two-stage confirmation.
- Use eight focused Qwen skills for coding, semantic navigation, autonomous issue solving, self-evaluation, authorized all-color security validation, browser/vision work, and local speech/voice workflows.

It does not expose a general shell, arbitrary filesystem access, unregistered workspaces, anonymous writes, public posting, or unrestricted security tooling.

## Architecture

The MCP server exposes Streamable HTTP at `/mcp` plus `/healthz`, `/readyz`, and `/version`. SQLite stores session state, idempotency records, and stop audits; bounded JSONL files store redacted transcripts. The server launches `launcher/qcoder.ps1`, which acquires the FORGE GPU lease and runs Qwen Code with the remote-safe `qwen-plugin-settings.json` profile. Direct local `qcoder` sessions default to the `cli-build` role and add a bounded Serena semantic MCP profile for TypeScript, Python, and PowerShell. The single-file React UI uses the MCP Apps bridge and resource `ui://qcoder/console/v1`.

HTTP mode requires resource-bound OAuth introspection plus per-tool scopes and explicit client, tenant, role, and workspace claims. Trusted local stdio is available only when `QCODER_TRUSTED_STDIO=1` is set by the packaged MCP configuration.

## Tools

`list_qcoder_sessions`, `get_qcoder_session`, `preview_qcoder_task`, `start_qcoder_session`, `send_qcoder_task`, `stop_qcoder_session`, and `render_qcoder_console` are documented in [docs/TOOL_CONTRACTS.md](docs/TOOL_CONTRACTS.md).

## Prerequisites

- Windows PowerShell 7
- Node.js 24+ and npm 11+
- Python 3.11+
- Qwen Code 0.21.8 (installed and exact-version verified by the powerpack installer)
- FORGE connectivity and the existing ECHO SOL/GPU-lease runtime

## Install and verify

```powershell
Set-Location C:\ECHO_MCP\echo-qcoder
npm ci --ignore-scripts
npm ci --prefix scripts/inspector --ignore-scripts
pwsh -File .\scripts\verify-plugin.ps1
pwsh -File .\scripts\test-mcp.ps1 -SkipBuild -Inspector
pwsh -File .\scripts\package-plugin.ps1
```

For the local marketplace, run `pwsh -File .\scripts\install-local-marketplace.ps1`; add `-Register` only on a Codex build that supports the documented plugin commands. Restart or refresh Codex after registration.

Install or refresh the QCoder-specific Qwen skills without disturbing other personal skills:

```powershell
pwsh -File .\scripts\install-qwen-skills.ps1
```

Install the audited local powerpack (Qwen Code 0.21.8, Serena 1.6.1, ast-grep 0.45.1, mini-SWE-agent 2.4.6, the eight Qwen skills, and the built-in regression evaluator):

```powershell
pwsh -File .\scripts\install-qcoder-powerpack.ps1
```

Qwen Code discovers newly installed skills and MCP configuration on the next session. In a session, `/skills qcoder-coding-builder` invokes one explicitly. Promptfoo is pinned only as a reviewed reference: its 0.122.0 installation was removed after its reachable transitive tree failed the high-severity dependency audit. The full 21-repository manifest and adoption decisions are recorded in [QCoder capability expansion](docs/QCODER_CAPABILITY_EXPANSION.md).

## Continuous autonomy

The repository runs a fail-closed QCoder autonomy tick every six hours. It checks pinned upstream commits and license digests, audits both npm dependency trees, and runs the regression suite. A failure updates one persistent GitHub issue instead of creating alert noise; recovery closes that issue. Dependabot checks npm workspaces, the isolated MCP Inspector tree, and GitHub Actions weekly. Run the same gate locally:

```powershell
node .\scripts\autonomy-tick.mjs --output .\artifacts\qcoder-autonomy-report.json
```

The tick proposes and reports drift; it never auto-merges code, grants new authority, or weakens a security boundary.

For local HTTP development, configure the four OAuth variables shown in `.env.example`, then run `pwsh -File .\scripts\run-local.ps1`. For trusted stdio, use `pwsh -File .\scripts\run-local.ps1 -Mode stdio`.

## ChatGPT connection

The intended private route is `https://mcp.echo-op.com/oauth-mcp-qcoder-v1` through Secure MCP Tunnel. The production resource route, OAuth client registration, and ChatGPT-generated `plugin_asdk_app...` ID are external integration dependencies and are not fabricated here. Once ChatGPT registration returns the real ID, generate `.app.json` atomically:

```powershell
pwsh -File .\scripts\configure-app-id.ps1 -AppId 'plugin_asdk_app_REAL_ID'
```

See [local testing](docs/LOCAL_TESTING.md), [deployment](docs/DEPLOYMENT.md), [security](docs/SECURITY_MODEL.md), and [troubleshooting](docs/TROUBLESHOOTING.md). Exact results are in [the validation report](docs/VALIDATION_REPORT.md).

## Versioning

Tool names and required fields remain backward compatible within `0.3.x`. Incompatible UI changes receive a new `ui://` resource version. The plugin archive is deterministic where the ZIP implementation permits and always receives a SHA-256 sidecar.
