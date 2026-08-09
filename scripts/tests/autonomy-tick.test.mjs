import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

import { createCheckPlan, sanitizeOutput, summarizeChecks } from "../autonomy-tick.mjs";

const root = resolve(import.meta.dirname, "../..");

test("autonomy tick covers drift, security, and regression gates", () => {
  assert.deepEqual(
    createCheckPlan({ online: true }).map(({ name }) => name),
    ["upstream-drift", "root-audit", "inspector-audit", "regression-suite"],
  );
  assert.ok(createCheckPlan({ online: true })[0].args.includes("--online"));
  assert.ok(!createCheckPlan({ online: false })[0].args.includes("--online"));
  if (process.platform === "win32") {
    assert.match(createCheckPlan()[1].command, /cmd\.exe$/iu);
    assert.deepEqual(createCheckPlan()[1].args.slice(0, 3), ["/d", "/s", "/c"]);
  }
});

test("autonomy summary fails closed and identifies failed gates", () => {
  const summary = summarizeChecks([
    { name: "upstream-drift", ok: true, exitCode: 0, durationMs: 10, output: "ok" },
    { name: "root-audit", ok: false, exitCode: 1, durationMs: 20, output: "redacted" },
  ]);
  assert.equal(summary.ok, false);
  assert.deepEqual(summary.failed, ["root-audit"]);
});

test("public autonomy evidence redacts credentials and private infrastructure", () => {
  const output = sanitizeOutput(
    "Authorization: Bearer secret-value C:\\ECHO_MCP\\private\\file 192.168.1.220 /home/forge/private",
  );
  assert.doesNotMatch(output, /secret-value/u);
  assert.doesNotMatch(output, /ECHO_MCP/u);
  assert.doesNotMatch(output, /192\.168\.1\.220/u);
  assert.doesNotMatch(output, /\/home\/forge/u);
});

test("scheduled workflow reconciles one persistent autonomy issue", () => {
  const workflow = readFileSync(
    resolve(root, ".github/workflows/qcoder-autonomy-tick.yml"),
    "utf8",
  );
  const dependabot = readFileSync(resolve(root, ".github/dependabot.yml"), "utf8");
  assert.match(workflow, /cron: "17 \*\/6 \* \* \*"/u);
  assert.match(workflow, /issues: write/u);
  assert.match(workflow, /QCoder autonomy tick needs attention/u);
  assert.doesNotMatch(workflow, /```json/u);
  assert.match(dependabot, /package-ecosystem: "npm"/u);
  assert.match(dependabot, /package-ecosystem: "github-actions"/u);
});
