import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(import.meta.dirname, "../config/crucible-tool-catalog.json");
const value = JSON.parse(readFileSync(path, "utf8"));
const errors = [];
const tiers = new Set(["low", "medium", "high", "critical"]);
const authorities = new Set(["workspace-safe", "crucible-scope-required", "crucible-only"]);
const routePrefixes = value.policy?.routePrefixes ?? ["echo.crucible."];
const allIds = new Set();
const allRepos = new Set();

if (value.schemaVersion !== 2) errors.push("schemaVersion must be 2");
if (!Array.isArray(value.batches) || value.batches.length === 0)
  errors.push("at least one batch is required");

for (const batch of value.batches ?? []) {
  const label = `batch ${batch.batchId}`;
  if (!Number.isInteger(batch.batchId) || batch.batchId < 1)
    errors.push(`${label}: invalid batchId`);
  if (Number.isNaN(Date.parse(batch.checkedAt))) errors.push(`${label}: checkedAt must be ISO`);
  if (!Array.isArray(batch.tools) || batch.tools.length !== 20)
    errors.push(`${label}: exactly 20 tools are required`);

  const batchTiers = new Set();
  for (const tool of batch.tools ?? []) {
    const tag = `${label}/${tool.id}`;
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(tool.id ?? "")) errors.push(`${tag}: invalid id`);
    if (allIds.has(tool.id)) errors.push(`${tag}: duplicate id across batches`);
    allIds.add(tool.id);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(tool.repository ?? ""))
      errors.push(`${tag}: invalid repository`);
    if (allRepos.has(tool.repository)) errors.push(`${tag}: duplicate repository across batches`);
    allRepos.add(tool.repository);
    if (tool.source !== `https://github.com/${tool.repository}`)
      errors.push(`${tag}: non-canonical source`);
    if (!/^[a-f0-9]{40}$/u.test(tool.commit ?? "")) errors.push(`${tag}: invalid commit`);
    if (!/^[a-f0-9]{64}$/u.test(tool.licenseSha256 ?? ""))
      errors.push(`${tag}: invalid license digest`);
    if (!value.policy.allowedLicenses.includes(tool.license))
      errors.push(`${tag}: disallowed license`);
    if (!tiers.has(tool.riskTier)) errors.push(`${tag}: invalid risk tier`);
    if (!authorities.has(tool.authority)) errors.push(`${tag}: invalid authority`);
    if (tool.riskTier === "critical" && tool.authority !== "crucible-only")
      errors.push(`${tag}: critical tools must be Crucible-only`);
    if (tool.riskTier === "high" && tool.authority === "workspace-safe")
      errors.push(`${tag}: high-risk tool cannot be workspace-safe`);
    if (tool.riskTier === "low" && tool.authority !== "workspace-safe")
      errors.push(`${tag}: low-risk tool must be workspace-safe`);
    if (!routePrefixes.some((prefix) => tool.crucibleRoute?.startsWith(prefix)))
      errors.push(`${tag}: missing Crucible route`);
    if (!Array.isArray(tool.capabilities) || tool.capabilities.length === 0)
      errors.push(`${tag}: capabilities required`);
    batchTiers.add(tool.riskTier);
  }
  for (const tier of tiers) {
    if (!batchTiers.has(tier)) errors.push(`${label}: missing risk tier ${tier}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const allTools = value.batches.flatMap((batch) => batch.tools);
  const counts = Object.groupBy(allTools, ({ riskTier }) => riskTier);
  console.log(
    `CRUCIBLE_CATALOG_VALID batches=${value.batches.length} tools=${allTools.length} low=${counts.low?.length ?? 0} medium=${counts.medium?.length ?? 0} high=${counts.high?.length ?? 0} critical=${counts.critical?.length ?? 0}`,
  );
}
