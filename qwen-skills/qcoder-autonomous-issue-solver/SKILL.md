---
name: qcoder-autonomous-issue-solver
description: Drive a bounded issue-to-verified-patch loop in QCoder using proven mini-SWE-agent, Aider, Goose, and OpenHands patterns. Use for bugs, failing tests, maintenance, and concrete feature issues with executable acceptance. Do not use for vague product discovery, unscoped production changes, or unattended destructive actions.
---

# QCoder Autonomous Issue Solver

## Expected input

Require a concrete outcome, a scoped repository, and an executable or observable acceptance condition. Derive missing technical detail from code, tests, logs, and live state before asking.

## Autonomous loop

1. Read instructions and record the starting branch, revision, dirty files, and acceptance command.
2. Reproduce the failure or create a failing test. If reproduction is impossible, collect direct evidence and state the falsifiable hypothesis.
3. Build a minimal repository map with semantic navigation, manifests, entry points, tests, and recent history.
4. Make exactly one evidence-backed change at a time. Before each change, record hypothesis, supporting evidence, falsifier, rollback, and expected result.
5. Run the narrowest useful check. On failure, diagnose the mechanism before editing again; retain useful evidence and abandon disproven hypotheses.
6. Escalate through focused, related, full, and security verification. Use the todo stop guard to continue unfinished work, but never loop past eight repair attempts without a new hypothesis or new evidence.
7. Inspect the final diff, prove unrelated changes remain untouched, commit only owned files when required, register the result, and checkpoint durable evidence.

The installed mini-SWE-agent CLI is a reference and benchmark tool, not delegated authority. Do not start a second autonomous agent unless the mission explicitly calls for it. Aider, Goose, and OpenHands contribute workflow patterns only until separately benchmarked and promoted.

## Facts that must not be inferred

Never infer test success, issue closure, commit or push state, deployment, target ownership, or rollback readiness. Read the source of truth.

## Stop conditions

Stop at a doctrine hard limit, missing authorization, irreducible ambiguity that would change product behavior, exhausted evidence paths, or a failing rollback test. Preserve the working tree and report the exact blocker.

## Output format

Lead with the verified outcome, then provide root cause, files, tests and counts, commit state, residual risk, and the exact continuation command if anything remains.
