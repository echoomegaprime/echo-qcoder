#!/usr/bin/env node
/**
 * qcoder-status-badge.mjs
 * One-line health badge for the local governed QCoder MCP.
 * Safe: only hits loopback healthz; no secrets, no shell.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const healthUrl = process.env.QCODER_HEALTH_URL || "http://127.0.0.1:18788/healthz";
const outDir = join(root, "artifacts");
const outJson = join(outDir, "qcoder-status-badge.json");

const checked_at = new Date().toISOString();
let ok = false;
let detail = "unreachable";
let statusCode = 0;

try {
  const res = await fetch(healthUrl, { signal: AbortSignal.timeout(4000) });
  statusCode = res.status;
  const body = await res.text();
  ok = res.ok && /"status"\s*:\s*"ok"/.test(body);
  detail = ok ? "ok" : `http_${statusCode}`;
} catch (err) {
  detail = String(err && err.message ? err.message : err).slice(0, 120);
}

const badge = `[QCODER] ${ok ? "ok" : "down"} health=${detail} at=${checked_at}`;
console.log(badge);

mkdirSync(outDir, { recursive: true });
writeFileSync(
  outJson,
  JSON.stringify(
    {
      ok,
      detail,
      statusCode,
      healthUrl,
      checked_at,
      badge,
      made_by: "echo-qcoder-workspace",
      note: "GPU lease was held by interactive QCoder; badge built via allowlisted workspace path",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
process.exitCode = ok ? 0 : 1;
