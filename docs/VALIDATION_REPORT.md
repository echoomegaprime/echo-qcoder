# Validation report

Checked 2026-08-09. Evidence is from real commands; skipped checks are not counted as passing.

| Level | Check                                           | Result | Evidence                                                                       |
| ----- | ----------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| 1     | Required files, JSON, paths, tool metadata, CSP | PASS   | `PLUGIN_CONTRACT_VALID tools=7 paths=ok csp=narrow app_id=absent`              |
| 2     | TypeScript typecheck                            | PASS   | Server and web `tsc --noEmit` exited 0                                         |
| 2     | Lint and format                                 | PASS   | ESLint exited 0; Prettier check matched all files                              |
| 2     | Server/UI build                                 | PASS   | Vite single-file UI and server TypeScript build exited 0                       |
| 3     | Server automated tests                          | PASS   | 34/34                                                                          |
| 3     | UI automated tests                              | PASS   | 7/7                                                                            |
| 3     | Python launcher tests                           | PASS   | 17/17                                                                          |
| 3     | Qwen-native skill contracts                     | PASS   | 8/8 manifests validated, installed, and source-hash checked                    |
| 3     | Powerpack/autonomy contracts                    | PASS   | 15/15 tests; installer rerun completed idempotently                            |
| 3     | Upstream commit/license verification            | PASS   | 21/21 exact repository HEADs and license SHA-256 values revalidated online     |
| 3     | Golden prompt regression                        | PASS   | 60/60, zero unsafe activations                                                 |
| 3     | Six-hour HAMMER autonomy task                   | PASS   | Enabled `PT6H`; immediate run completed with Task Scheduler result `0`         |
| 4     | Local MCP initialize/list/call/resource         | PASS   | Streamable HTTP smoke returns seven tools and the UI resource                  |
| 4     | MCP Inspector                                   | PASS   | Inspector 2.1.0 `tools/list` completed against local Streamable HTTP           |
| 4     | Serena semantic MCP                             | PASS   | 23 tools discovered, 16 allowed, real Python symbol overview passed            |
| 4     | Qwen-to-Serena host connection                  | PASS   | Qwen Code reported `qcoder-serena` connected after cold initialization         |
| 4     | Qwen 0.21.8 32K local inference                 | PASS   | Exact-answer adapter smoke passed at 27,270 tokens with no context truncation  |
| 4     | FORGE model provisioning script                 | PASS   | Git blob has LF endings; `bash -n` passed on FORGE                             |
| 5     | Dependency audit                                | PASS   | Root, isolated Inspector, and remaining powerpack audits: zero vulnerabilities |

## Crucible catalog extension

`node scripts/validate-crucible-catalog.mjs` — PASS (3 batches, 60 pinned
entries; batch 1 low=9 medium=5 high=5 critical=1, batch 2 low=11 medium=6
high=2 critical=1, batch 3 low=16 medium=2 high=1 critical=1). The catalog
unit test passes and enforces the authority mapping per batch: low is
workspace-safe, medium/high require an authorized Crucible scope, and critical
is Crucible-only. Batch 2's 20 candidates were re-verified live: `PyCQA/bandit`,
`github/codeql`, `ServiceNow/BrowserGym`, `anchore/grant`,
`google/osv-scalibr`, `securego/gosec`, `Yelp/detect-secrets`,
`sigstore/cosign`, `in-toto/in-toto`, `open-policy-agent/opa`,
`CycloneDX/cyclonedx-cli`, `sherlock-project/sherlock`, `falcosecurity/falco`,
`owasp-amass/amass`, `google/honggfuzz`, `NVIDIA/garak`, `Azure/PyRIT`,
`OJ/gobuster`, `projectdiscovery/nuclei`, `OpenInterpreter/open-interpreter` —
20/20 exact repository HEADs and license SHA-256 values confirmed online via
the GitHub API; license text was read directly (not just GitHub's SPDX
classifier) for `owasp-amass/amass`, `anchore/grant`, `in-toto/in-toto`, and
`ServiceNow/BrowserGym`, whose classifier reported `NOASSERTION` despite
carrying genuine Apache-2.0 license text.

Batch 3's 20 candidates were likewise re-verified live:
`NationalSecurityAgency/ghidra`, `mandiant/capa`, `mandiant/flare-floss`,
`VirusTotal/yara`, `skylot/jadx`, `androguard/androguard`, `avast/retdec`,
`angr/angr`, `lief-project/LIEF`, `capstone-engine/capstone`,
`binref/refinery`, `horsicq/Detect-It-Easy`, `google/binexport`,
`plyara/plyara`, `gchq/CyberChef`, `struppigel/PortEx`,
`mandiant/stringsifter`, `hasherezade/pe-sieve`, `google/syzkaller`,
`frida/frida` — 20/20 exact repository HEADs and license SHA-256 values
confirmed online. License text was read directly for `capstone-engine/capstone`
(`license: None` from the classifier; confirmed BSD-3-Clause in
`LICENSES/LICENSE.TXT`), `binref/refinery` (`NOASSERTION`; confirmed
BSD-3-Clause), and `frida/frida` (`NOASSERTION`; confirmed wxWindows Library
Licence 3.1, an LGPL-derived permissive-for-linking license). Eight
originally-considered candidates were confirmed copyleft-licensed and excluded:
MobSF (GPL-3.0), Keystone (GPL-2.0), Unicorn (GPL-2.0), radare2 (classifier
`NOASSERTION`; confirmed LGPLv3-with-GPL-plugins in `COPYING.md`), rizin
(LGPL-3.0), Cutter (GPL-3.0), Qiling (GPL-2.0), and objection (GPL-3.0). Two
further candidates (`x64dbg`, whose classifier returned `NOASSERTION` and was
not independently re-verified by reading its license file, and
`eliben/pyelftools`, genuinely Public Domain/Unlicense but outside this
batch's chosen license set) were left out rather than included on an
unverified or out-of-policy basis.
| 5 | Secret/static security scan | PASS | Verification script exited without findings |
| 5 | Managed deep repository scan | BLOCKED BY EXTERNAL DEPENDENCY | Scanner host lacks required filesystem permission profile after three attempts |
| 6 | ChatGPT developer-mode connection | BLOCKED BY EXTERNAL DEPENDENCY | Production resource is 404; no OAuth registration or real app ID |
| 6 | ChatGPT UI/OAuth/write tests | BLOCKED BY EXTERNAL DEPENDENCY | Cannot connect host before resource/client registration |
| 6 | Echo Desktop QCoder bridge | PASS | Live provider path returned `ECHO_DESKTOP_QCODER_OK` exactly |
| 6 | Echo Desktop packaged host | BLOCKED BY EXTERNAL DEPENDENCY | Dirty pre-existing checkout and unavailable authenticated Desktop host context |
| 6 | GitHub-hosted workflow execution | BLOCKED BY EXTERNAL DEPENDENCY | Job received zero steps; GitHub annotated an account billing lock |
| 7 | Private-use plugin package | PASS | Allowlisted ZIP re-extracted and revalidated; SHA-256 sidecar generated |
| 7 | Public source release | PASS | Full tracked history scan found zero token/private-key candidates |
| 7 | Public ChatGPT submission | NOT APPLICABLE | Version 0.3.0 remains a private-use plugin |

The final package is built from a detached clean release commit so concurrent untracked output from the live QCoder terminal cannot enter the archive. Its sidecar is authoritative because embedding an archive hash inside the archive would be circular.
