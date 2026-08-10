import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("powerpack pins a unique permissive upstream set", () => {
  const manifest = readJson("config/qcoder-powerpack.json");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.repositories.length, 21);
  assert.equal(new Set(manifest.repositories.map(({ id }) => id)).size, 21);

  for (const repository of manifest.repositories) {
    assert.match(repository.id, /^[a-z0-9][a-z0-9-]*$/u);
    assert.match(repository.repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);
    assert.match(repository.source, /^https:\/\/github\.com\//u);
    assert.match(repository.commit, /^[a-f0-9]{40}$/u);
    assert.match(repository.licenseSha256, /^[a-f0-9]{64}$/u);
    assert.ok(["MIT", "Apache-2.0"].includes(repository.license));
    assert.ok(["integrated", "installable", "sidecar", "reference"].includes(repository.posture));
    assert.ok(repository.capabilities.length > 0);
  }
});

test("the upstream set includes the autonomous coding lifecycle", () => {
  const manifest = readJson("config/qcoder-powerpack.json");
  const ids = new Set(manifest.repositories.map(({ id }) => id));
  for (const id of [
    "qwen-code",
    "qwen-agent",
    "playwright-mcp",
    "spec-kit",
    "markitdown",
    "pr-agent",
    "superpowers",
  ]) {
    assert.ok(ids.has(id), `${id} is missing`);
  }
});

test("the local profile exposes only the bounded Serena semantic tools", () => {
  const settings = readJson("launcher/qwen-settings.json");
  assert.deepEqual(settings.mcp.allowed, ["qcoder-serena"]);
  const serena = settings.mcpServers["qcoder-serena"];
  assert.equal(serena.trust, false);
  assert.ok(serena.args.includes("--project-from-cwd"));
  assert.ok(serena.includeTools.includes("find_symbol"));
  assert.ok(serena.includeTools.includes("find_referencing_symbols"));
  assert.ok(!serena.includeTools.includes("execute_shell_command"));

  const pluginSettings = readJson("launcher/qwen-plugin-settings.json");
  assert.deepEqual(pluginSettings.mcp.allowed, []);
  assert.equal(pluginSettings.mcpServers, undefined);

  const project = readFileSync(resolve(root, ".serena/project.yml"), "utf8");
  assert.match(project, /languages:\r?\n\s+- typescript\r?\n\s+- python\r?\n\s+- powershell/u);
  assert.match(project, /fixed_tools:[\s\S]*- find_symbol[\s\S]*- safe_delete_symbol/u);
  assert.doesNotMatch(project, /fixed_tools:[\s\S]*- execute_shell_command/u);
});

test("plain qcoder defaults directly to the cli-build role", () => {
  const launcher = readFileSync(resolve(root, "launcher/qcoder.ps1"), "utf8");
  assert.match(launcher, /\[string\]\$Role\s*=\s*'cli-build'/u);
  assert.match(launcher, /\$launcher\.Role\s*=\s*\$Role/u);
});

test("all focused Qwen power skills are packaged", () => {
  const names = [
    "qcoder-audio-operator",
    "qcoder-authorized-security",
    "qcoder-autonomous-issue-solver",
    "qcoder-browser-researcher",
    "qcoder-coding-builder",
    "qcoder-self-evaluator",
    "qcoder-semantic-navigator",
    "qcoder-vision-operator",
  ];
  for (const name of names) {
    const source = readFileSync(resolve(root, "qwen-skills", name, "SKILL.md"), "utf8");
    assert.match(source, new RegExp(`^---\\r?\\nname: ${name}\\r?\\ndescription:`, "u"));
  }
});

test("installer is allowlisted and never pipes remote scripts to a shell", () => {
  const installer = readFileSync(resolve(root, "scripts/install-qcoder-powerpack.ps1"), "utf8");
  assert.doesNotMatch(installer, /curl[^\r\n|]*\|\s*(?:ba)?sh/iu);
  assert.match(installer, /ValidateSet\('Core', 'Semantic', 'IssueSolver', 'Evaluation'\)/u);
  assert.match(installer, /Get-PinnedPackage -Id 'qwen-code'/u);
  assert.match(installer, /Get-Command qwen/u);
  assert.match(installer, /--prefix/u);
  assert.match(installer, /Get-PinnedPackage -Id 'serena'/u);
  assert.match(installer, /Get-PinnedPackage -Id 'ast-grep'/u);
  assert.doesNotMatch(installer, /Get-PinnedPackage -Id 'promptfoo'/u);
  assert.match(installer, /promptfoo=withheld-high-transitive-audit/u);
  assert.match(installer, /install-qwen-skills\.ps1'\) -Force/u);
});

test("FORGE model provisioning creates a bounded 32K derivative without replacing the source", () => {
  const provisioning = readFileSync(
    resolve(root, "deployment/forge/provision-qcoder-model.sh"),
    "utf8",
  );
  assert.match(provisioning, /source_model=.*c3po-code:latest/u);
  assert.match(provisioning, /target_model=.*c3po-code:qcoder-32k/u);
  assert.match(provisioning, /context_length=.*32768/u);
  assert.match(provisioning, /ollama show --modelfile/u);
  assert.match(provisioning, /ollama create/u);
  assert.match(provisioning, /actual_context/u);
  assert.doesNotMatch(provisioning, /ollama (?:rm|delete)/u);
});

test("release staging excludes unrelated untracked files", () => {
  const staging = readFileSync(resolve(root, "scripts/stage-plugin.ps1"), "utf8");
  assert.match(staging, /git -C \$root ls-files --cached/u);
  assert.match(staging, /Test-PackageCandidate/u);
  assert.match(staging, /server\/dist\/\*/u);
  assert.match(staging, /web\/dist\/\*/u);
});

test("MCP Inspector switch is not overwritten by a same-name command variable", () => {
  const smoke = readFileSync(resolve(root, "scripts/test-mcp.ps1"), "utf8");
  assert.doesNotMatch(smoke, /\$inspector\s*=/iu);
  assert.match(smoke, /\$inspectorCommand\s*=/u);
});

test("repository gates ignore the isolated powerpack runtime", () => {
  const eslintConfig = readFileSync(resolve(root, "eslint.config.js"), "utf8");
  const prettierIgnore = readFileSync(resolve(root, ".prettierignore"), "utf8");
  const verifier = readFileSync(resolve(root, "scripts/verify-plugin.ps1"), "utf8");
  assert.match(eslintConfig, /"\.runtime\/\*\*"/u);
  assert.match(prettierIgnore, /^\.runtime$/mu);
  assert.ok((verifier.match(/\\\.runtime\[\\\\\/\]/gu) ?? []).length >= 2);
});
