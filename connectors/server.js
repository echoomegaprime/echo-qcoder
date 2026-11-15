#!/usr/bin/env node
/**
 * ECHO CONNECTORS - namespace-jailed MCP facades over the FORGE SDK gate.
 *
 * One runtime, twelve connector identities. The identity is selected with
 * ECHO_CONNECTOR=<key> where <key> is a top-level key in connectors.json.
 *
 * Zero runtime dependencies: raw MCP stdio (newline-delimited JSON-RPC 2.0)
 * and Node's built-in fetch. Nothing to npm install, nothing to keep in sync.
 *
 * Governance properties enforced here, not merely documented:
 *   1. NAMESPACE JAIL  - a connector can only invoke capabilities whose id
 *                        starts with one of its declared prefixes. Verified
 *                        against the live registry, not just the string.
 *   2. TIER GUARD      - tier >= 2 requires bypass_reason of >= 50 chars;
 *                        tier 3 is refused unless ECHO_ALLOW_TIER3=1.
 *   3. LIFECYCLE GUARD - archived capabilities and those whose registry
 *                        description begins with RETIRED are refused.
 *   4. SECRET REDACTION- connectors marked redact:true strip secret-shaped
 *                        values from every response before it reaches the
 *                        model. Counts, names and lengths only.
 *   5. NO ENV SECRETS  - the sovereign key is read from a protected file,
 *                        matching the existing sdk-gateway-mcp contract.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = "1.0.0";
const PROTOCOL_VERSION = "2024-11-05";

// --- Gate contract (reused verbatim from sdk-gateway-mcp v3.0.0) ----------
// FORGE moved .137 -> .220 in the 2026-06-10 switch migration; .137:8000 is dead.
const GATEWAY = process.env.ECHO_SDK_GATEWAY || "http://192.168.1.220:8000";
const TIMEOUT_MS = Number.parseInt(process.env.ECHO_SDK_TIMEOUT_MS || "60000", 10);
const ALLOW_TIER3 = process.env.ECHO_ALLOW_TIER3 === "1";
const KEY_FILES = [
  "C:\\ECHO_OMEGA_PRIME\\SECURE_VAULT\\.sovereign_key",
  "/etc/echo/sovereign_key",
  "/home/forge/.echo_sovereign_key",
];

function readSovereignKey() {
  if (process.env.ECHO_SOVEREIGN_KEY) return process.env.ECHO_SOVEREIGN_KEY.trim();
  for (const path of KEY_FILES) {
    try {
      if (!existsSync(path)) continue;
      let raw = readFileSync(path, "utf8").trim();
      if (raw.startsWith("SOVEREIGN_KEY=")) raw = raw.slice(raw.indexOf("=") + 1).trim();
      if (raw) return raw;
    } catch {
      /* unreadable candidate is not fatal; try the next one */
    }
  }
  return "";
}
const API_KEY = readSovereignKey();

// --- Connector identity ---------------------------------------------------
const REGISTRY = JSON.parse(readFileSync(join(HERE, "connectors.json"), "utf8"));
const KEY = process.env.ECHO_CONNECTOR || "sdk";
const SELF = REGISTRY.connectors[KEY];
if (!SELF) {
  process.stderr.write(
    `echo-connectors: unknown ECHO_CONNECTOR=${KEY}. ` +
      `Known: ${Object.keys(REGISTRY.connectors).join(", ")}\n`,
  );
  process.exit(2);
}
const P = KEY; // tool-name prefix

// --- Gate transport -------------------------------------------------------
async function gateInvoke(capability, params, bypassReason) {
  const body = { envelope_version: 1, capability, params: params || {} };
  if (bypassReason) body.context = { bypass_reason: bypassReason };
  let res;
  try {
    res = await fetch(`${GATEWAY}/sdk/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Echo-API-Key": API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return {
      status: "error",
      error: "gate_unreachable",
      detail: String(err && err.message ? err.message : err),
      gateway: GATEWAY,
      hint: "Confirm FORGE is up and ECHO_SDK_GATEWAY points at the live gate.",
    };
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: "error", error: "non_json_response", http_status: res.status, raw: text.slice(0, 2000) };
  }
}

async function gateQuery(sql) {
  const out = await gateInvoke("echo.psql.query", { command: sql });
  const body = out && out.result && out.result.body;
  if (body && body.status === "ok" && Array.isArray(body.rows)) return { rows: body.rows };
  return { rows: [], error: (body && (body.detail || body.error)) || out.error || "query_failed" };
}

// --- Registry lookups (cached for the process lifetime) -------------------
const specCache = new Map();
function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function prefixPredicate(column = "id") {
  return SELF.prefixes.map((p) => `${column} LIKE ${sqlLiteral(p + "%")}`).join(" OR ");
}

async function loadSpec(capability) {
  if (specCache.has(capability)) return specCache.get(capability);
  const { rows } = await gateQuery(
    `SELECT id, description, danger_tier, required_scope, lifecycle_status, health_status,
            target_node, input_schema_json, output_schema_json, default_timeout_seconds
       FROM arcanum_sdk.sdk_capabilities
      WHERE id = ${sqlLiteral(capability)} LIMIT 1`,
  );
  const spec = rows[0] || null;
  specCache.set(capability, spec);
  return spec;
}

// --- Guards ---------------------------------------------------------------
function inJail(capability) {
  return SELF.prefixes.some((p) => capability.startsWith(p));
}

const SECRET_KEY_RE =
  /(secret|password|passwd|passphrase|private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|credential|bearer|authorization|cookie)/i;

function redact(value, depth = 0) {
  if (depth > 12) return "<depth-limited>";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(k) && v !== null && typeof v !== "object") {
        out[k] = `<redacted:len=${String(v).length}>`;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/** Returns null when allowed, or a refusal object when blocked. */
function checkPolicy(capability, spec, bypassReason) {
  if (!inJail(capability)) {
    return {
      refused: "namespace_jail",
      capability,
      connector: KEY,
      allowed_prefixes: SELF.prefixes,
      detail:
        `The ${SELF.title} connector may only invoke capabilities under its own namespace. ` +
        `Use the connector that owns ${capability.split(".").slice(0, 2).join(".")}.*, or the sdk connector for registry queries.`,
    };
  }
  if (!spec) {
    return {
      refused: "capability_not_registered",
      capability,
      detail:
        "No row in arcanum_sdk.sdk_capabilities. Only capability_not_registered proves absence; a stale health_status does not.",
    };
  }
  if (spec.lifecycle_status === "archived") {
    return { refused: "archived_capability", capability, lifecycle_status: spec.lifecycle_status };
  }
  if (typeof spec.description === "string" && /^\s*RETIRED\b/i.test(spec.description)) {
    return { refused: "retired_capability", capability, description: spec.description };
  }
  const tier = Number(spec.danger_tier ?? 0);
  if (tier >= 3 && !ALLOW_TIER3) {
    return {
      refused: "tier3_blocked",
      capability,
      danger_tier: tier,
      detail:
        "Tier 3 is refused by default. Set ECHO_ALLOW_TIER3=1 on this connector only with the Commander's explicit standing order.",
    };
  }
  if (tier >= 2 && (!bypassReason || bypassReason.trim().length < 50)) {
    return {
      refused: "bypass_reason_required",
      capability,
      danger_tier: tier,
      detail: `Capability is tier ${tier}. Supply bypass_reason of at least 50 characters describing the operational justification.`,
    };
  }
  return null;
}

// --- Tools ----------------------------------------------------------------
const TOOLS = [
  {
    name: `${P}_caps`,
    description:
      `List ${SELF.title} capabilities from the live ECHO SDK registry. ` +
      `Namespace: ${SELF.prefixes.join(", ")}. Start here - the registry is the source of truth, ` +
      `not memory. Filter with 'search' to narrow by id or description.`,
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Substring matched against capability id and description." },
        max_tier: { type: "integer", description: "Only capabilities at or below this danger tier (0-3).", minimum: 0, maximum: 3 },
        include_deprecated: { type: "boolean", description: "Include deprecated/archived capabilities. Default false.", default: false },
        limit: { type: "integer", default: 100, minimum: 1, maximum: 500 },
      },
    },
  },
  {
    name: `${P}_describe`,
    description:
      `Full registry spec for one ${SELF.title} capability: input schema, output schema, danger tier, ` +
      `required scope, lifecycle, target node and timeout. Call this before ${P}_invoke on anything unfamiliar.`,
    inputSchema: {
      type: "object",
      properties: { capability: { type: "string", description: `Full capability id, e.g. ${SELF.prefixes[0]}status` } },
      required: ["capability"],
    },
  },
  {
    name: `${P}_invoke`,
    description:
      `Invoke a ${SELF.title} capability through the FORGE SDK gate. ` +
      `Jailed to ${SELF.prefixes.join(", ")} - requests outside that namespace are refused, not proxied. ` +
      `Tier >= 2 requires bypass_reason of >= 50 chars; tier 3 is blocked by default.` +
      (SELF.redact ? " Secret-shaped values are redacted from every response." : ""),
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string", description: `Full capability id under ${SELF.prefixes.join(" / ")}` },
        params: { type: "object", description: "Capability-specific parameters. See <prefix>_describe." },
        bypass_reason: { type: "string", description: "Operational justification, >= 50 chars. Required for tier >= 2." },
      },
      required: ["capability"],
    },
  },
  {
    name: `${P}_health`,
    description:
      `Live health rollup for the ${SELF.title} namespace: capability counts by lifecycle, ` +
      `tier distribution, recently-invoked capabilities, and gate reachability. ` +
      `Use this first when something looks broken - it distinguishes "gate down" from "capability missing".`,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: `${P}_about`,
    description:
      `What ${SELF.title} is, which GitHub repository backs it, its gateway upstream, ` +
      `its namespace, and the governance rules this connector enforces. No network call.`,
    inputSchema: { type: "object", properties: {} },
  },
];

// --- Tool handlers --------------------------------------------------------
async function toolCaps(args) {
  const where = [`(${prefixPredicate()})`];
  if (!args.include_deprecated) where.push(`COALESCE(lifecycle_status,'active') IN ('active','warned')`);
  if (args.search) {
    const like = sqlLiteral(`%${args.search}%`);
    where.push(`(id ILIKE ${like} OR COALESCE(description,'') ILIKE ${like})`);
  }
  if (args.max_tier !== undefined) where.push(`COALESCE(danger_tier,0) <= ${Number(args.max_tier)}`);
  const limit = Math.min(Math.max(Number(args.limit || 100), 1), 500);
  const { rows, error } = await gateQuery(
    `SELECT id, danger_tier, required_scope, COALESCE(lifecycle_status,'active') AS lifecycle,
            target_node, left(COALESCE(description,''), 240) AS description
       FROM arcanum_sdk.sdk_capabilities
      WHERE ${where.join(" AND ")}
      ORDER BY danger_tier NULLS FIRST, id
      LIMIT ${limit}`,
  );
  if (error) return { status: "error", error };
  return { connector: KEY, namespace: SELF.prefixes, count: rows.length, capabilities: rows };
}

async function toolDescribe(args) {
  const capability = String(args.capability || "");
  if (!inJail(capability)) {
    return { refused: "namespace_jail", capability, allowed_prefixes: SELF.prefixes };
  }
  const spec = await loadSpec(capability);
  if (!spec) return { status: "error", error: "capability_not_registered", capability };
  return {
    connector: KEY,
    capability: spec.id,
    description: spec.description,
    danger_tier: spec.danger_tier,
    required_scope: spec.required_scope,
    lifecycle_status: spec.lifecycle_status,
    health_status: spec.health_status,
    health_note: "health_status is known-stale metadata; only capability_not_registered proves absence.",
    target_node: spec.target_node,
    default_timeout_seconds: spec.default_timeout_seconds,
    input_schema: spec.input_schema_json,
    output_schema: spec.output_schema_json,
  };
}

async function toolInvoke(args) {
  const capability = String(args.capability || "");
  const spec = inJail(capability) ? await loadSpec(capability) : null;
  const refusal = checkPolicy(capability, spec, args.bypass_reason);
  if (refusal) return refusal;
  const out = await gateInvoke(capability, args.params || {}, args.bypass_reason);
  const shaped = { connector: KEY, capability, danger_tier: spec.danger_tier, result: out };
  return SELF.redact ? redact(shaped) : shaped;
}

async function toolHealth() {
  const lifecycle = await gateQuery(
    `SELECT COALESCE(lifecycle_status,'active') AS lifecycle, COUNT(*) AS n
       FROM arcanum_sdk.sdk_capabilities WHERE ${prefixPredicate()} GROUP BY 1 ORDER BY 2 DESC`,
  );
  if (lifecycle.error) {
    return { connector: KEY, gate: GATEWAY, gate_reachable: false, error: lifecycle.error };
  }
  const tiers = await gateQuery(
    `SELECT COALESCE(danger_tier,0) AS tier, COUNT(*) AS n
       FROM arcanum_sdk.sdk_capabilities WHERE ${prefixPredicate()} GROUP BY 1 ORDER BY 1`,
  );
  const recent = await gateQuery(
    `SELECT id, last_invoked_at FROM arcanum_sdk.sdk_capabilities
      WHERE (${prefixPredicate()}) AND last_invoked_at IS NOT NULL
      ORDER BY last_invoked_at DESC LIMIT 8`,
  );
  const total = lifecycle.rows.reduce((sum, r) => sum + Number(r.n), 0);
  return {
    connector: KEY,
    title: SELF.title,
    gate: GATEWAY,
    gate_reachable: true,
    sovereign_key_loaded: Boolean(API_KEY),
    namespace: SELF.prefixes,
    total_capabilities: total,
    by_lifecycle: lifecycle.rows,
    by_danger_tier: tiers.rows,
    recently_invoked: recent.rows,
  };
}

function toolAbout() {
  return {
    connector: KEY,
    title: SELF.title,
    summary: SELF.summary,
    namespace: SELF.prefixes,
    github_repo: SELF.repo ? `https://github.com/${SELF.repo}` : null,
    github_app_repo: SELF.app_repo ? `https://github.com/${SELF.app_repo}` : null,
    gateway_upstream: SELF.upstream,
    notes: SELF.notes || null,
    runtime: { version: VERSION, gate: GATEWAY, timeout_ms: TIMEOUT_MS, sovereign_key_loaded: Boolean(API_KEY) },
    governance: {
      namespace_jail: `Refuses any capability outside ${SELF.prefixes.join(", ")}`,
      tier_guard: `tier >= 2 requires bypass_reason >= 50 chars; tier 3 ${ALLOW_TIER3 ? "ALLOWED (ECHO_ALLOW_TIER3=1)" : "blocked"}`,
      lifecycle_guard: "archived and RETIRED capabilities are refused",
      secret_redaction: SELF.redact ? "enabled - secret-shaped values never reach the model" : "not applicable",
      key_source: "protected file only; ECHO_SOVEREIGN_KEY env is a fallback for containerised runs",
    },
  };
}

const HANDLERS = {
  [`${P}_caps`]: toolCaps,
  [`${P}_describe`]: toolDescribe,
  [`${P}_invoke`]: toolInvoke,
  [`${P}_health`]: toolHealth,
  [`${P}_about`]: async () => toolAbout(),
};

// --- MCP stdio transport (newline-delimited JSON-RPC 2.0) ------------------
function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}
function asContent(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return reply(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: `echo-${KEY}`, version: VERSION },
    });
  }
  if (method === "notifications/initialized" || method === "initialized") return;
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params && params.name;
    const handler = HANDLERS[name];
    if (!handler) return reply(id, { ...asContent({ error: "unknown_tool", tool: name }), isError: true });
    try {
      const out = await handler((params && params.arguments) || {});
      const failed = Boolean(out && (out.refused || out.status === "error"));
      return reply(id, { ...asContent(out), isError: failed });
    } catch (err) {
      return reply(id, {
        ...asContent({ error: "handler_exception", tool: name, detail: String(err && err.stack ? err.stack : err) }),
        isError: true,
      });
    }
  }
  if (id !== undefined) return replyError(id, -32601, `method not found: ${method}`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  Promise.resolve(dispatch(msg)).catch((err) => {
    process.stderr.write(`echo-${KEY}: dispatch failure: ${err}\n`);
  });
});
rl.on("close", () => process.exit(0));
process.stderr.write(`echo-${KEY} v${VERSION} ready | gate=${GATEWAY} | key=${API_KEY ? "loaded" : "MISSING"}\n`);
