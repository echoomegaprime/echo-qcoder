import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = realpathSync(resolve(import.meta.dirname, ".."));
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const manifest = readJson(".codex-plugin/plugin.json");
const errors = [];
const required = ["name", "version", "description", "author", "license", "interface"];
for (const field of required) if (!manifest[field]) errors.push(`plugin.json missing ${field}`);
if (!/^\d+\.\d+\.\d+$/u.test(manifest.version ?? ""))
  errors.push("plugin version is not strict semver");
if (existsSync(resolve(root, ".app.json")) !== Object.hasOwn(manifest, "apps"))
  errors.push("apps field and .app.json presence disagree");
for (const field of ["skills", "mcpServers"]) validatePath(manifest[field], field);
for (const field of [
  "composerIcon",
  "logo",
  "privacyPolicyURL",
  "termsOfServiceURL",
  "websiteURL",
]) {
  const value = manifest.interface?.[field];
  if (typeof value === "string" && value.startsWith("./"))
    validatePath(value, `interface.${field}`);
}
const mcp = readJson(".mcp.json");
if (!mcp.mcpServers?.qcoder) errors.push(".mcp.json missing qcoder server");
const marketplace = readJson(".agents/plugins/marketplace.json");
if (!marketplace.interface?.displayName) errors.push("marketplace missing interface.displayName");
const entry = marketplace.plugins?.find((plugin) => plugin.name === manifest.name);
if (!entry) errors.push("marketplace missing plugin entry");
if (entry?.source?.source !== "local" || entry.source.path !== "./plugins/echo-qcoder-console")
  errors.push("marketplace local source is invalid");
const skill = readFileSync(resolve(root, "skills/qcoder-session-operator/SKILL.md"), "utf8");
if (!/^---\r?\nname: qcoder-session-operator\r?\ndescription:/u.test(skill))
  errors.push("skill front matter is invalid");
const qwenSkillsRoot = resolve(root, "qwen-skills");
const qwenSkillNames = [
  "qcoder-coding-builder",
  "qcoder-authorized-security",
  "qcoder-vision-operator",
  "qcoder-audio-operator",
];
for (const name of qwenSkillNames) {
  const path = resolve(qwenSkillsRoot, name, "SKILL.md");
  if (!existsSync(path)) {
    errors.push(`Qwen skill is missing: ${name}`);
    continue;
  }
  const source = readFileSync(path, "utf8");
  if (!new RegExp(`^---\\r?\\nname: ${name}\\r?\\ndescription:`, "u").test(source))
    errors.push(`Qwen skill front matter is invalid: ${name}`);
}
for (const entry of readdirSync(qwenSkillsRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !qwenSkillNames.includes(entry.name))
    errors.push(`unexpected Qwen skill directory: ${entry.name}`);
}
const definitionsPath = resolve(root, "server/dist/tools/definitions.js");
const archiveMode = process.argv.includes("--archive");
if (existsSync(definitionsPath) && !archiveMode) {
  const { toolDefinitions } = await import(pathToFileURL(definitionsPath));
  if (toolDefinitions.length !== 7 || new Set(toolDefinitions.map((tool) => tool.name)).size !== 7)
    errors.push("tool inventory is invalid");
  for (const tool of toolDefinitions) {
    if (!tool.description.startsWith("Use this when"))
      errors.push(`${tool.name} description routing prefix missing`);
    for (const hint of ["readOnlyHint", "destructiveHint", "openWorldHint", "idempotentHint"])
      if (typeof tool.annotations?.[hint] !== "boolean")
        errors.push(`${tool.name} missing ${hint}`);
    if (!tool.securitySchemes?.[0]?.scopes?.length)
      errors.push(`${tool.name} missing security scheme`);
  }
} else if (archiveMode) {
  const definitionsSource = readFileSync(resolve(root, "server/src/tools/definitions.ts"), "utf8");
  const expectedTools = [
    "list_qcoder_sessions",
    "get_qcoder_session",
    "preview_qcoder_task",
    "start_qcoder_session",
    "send_qcoder_task",
    "stop_qcoder_session",
    "render_qcoder_console",
  ];
  for (const name of expectedTools) {
    if (!definitionsSource.includes(`name: "${name}"`))
      errors.push(`archive tool inventory missing ${name}`);
  }
  for (const hint of ["readOnlyHint", "destructiveHint", "openWorldHint", "idempotentHint"]) {
    const count = definitionsSource.match(new RegExp(`${hint}:`, "gu"))?.length ?? 0;
    if (count < expectedTools.length)
      errors.push(`archive tool metadata has only ${count} ${hint} entries`);
  }
}
const serverSource = readFileSync(resolve(root, "server/src/server.ts"), "utf8");
if (
  /connectDomains:\s*\[[^\]]*\*/u.test(serverSource) ||
  /resourceDomains:\s*\[[^\]]*\*/u.test(serverSource)
)
  errors.push("CSP contains a wildcard");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log("PLUGIN_CONTRACT_VALID tools=7 paths=ok csp=narrow app_id=absent");

function validatePath(value, field) {
  if (typeof value !== "string" || !value.startsWith("./")) {
    errors.push(`${field} must begin with ./`);
    return;
  }
  const target = resolve(root, value);
  const rel = relative(root, target);
  if (rel.startsWith("..") || rel.includes(`..${process.platform === "win32" ? "\\" : "/"}`))
    errors.push(`${field} escapes plugin root`);
  else if (!existsSync(target)) errors.push(`${field} target does not exist`);
}
