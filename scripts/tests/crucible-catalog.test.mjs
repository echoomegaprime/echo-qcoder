import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Crucible catalog batches each contain all risk tiers and strict authority mapping", () => {
  const catalog = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../config/crucible-tool-catalog.json"), "utf8"),
  );
  assert.equal(catalog.schemaVersion, 2);
  assert.ok(Array.isArray(catalog.batches) && catalog.batches.length >= 1);
  const routePrefixes = catalog.policy?.routePrefixes ?? ["echo.crucible."];
  assert.ok(routePrefixes.length > 0, "policy.routePrefixes must be non-empty");

  const seenIds = new Set();
  const seenRepos = new Set();
  for (const batch of catalog.batches) {
    assert.equal(batch.tools.length, 20, `batch ${batch.batchId} must have 20 tools`);
    assert.deepEqual(
      new Set(batch.tools.map((tool) => tool.riskTier)),
      new Set(["low", "medium", "high", "critical"]),
      `batch ${batch.batchId} must cover all four risk tiers`,
    );
    for (const tool of batch.tools) {
      if (tool.riskTier === "critical") assert.equal(tool.authority, "crucible-only");
      if (tool.riskTier === "high") assert.notEqual(tool.authority, "workspace-safe");
      if (tool.riskTier === "low") assert.equal(tool.authority, "workspace-safe");
      assert.ok(
        routePrefixes.some((prefix) => tool.crucibleRoute?.startsWith(prefix)),
        `${tool.id}: crucibleRoute ${tool.crucibleRoute} does not match any policy.routePrefixes entry`,
      );
      assert.ok(!seenIds.has(tool.id), `duplicate id across batches: ${tool.id}`);
      seenIds.add(tool.id);
      assert.ok(
        !seenRepos.has(tool.repository),
        `duplicate repository across batches: ${tool.repository}`,
      );
      seenRepos.add(tool.repository);
    }
  }
});
