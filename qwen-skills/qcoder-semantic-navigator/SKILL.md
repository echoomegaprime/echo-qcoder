---
name: qcoder-semantic-navigator
description: Navigate, understand, and refactor large codebases with QCoder's bounded Serena MCP and pinned ast-grep tool. Use for symbol discovery, reference tracing, cross-file changes, structural searches, and diagnostics. Do not use for ordinary one-file reads, arbitrary command execution, or destructive bulk rewrites without a preview and tests.
---

# QCoder Semantic Navigator

## Expected input

Identify the symbol, behavior, pattern, or refactor objective and the active repository. Read the nearest repository instructions before invoking semantic tools.

## Required sequence

1. Activate or confirm the current project with `qcoder-serena` and load its initial instructions once per session.
2. Start with `get_symbols_overview` or `find_symbol`; request bodies only for the smallest relevant symbols.
3. Use `find_referencing_symbols`, implementations, declarations, and diagnostics to map impact before editing.
4. Use Serena symbolic edits for exact symbol changes. Use pinned ast-grep from `.runtime/powerpack/npm/node_modules/.bin/ast-grep.cmd` when the task is a syntax-shaped pattern across many files.
5. Preview every multi-file structural rewrite. Exclude generated, vendor, dependency, cache, artifact, and unrelated dirty paths.
6. Run the repository's focused tests, type checks, and format gate. Inspect the diff and reference graph again after a rename or deletion.

Serena is untrusted by default and exposes only allowlisted semantic tools. Its raw shell, raw file replacement, and private memory tools remain excluded.

## Stop conditions

Stop if the active project differs from the scoped workspace, the symbol result is ambiguous, generated code owns the target, a rewrite crosses unrelated dirty files, or verification cannot establish behavior preservation.

## Output format

Report symbols inspected, references affected, exact edits, excluded paths, tests, and any unresolved dynamic references.
