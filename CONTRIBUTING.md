# Contributing to QCoder

QCoder is maintained as a governed ECHO repository. Contributions should preserve the terminal's safety boundaries, reproducibility, and provider-neutral operation.

## Branch and pull request workflow

- Work from the current `main` branch and create an `agent/<short-description>` branch.
- Do not commit directly to `main`, force-push, rewrite shared history, or delete branches.
- Push only the agent branch to `echoomegaprime/echo-qcoder` and open a draft pull request.
- Keep unrelated worktree changes untouched and stage only files belonging to the change.
- Use the commit identity `ECHO OMEGA PRIME <bobbymcwilliams@echo-op.com>`.

Pull requests must include `Summary`, `Why`, `Validation`, `Security`, and `Evidence` sections. A change is not release-ready until the exact commit has passing hosted checks and required ECHO certification evidence.

## Local validation

From the repository root, run:

```powershell
npm ci --ignore-scripts
npm run lint
npm test
npm run build
pwsh -File .\scripts\verify-plugin.ps1
```

When a check is unavailable, record it as blocked by an external dependency rather than claiming it passed.

## Security and data boundaries

- Never commit credentials, tokens, private keys, customer or client data, or restricted infrastructure details.
- Keep local configuration in ignored `.env` files and use `.env.example` with redacted variable names only.
- Do not weaken authorization, confirmation, tool annotations, or prompt-injection defenses to make a test pass.
- QCoder tools must remain scoped to the configured workspace and approved ECHO control surfaces; do not add unrestricted shell or arbitrary network access.
- Report security issues privately according to `SECURITY.md`.

## Review and release gates

Public or security-sensitive changes require review of the exact pushed commit, including CodeQL, ECHO Certification Forge, ECHO Release Sentinel, and applicable GitHub App Suite journeys. Address review comments in follow-up commits and re-run affected validation before merge.
