import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(import.meta.dirname, "../config/crucible-tool-catalog.json");
const value = JSON.parse(readFileSync(path, "utf8"));
const errors = [];
const tiers = new Set(["low", "medium", "high", "critical"]);
const authorities = new Set(["workspace-safe", "crucible-scope-required", "crucible-only"]);
const ids = new Set();
const repos = new Set();

if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (Number.isNaN(Date.parse(value.checkedAt))) errors.push("checkedAt must be ISO");
if (!Array.isArray(value.tools) || value.tools.length !== 20)
  errors.push("exactly 20 tools are required");
for (const tool of value.tools ?? []) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(tool.id ?? "")) errors.push(`${tool.id}: invalid id`);
  if (ids.has(tool.id)) errors.push(`${tool.id}: duplicate id`);
  ids.add(tool.id);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(tool.repository ?? ""))
    errors.push(`${tool.id}: invalid repository`);
  if (repos.has(tool.repository)) errors.push(`${tool.id}: duplicate repository`);
  repos.add(tool.repository);
  if (tool.source !== `https://github.com/${tool.repository}`)
    errors.push(`${tool.id}: non-canonical source`);
  if (!/^[a-f0-9]{40}$/u.test(tool.commit ?? "")) errors.push(`${tool.id}: invalid commit`);
  if (!/^[a-f0-9]{64}$/u.test(tool.licenseSha256 ?? ""))
    errors.push(`${tool.id}: invalid license digest`);
  if (!value.policy.allowedLicenses.includes(tool.license))
    errors.push(`${tool.id}: disallowed license`);
  if (!tiers.has(tool.riskTier)) errors.push(`${tool.id}: invalid risk tier`);
  if (!authorities.has(tool.authority)) errors.push(`${tool.id}: invalid authority`);
  if (tool.riskTier === "critical" && tool.authority !== "crucible-only")
    errors.push(`${tool.id}: critical tools must be Crucible-only`);
  if (tool.riskTier === "high" && tool.authority === "workspace-safe")
    errors.push(`${tool.id}: high-risk tool cannot be workspace-safe`);
  if (tool.riskTier === "low" && tool.authority !== "workspace-safe")
    errors.push(`${tool.id}: low-risk tool must be workspace-safe`);
  if (!tool.crucibleRoute?.startsWith("echo.crucible."))
    errors.push(`${tool.id}: missing Crucible route`);
  if (!Array.isArray(tool.capabilities) || tool.capabilities.length === 0)
    errors.push(`${tool.id}: capabilities required`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const counts = Object.groupBy(value.tools, ({ riskTier }) => riskTier);
  console.log(
    `CRUCIBLE_CATALOG_VALID tools=${value.tools.length} low=${counts.low?.length ?? 0} medium=${counts.medium?.length ?? 0} high=${counts.high?.length ?? 0} critical=${counts.critical?.length ?? 0}`,
  );
}
