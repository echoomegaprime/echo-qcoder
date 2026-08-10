# Crucible tool catalog

QCoder now carries a pinned catalog of 20 additional open-source security and
software-engineering components in `config/crucible-tool-catalog.json`. Each
entry records its repository, exact commit, license digest, capability summary,
risk tier, and the ECHO Crucible route that must mediate runtime use.

The catalog is an integration contract, not an installation claim. A repository
entry does not grant shell access, credentials, target authority, network access,
or permission to execute tests. The default network policy remains deny.

## Risk and authority

- **Low** tools are static analysis, inventory, SBOM, dependency, or policy
  scanners. They may run in a workspace or CI after the normal QCoder checks.
- **Medium** tools perform bounded discovery or orchestration and require an
  authorized Crucible scope before they can touch a target.
- **High** tools can actively probe, fuzz, proxy, or execute validation actions.
  They remain Crucible-scope-required and are never enabled as general QCoder
  terminal commands.
- **Critical** tools can coordinate adversary-emulation campaigns. Caldera is
  cataloged for capability discovery but is Crucible-only; QCoder does not
  install or autonomously launch it.

The catalog validator enforces these mappings and the CI/test suite verifies
that all four tiers remain represented. Live Crucible health and route
availability must still be checked separately; catalog presence is not proof
that a tool is installed on CRUCIBLE.

## Verification

```powershell
npm run test:powerpack
node .\scripts\validate-crucible-catalog.mjs
```

The next expansion batch should be proposed only after these 20 entries have
been installed or explicitly marked unavailable by a live Crucible inventory
check.
