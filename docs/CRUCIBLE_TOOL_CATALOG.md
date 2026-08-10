# Crucible tool catalog

QCoder carries a pinned catalog of open-source security and software-engineering
components in `config/crucible-tool-catalog.json`. The catalog is organized into
reviewed batches of exactly 20 entries each; every entry records its repository,
exact commit, license digest, capability summary, risk tier, and the ECHO route
that must mediate runtime use.

The catalog is an integration contract, not an installation claim. A repository
entry does not grant shell access, credentials, target authority, network access,
or permission to execute tests. The default network policy remains deny.

## Batch 1 (20 entries)

General-purpose security scanning, SBOM/dependency, and agent-evaluation tooling:
Trivy, Gitleaks, ZAP, Atomic Red Team, Caldera, OpenHands, Microsoft Agent
Framework, SWE-EVO, CodeScaleBench, httpx, Subfinder, Naabu, Katana, ffuf,
Interactsh, OSV-Scanner, Syft, Grype, Checkov, kube-bench.

## Batch 2 (20 entries)

Supply-chain, static-analysis, OSINT, fuzzing, and generative-AI red-teaming
tooling, added after license re-verification excluded 12 of the 20 originally
proposed candidates (Nmap, Masscan, Nikto, SQLMap, theHarvester, Recon-ng, Zeek,
Suricata, Wazuh, Velociraptor, Semgrep, TruffleHog) for carrying a non-permissive
or unverifiable license. The batch was filled out to 20 with equivalent
permissively-licensed tooling:

- **Low** (workspace-safe, static/local): Bandit, CodeQL, BrowserGym, Grant,
  OSV-SCALIBR, gosec, detect-secrets, Cosign, in-toto, OPA, CycloneDX CLI.
- **Medium** (crucible-scope-required, bounded/live): Sherlock, Falco, OWASP
  Amass, honggfuzz, Garak, PyRIT.
- **High** (crucible-scope-required, active probing): Gobuster, Nuclei.
- **Critical** (crucible-only): Open Interpreter — cataloged for capability
  discovery only; QCoder does not install or autonomously launch it, the same
  posture as Caldera in batch 1.

Garak and PyRIT are the catalog's first generative-AI red-teaming entries. Both
call a live model endpoint rather than a network target, so their route lives in
the dedicated `echo.ai_redteam.*` namespace rather than `echo.crucible.*`; the
policy's `routePrefixes` list and the validator accept both prefixes.

## Risk and authority

- **Low** tools are static analysis, inventory, SBOM, dependency, or policy
  scanners. They may run in a workspace or CI after the normal QCoder checks.
- **Medium** tools perform bounded discovery, monitoring, or orchestration and
  require an authorized Crucible scope before they can touch a target or a live
  model endpoint.
- **High** tools can actively probe, fuzz, proxy, or execute validation actions.
  They remain Crucible-scope-required and are never enabled as general QCoder
  terminal commands.
- **Critical** tools can execute arbitrary code or coordinate open-ended
  autonomous action. They are cataloged for capability discovery but are
  Crucible-only; QCoder does not install or autonomously launch them.

The catalog validator enforces these mappings per batch, and the CI/test suite
verifies that all four tiers remain represented in every batch. Live Crucible
health and route availability must still be checked separately; catalog
presence is not proof that a tool is installed on CRUCIBLE.

## Verification

```powershell
npm run test:powerpack
node .\scripts\validate-crucible-catalog.mjs
```

The next expansion batch (batch 3) should be proposed only after batch 2's
entries have been installed or explicitly marked unavailable by a live Crucible
inventory check.
