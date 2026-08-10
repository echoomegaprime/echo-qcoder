# ECHO Connectors

Namespace-jailed MCP connectors for the ECHO OMEGA PRIME service suite.
One runtime, twelve connector identities, zero runtime dependencies.

Each connector is a governed façade over the FORGE SDK gate (`/sdk/invoke`).
An MCP client sees a small, stable tool surface per service instead of 13,731
undifferentiated capabilities — and cannot reach outside the service it asked for.

## Connectors

| Connector | Namespace | Live caps | Repository |
|---|---|---|---|
| `echo-certforge` | `echo.certforge.*`, `echo.certification_forge.*` | 60 | echo-certification-forge |
| `echo-tracker` | `echo.buildtracker.*` | 44 | echo-build-tracker-app |
| `echo-knowledge` | `echo.knowledge.*` | 6 | echo-knowledge-forge-app |
| `echo-fleet` | `echo.fleet.*`, `echo.fleet_twin.*` | 36 | echo-fleet-builder-app |
| `echo-sentinel` | `echo.sentinel.*` | 27 | echo-release-sentinel |
| `echo-arcanum` | `echo.arcanum.*` | 3 | echo-arcanum-app |
| `echo-vault` | `echo.vault.*` | 33 | echo-vault |
| `echo-oauth` | `echo.oauth.*`, `echo.oauth_forge.*` | 17 | echo-oauth |
| `echo-ghgateway` | `echo.github.*` | 25 | echo-github-app-gateway |
| `echo-sdk` | `echo.psql.*`, `echo.functions.*`, `echo.composite.*` | 6,367 | echo-sdk-app |
| `echo-steward` | `echo.repos.*`, `echo.steward.*` | 4 | echo-repo-steward |
| `echo-qcoder` | `echo.qcoder.*`, `echo.qwen.*`, `echo.llm.*` | 805 | echo-qcoder |

Counts are a live probe of `arcanum_sdk.sdk_capabilities` on 2026-08-10 and will drift.
`<connector>_health` reports the current number; nothing here is hard-coded.

## Tool surface

Every connector exposes the same five tools, prefixed with its key:

- `<key>_caps` — list capabilities in this namespace, filterable by substring and danger tier
- `<key>_describe` — full registry spec for one capability: input/output schema, tier, scope, lifecycle, target node
- `<key>_invoke` — call a capability through the gate, subject to the guards below
- `<key>_health` — lifecycle and tier rollup plus gate reachability; distinguishes "gate down" from "capability missing"
- `<key>_about` — what this service is, which repo backs it, and which guards are active. No network call.

## Guards

These are enforced in code and covered by `guards.js`, not merely documented.

1. **Namespace jail.** A connector refuses any capability outside its declared
   prefixes. `echo-vault` cannot invoke `echo.shell.run`, and no amount of
   parameter shaping changes that — the refusal happens before the gate is called.
2. **Tier guard.** Danger tier ≥ 2 requires `bypass_reason` of at least 50
   characters. Tier 3 is refused outright unless `ECHO_ALLOW_TIER3=1` is set on
   that specific connector.
3. **Lifecycle guard.** Archived capabilities, and any whose registry description
   begins with `RETIRED`, are refused.
4. **Secret redaction.** Connectors marked `redact: true` (`vault`, `oauth`,
   `ghgateway`) strip secret-shaped values from every response before it reaches
   the model. Key names, counts and lengths survive; values do not.
5. **No secrets in env.** The sovereign key is read from a protected file, the
   same contract as `sdk-gateway-mcp`. `ECHO_SOVEREIGN_KEY` exists only as a
   fallback for containerised runs.

## Install

```bash
node install.js --dry   # print the claude_desktop_config.json block
node install.js         # back up, merge, write
```

`install.js` takes a timestamped backup, merges rather than replaces, and is
idempotent. Restart Claude Desktop afterwards.

## Verify

```bash
node smoke.js           # all 12 connectors, real MCP stdio, live gate
node smoke.js vault sdk # named connectors only
node guards.js          # governance assertions
```

`smoke.js` speaks the real protocol to a real child process against the real
gate. There are no mocks: a PASS means an MCP client gets the same answer.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ECHO_CONNECTOR` | `sdk` | Which connector identity to run |
| `ECHO_SDK_GATEWAY` | `http://192.168.1.220:8000` | FORGE SDK gate |
| `ECHO_SDK_TIMEOUT_MS` | `60000` | Per-invoke timeout |
| `ECHO_ALLOW_TIER3` | unset | Set to `1` to permit tier-3 capabilities |

FORGE moved from `.137` to `.220` in the 2026-06-10 switch migration.
`192.168.1.137:8000` is dead; do not resurrect it in config.

## Adding a connector

Add an entry to `connectors.json` and re-run `install.js`. No code change is
required — prefixes, title, repository and redaction policy are all data.

Requires Node ≥ 20 for built-in `fetch` and `AbortSignal.timeout`.
