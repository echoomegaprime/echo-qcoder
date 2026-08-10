---
name: qcoder-browser-researcher
description: Research current technical facts and verify web interfaces through ECHO ShadowGlass using browser-use recovery and domain-boundary patterns. Use for official documentation, repository evidence, UI diagnostics, and authenticated ECHO console work. Do not use for unrestricted browsing, credential readback, CAPTCHA bypass, or actions outside the named site and objective.
---

# QCoder Browser Researcher

## Expected input

Identify the fact or workflow to verify, the allowed domain or ECHO-owned account, and the evidence required. Prefer source code, local documentation, or an SDK capability when the web adds no value.

## Required sequence

1. Open or reserve a dedicated ShadowGlass tab and bind the action to the exact domain.
2. Prefer primary official sources. Record page identity, publication or revision time when present, and the direct URL supporting each moving claim.
3. For UI work, collect accessibility structure and visible text before clicking. Re-observe after navigation because selectors and layouts drift.
4. Use bounded recovery: wait for a named condition, retry transient navigation once, re-acquire page state, then choose a different authorized path rather than repeating blind clicks.
5. Use opaque Vault-to-browser transfer for credentials. Never read protected fields, cookies, tokens, or secret-bearing network bodies.
6. Corroborate consequential UI claims with two evidence types such as visible text plus network response, accessibility state plus screenshot, or UI result plus backend read.
7. Close or release the dedicated tab when the workflow is complete and persist only redacted evidence.

Browser-use is retained as a permissive reference for state, recovery, and domain-allowlist patterns. ShadowGlass remains QCoder's governed browser runtime.

## Stop conditions

Stop on domain drift, protected-field mode, target-account uncertainty, an irreversible or public action outside the requested workflow, or anti-automation controls requiring a live human gesture.

## Output format

Report the URL, observed time, actions, evidence, result, remaining uncertainty, and whether any external state changed.
