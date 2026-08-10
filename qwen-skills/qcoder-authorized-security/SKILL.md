---
name: qcoder-authorized-security
description: Plan, execute, document, and retest authorized ECHO security work across red, blue, purple, orange, yellow, green, and defensive validation workflows. Use only for Commander-owned, donated-lab, CTF, or explicitly authorized targets. Do not use for unscoped third-party systems, credential theft, persistence outside the engagement, or target expansion.
---

# QCoder Authorized Security

## Expected input

Identify the exact target, owner or authorization basis, allowed techniques, exclusions, time window, and desired evidence. Treat a color label as an operating perspective, not permission to expand scope.

## Required sequence

1. Read the ECHO pentester role, security modules, target repository instructions, and current scope record.
2. Switch the durable SOL mission to `pentester` before active testing and read every returned context packet path.
3. Discover the current scoped security capabilities through `echo.caps.search` or `echo.caps.list`; never guess a moving command contract.
4. Validate scope before sending traffic. Begin with passive evidence, then perform the minimum active validation required by the objective.
5. Route active operations through the signed and audited ECHO Prometheus/CRUCIBLE control plane. Supply exact confirmation tokens when a capability requires them.
6. Preserve evidence, timestamps, target identity, tool result, and rollback or cleanup state. Separate observed facts from hypotheses.
7. Remediate only when requested, then retest the immutable candidate and record residual risk.

## Color routing

- Blue: detection, hardening, containment, recovery, and control validation.
- Red: scoped adversarial validation with explicit target and stop conditions.
- Purple: paired attack and detection evidence with control improvement.
- Orange, yellow, and green: use the definitions in the current ECHO pentester context packet; do not invent a target, identity, social pretext, or public action.

## Third-party frameworks

CAI, PentestGPT, and Strix are research candidates, not automatic execution paths. Before adoption, pin a revision, review license and telemetry, inspect containers and tool permissions, run dependency and secret scans, and expose only bounded adapters behind the ECHO scope/confirmation layer. CAI requires separate commercial permission for professional or production use.

## Stop conditions

Stop on scope mismatch, missing authorization, an exact confirmation failure, target drift, evidence of a real third-party system outside scope, or any doctrine hard limit. Clean up reversible engagement artifacts and report the safe route forward.

## Output format

Report scope, hypothesis, evidence, exact action, result, cleanup, retest, and residual risk. Never include live secrets, session cookies, private keys, or exploit data unrelated to remediation.
