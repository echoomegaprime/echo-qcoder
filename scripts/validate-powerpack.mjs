import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "config/qcoder-powerpack.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const errors = validateManifest(manifest);

if (process.argv.includes("--online") && errors.length === 0) {
  for (const repository of manifest.repositories) {
    try {
      const head = execFileSync("git", ["ls-remote", `${repository.source}.git`, "HEAD"], {
        encoding: "utf8",
        timeout: 30_000,
      })
        .trim()
        .split(/\s+/u)[0];
      if (head !== repository.commit) {
        errors.push(`${repository.id}: HEAD drifted from ${repository.commit} to ${head}`);
      }

      const licenseUrl = `https://raw.githubusercontent.com/${repository.repository}/${repository.branch}/${repository.licensePath}`;
      const response = await fetch(licenseUrl, {
        headers: { "user-agent": "echo-qcoder-powerpack-validator" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        errors.push(`${repository.id}: license fetch returned ${response.status}`);
        continue;
      }
      const digest = createHash("sha256")
        .update(await response.text(), "utf8")
        .digest("hex");
      if (digest !== repository.licenseSha256) {
        errors.push(`${repository.id}: license digest changed`);
      }
    } catch (error) {
      errors.push(`${repository.id}: online verification failed: ${safeError(error)}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const counts = Object.groupBy(manifest.repositories, ({ posture }) => posture);
  console.log(
    `QCODER_POWERPACK_VALID repos=${manifest.repositories.length} integrated=${counts.integrated?.length ?? 0} installable=${counts.installable?.length ?? 0} sidecar=${counts.sidecar?.length ?? 0} reference=${counts.reference?.length ?? 0} online=${process.argv.includes("--online")}`,
  );
}

function validateManifest(value) {
  const failures = [];
  if (value.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (Number.isNaN(Date.parse(value.checkedAt)))
    failures.push("checkedAt must be an ISO timestamp");
  if (!Array.isArray(value.repositories) || value.repositories.length < 10) {
    failures.push("at least ten upstream repositories are required");
    return failures;
  }

  const ids = new Set();
  const repositories = new Set();
  for (const entry of value.repositories) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(entry.id ?? "")) failures.push("invalid repository id");
    if (ids.has(entry.id)) failures.push(`duplicate id: ${entry.id}`);
    ids.add(entry.id);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(entry.repository ?? "")) {
      failures.push(`${entry.id}: invalid repository slug`);
    }
    if (repositories.has(entry.repository))
      failures.push(`duplicate repository: ${entry.repository}`);
    repositories.add(entry.repository);
    if (entry.source !== `https://github.com/${entry.repository}`) {
      failures.push(`${entry.id}: source must be the canonical GitHub URL`);
    }
    if (!/^[a-f0-9]{40}$/u.test(entry.commit ?? "")) failures.push(`${entry.id}: invalid commit`);
    if (!/^[a-f0-9]{64}$/u.test(entry.licenseSha256 ?? "")) {
      failures.push(`${entry.id}: invalid license digest`);
    }
    if (!value.policy.allowedLicenses.includes(entry.license)) {
      failures.push(`${entry.id}: disallowed license ${entry.license}`);
    }
    if (!["integrated", "installable", "sidecar", "reference"].includes(entry.posture)) {
      failures.push(`${entry.id}: invalid adoption posture`);
    }
    if (!Array.isArray(entry.capabilities) || entry.capabilities.length === 0) {
      failures.push(`${entry.id}: capabilities are required`);
    }
  }
  return failures;
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/gu, " ").slice(0, 240);
}
