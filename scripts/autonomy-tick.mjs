import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");

function npmInvocation(args) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", `npm ${args.join(" ")}`],
    };
  }
  return { command: "npm", args };
}

export function createCheckPlan({ online = true } = {}) {
  const rootAudit = npmInvocation(["audit", "--audit-level=high"]);
  const inspectorAudit = npmInvocation([
    "audit",
    "--prefix",
    "scripts/inspector",
    "--audit-level=high",
  ]);
  const regressionSuite = npmInvocation(["test"]);
  return [
    {
      name: "upstream-drift",
      command: process.execPath,
      args: [resolve(root, "scripts/validate-powerpack.mjs"), ...(online ? ["--online"] : [])],
      timeoutMs: 240_000,
    },
    {
      name: "root-audit",
      ...rootAudit,
      timeoutMs: 180_000,
    },
    {
      name: "inspector-audit",
      ...inspectorAudit,
      timeoutMs: 180_000,
    },
    {
      name: "regression-suite",
      ...regressionSuite,
      timeoutMs: 300_000,
    },
  ];
}

export function summarizeChecks(checks) {
  const failed = checks.filter(({ ok }) => !ok).map(({ name }) => name);
  return { ok: failed.length === 0, failed, checks };
}

function runCheck(check) {
  const started = performance.now();
  const result = spawnSync(check.command, check.args, {
    cwd: root,
    encoding: "utf8",
    timeout: check.timeoutMs,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  return {
    name: check.name,
    ok: exitCode === 0 && !result.error,
    exitCode,
    durationMs: Math.round(performance.now() - started),
    output: sanitizeOutput(
      `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
    ),
  };
}

export function sanitizeOutput(value) {
  return value
    .replace(/Authorization:\s*(?:Bearer|Basic)\s+\S+/giu, "Authorization: [REDACTED]")
    .replace(
      /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY)\b\s*[:=]\s*\S+/giu,
      "[REDACTED_SECRET]",
    )
    .replace(/(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{20,}/gu, "[REDACTED_TOKEN]")
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu, "[REDACTED_PRIVATE_KEY]")
    .replace(
      /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/gu,
      "[PRIVATE_ADDRESS]",
    )
    .replace(/\b[A-Za-z]:\\[^\s"']+/gu, "[LOCAL_PATH]")
    .replace(/\/(?:home|Users)\/[^\s"']+/gu, "[LOCAL_PATH]")
    .trim()
    .slice(-4_000);
}

function parseArgs(args) {
  const offline = args.includes("--offline");
  const outputIndex = args.indexOf("--output");
  const output =
    outputIndex >= 0 && args[outputIndex + 1]
      ? resolve(root, args[outputIndex + 1])
      : resolve(root, ".runtime/autonomy/latest.json");
  return { online: !offline, output };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const checks = createCheckPlan(options).map(runCheck);
  const summary = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    repository: "ECHO-OMEGA-PRIME/echo-qcoder",
    ...summarizeChecks(checks),
  };
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8" });
  const marker = summary.ok ? "QCODER_AUTONOMY_TICK_OK" : "QCODER_AUTONOMY_TICK_FAILED";
  console.log(`${marker} failed=${summary.failed.join(",") || "none"} report=${options.output}`);
  if (!summary.ok) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === scriptPath) main();
