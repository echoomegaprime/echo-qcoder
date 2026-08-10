import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Crucible catalog contains all risk tiers and strict authority mapping", () => {
  const catalog = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../config/crucible-tool-catalog.json"), "utf8"),
  );
  assert.equal(catalog.tools.length, 20);
  assert.deepEqual(
    new Set(catalog.tools.map((tool) => tool.riskTier)),
    new Set(["low", "medium", "high", "critical"]),
  );
  for (const tool of catalog.tools) {
    if (tool.riskTier === "critical") assert.equal(tool.authority, "crucible-only");
    if (tool.riskTier === "high") assert.notEqual(tool.authority, "workspace-safe");
    if (tool.riskTier === "low") assert.equal(tool.authority, "workspace-safe");
    assert.match(tool.crucibleRoute, /^echo\.crucible\./u);
  }
});
