#!/usr/bin/env node
/**
 * Registers every ECHO connector in claude_desktop_config.json.
 * Takes a timestamped backup first; merges rather than replaces; idempotent.
 * Run with --dry to print the resulting block without writing.
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = JSON.parse(readFileSync(join(HERE, "connectors.json"), "utf8"));
const SERVER = join(HERE, "server.js");
const CONFIG = join(process.env.APPDATA || "", "Claude", "claude_desktop_config.json");
const DRY = process.argv.includes("--dry");

const block = {};
for (const key of Object.keys(REGISTRY.connectors)) {
  block[`echo-${key}`] = {
    command: "node",
    args: [SERVER],
    env: { ECHO_CONNECTOR: key },
  };
}

if (DRY) {
  console.log(JSON.stringify(block, null, 2));
  process.exit(0);
}

const raw = readFileSync(CONFIG, "utf8");
const config = JSON.parse(raw);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${CONFIG}.bak-${stamp}`;
copyFileSync(CONFIG, backup);

config.mcpServers = config.mcpServers || {};
const added = [];
const updated = [];
for (const [name, entry] of Object.entries(block)) {
  if (config.mcpServers[name]) updated.push(name);
  else added.push(name);
  config.mcpServers[name] = entry;
}

writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n", "utf8");
console.log(`backup   ${backup}`);
console.log(`added    ${added.length ? added.join(", ") : "(none)"}`);
console.log(`updated  ${updated.length ? updated.join(", ") : "(none)"}`);
console.log(`total mcpServers now: ${Object.keys(config.mcpServers).length}`);
console.log("\nRestart Claude Desktop to load them.");
