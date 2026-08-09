import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("powerpack pins a unique permissive upstream set", () => {
  const manifest = readJson("config/qcoder-powerpack.json");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.repositories.length, 14);
  assert.equal(new Set(manifest.repositories.map(({ id }) => id)).size, 14);

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
  assert.match(installer, /ValidateSet\('Semantic', 'IssueSolver', 'Evaluation'\)/u);
  assert.match(installer, /Get-PinnedPackage -Id 'serena'/u);
  assert.match(installer, /Get-PinnedPackage -Id 'ast-grep'/u);
  assert.doesNotMatch(installer, /Get-PinnedPackage -Id 'promptfoo'/u);
  assert.match(installer, /promptfoo=withheld-high-transitive-audit/u);
  assert.match(installer, /install-qwen-skills\.ps1'\) -Force/u);
});

test("release staging excludes unrelated untracked files", () => {
  const staging = readFileSync(resolve(root, "scripts/stage-plugin.ps1"), "utf8");
  assert.match(staging, /git -C \$root ls-files --cached/u);
  assert.match(staging, /Test-PackageCandidate/u);
  assert.match(staging, /server\/dist\/\*/u);
  assert.match(staging, /web\/dist\/\*/u);
});

test("repository gates ignore the isolated powerpack runtime", () => {
  const eslintConfig = readFileSync(resolve(root, "eslint.config.js"), "utf8");
  const prettierIgnore = readFileSync(resolve(root, ".prettierignore"), "utf8");
  const verifier = readFileSync(resolve(root, "scripts/verify-plugin.ps1"), "utf8");
  assert.match(eslintConfig, /"\.runtime\/\*\*"/u);
  assert.match(prettierIgnore, /^\.runtime$/mu);
  assert.ok((verifier.match(/\\\.runtime\[\\\\\/\]/gu) ?? []).length >= 2);
});
