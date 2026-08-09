---
name: qcoder-self-evaluator
description: Evaluate QCoder changes, prompts, agents, and authorized targets with deterministic tests plus pinned Promptfoo, Garak, and Nuclei patterns. Use for regression gates, adversarial prompt testing, model safety checks, and scoped application security retests. Do not use to scan unowned targets, run untrusted eval code with secrets, or treat model-judged output as sole release proof.
---

# QCoder Self Evaluator

## Expected input

Define the immutable candidate, baseline, acceptance thresholds, authorized target when applicable, permitted probe families, time and request budgets, and artifact destination.

## Evaluation sequence

1. Freeze candidate identity and record environment, model route, code revision, dataset revision, and configuration.
2. Run deterministic unit, integration, protocol, security, and packaging checks before model-judged evaluations.
3. Use the repository's labelled golden prompts for activation, tool choice, arguments, false positives, false negatives, and prohibited behavior.
4. Use QCoder's local golden evaluator for repeatable model or agent comparisons. Promptfoo remains a pinned reference but is withheld from installation while its current dependency audit contains reachable high-severity findings; never weaken the audit gate to install it.
5. Route Garak model probes and Nuclei application validation through isolated, scoped sidecars. For Nuclei or any active target traffic, switch to the pentester role and validate authorization first.
6. Compare against the recorded baseline. Fail closed on unsafe activation, secret leakage, authorization bypass, destructive mislabelling, or a required deterministic gate.
7. Save redacted machine-readable results and a human summary. A model grader may supplement but never replace executable evidence.

## Recovery

Classify failures as product defect, test defect, environment defect, upstream drift, or external blocker. Repair only the owning layer, rerun the failed gate, then rerun the full ladder before release.

## Stop conditions

Stop on target-scope mismatch, secret-bearing untrusted evaluation content, uncontrolled remote generation, missing immutable identity, resource exhaustion, or a doctrine hard limit.

## Output format

Report candidate and baseline IDs, gates and counts, adversarial results, regressions, residual risk, artifact hashes, and promotion or rejection decision.
