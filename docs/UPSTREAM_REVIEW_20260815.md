# QCoder upstream review — 2026-08-15

This review covers every upstream head change detected by
`node scripts/validate-powerpack.mjs --online` before the manifest pins were
advanced. GitHub's compare and contents APIs were queried against each exact
old/new commit pair.

## Decision boundary

- All 12 target commits are linear descendants of their recorded pins
  (`status=ahead`, `behind_by=0`).
- Every license file at the exact target commit has the same SHA-256 digest as
  the manifest's reviewed MIT or Apache-2.0 license.
- This change advances provenance commits only. Exact installable package
  versions are unchanged, so no new upstream source is installed or executed.
- QCoder, SOL, workspace, network, credential, and authorized-security gates
  remain authoritative. A repository pin grants no runtime authority.
- GitHub's compare response caps file details at 300 paths. The Qwen Code and
  Goose file counts below therefore mean `300+`; their risk classification also
  uses commit subjects and posture, not a claim of exhaustive file inspection.

## Reviewed changes

| Upstream                       |    Posture | Commits | Files | License              | Risk and decision                                                                                                                                                                              |
| ------------------------------ | ---------: | ------: | ----: | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QwenLM/qwen-code`             | integrated |     180 |  300+ | Apache-2.0 unchanged | Elevated source churn across CLI, SDK, browser, channels, review tooling, and CI. Accept as a provenance head only; keep `@qwen-code/qwen-code@0.21.8` exact and preserve QCoder/SOL controls. |
| `oraios/serena`                | integrated |      12 |    18 | MIT unchanged        | Low-moderate: dependency cleanup, Dart notification handling, and prompt synchronization. Accept provenance head; keep `serena-agent==1.6.1` exact and the bounded tool allowlist.             |
| `ast-grep/ast-grep`            | integrated |       7 |     7 | MIT unchanged        | Low-moderate: dependency bumps, embedded-language outline support, and broken-pipe behavior. Accept provenance head; keep `@ast-grep/cli@0.45.1` exact.                                        |
| `aaif-goose/goose`             |  reference |      76 |  300+ | Apache-2.0 unchanged | Moderate: OAuth transport, MCP registration, agent-loop, and adversary-inspection changes. Accept as non-executing reference material only.                                                    |
| `OpenHands/software-agent-sdk` |  reference |      29 |    98 | MIT unchanged        | Moderate: shell AST/security semantics, routed-model metadata, profile validation, and automation callbacks. Accept as non-executing reference material only.                                  |
| `browser-use/browser-use`      |  reference |      22 |    34 | MIT unchanged        | Low-moderate: MCP server and generated-skill changes plus dependency maintenance. Accept as non-executing reference material only.                                                             |
| `github/spec-kit`              |  reference |      60 |   126 | MIT unchanged        | Moderate: workflow validation, catalog additions, and release changes. Accept as non-executing spec-pattern reference only.                                                                    |
| `qodo-ai/pr-agent`             |  reference |       6 |    19 | MIT unchanged        | Low: documentation corrections, reasoning fallback, and model support. Accept as non-executing review-pattern reference only.                                                                  |
| `obra/superpowers`             |  reference |       1 |    40 | MIT unchanged        | Moderate: a broad v6.3.0 release adds agent integrations and workflow changes. Accept as non-executing workflow reference only.                                                                |
| `projectdiscovery/nuclei`      |    sidecar |      11 |    13 | MIT unchanged        | Moderate: raw request semantics, proxy behavior, parser state, and Go dependencies. Accept provenance head; execution remains a separately authorized sidecar action.                          |
| `NVIDIA/garak`                 |    sidecar |      36 |    25 | Apache-2.0 unchanged | Low-moderate: detector robustness, analysis metrics, and plugin cache changes. Accept provenance head; keep `garak==0.16.0` exact and separately authorized.                                   |
| `promptfoo/promptfoo`          |  reference |      62 |   234 | MIT unchanged        | Moderate: MCP client, dependency/lockfile, examples, and CI changes. Accept as reference only; installation remains withheld by the existing high-transitive-audit policy.                     |

## Exact reviewed targets

```text
qwen-code              3119d53e4d922f1f906535f6f70c155ea44df875
serena                 93ec043105f5ee4f5ff64ea0158041500d2cdc65
ast-grep               55ff25956754931189d84672cefdf9bb5c7d362c
goose                  3810898a7447ec3299be72e223d3570a7aabf0ab
openhands-agent-sdk    23ee276f1c68f08123349d103754380f627d20c8
browser-use            f3298c559aabb327a61cf6a9caef5ea3462f45de
spec-kit               bf88c9f9a82fa370c7a7257aa2b3cf10b457b65c
pr-agent               7550d0aebb81c2210f4cb7bf040778d969df297b
superpowers            b36e0829c6d0140e93cfef2ca599b1b07d4a7797
nuclei                 265b3a3dec374741614e342f813c10f8b38d2bb7
garak                  bb1cc47a0cd6ae49971598b879914fbdc04227d0
promptfoo              fded938b65a81e12070a66e90ca4ad2d42a8062e
```

## Verification

The updated manifest must pass the offline validator, the online drift/license
validator, both npm audits, the full regression suite, and the complete release
verification before publication.
