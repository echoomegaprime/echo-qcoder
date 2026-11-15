#!/usr/bin/env node
/**
 * ECHO CONNECTORS - governance assertions.
 * Proves the tier guard, lifecycle guard and secret redaction actually fire
 * against the live registry, rather than merely being documented.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "server.js");

function client(key) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ECHO_CONNECTOR: key },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pending = new Map();
  let buffer = "";
  let nextId = 1;
  child.stdout.on("data", (d) => {
    buffer += d.toString();
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const w = pending.get(msg.id);
        if (w) {
          pending.delete(msg.id);
          w(msg);
        }
      } catch {
        /* ignore non-JSON */
      }
    }
  });
  const rpc = (method, params) =>
    new Promise((res) => {
      const id = nextId++;
      pending.set(id, res);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  const tool = async (name, args) => {
    const msg = await rpc("tools/call", { name, arguments: args });
    try {
      return JSON.parse(msg.result.content[0].text);
    } catch {
      return { _raw: msg };
    }
  };
  return { rpc, tool, kill: () => child.kill() };
}

const results = [];
const assert = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`   ${ok ? "ok  " : "FAIL"} ${name.padEnd(38)} ${detail ?? ""}`);
};

console.log("\nGovernance assertions (live registry)\n");

// --- tier guard -----------------------------------------------------------
const sdk = client("sdk");
await sdk.rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "guards", version: "1" } });
const tier2 = await sdk.tool("sdk_caps", { max_tier: 3, limit: 200 });
const hot = (tier2.capabilities || []).find((c) => Number(c.danger_tier) >= 2);
sdk.kill();

const vault = client("vault");
await vault.rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "guards", version: "1" } });
const vcaps = await vault.tool("vault_caps", { max_tier: 3, limit: 200 });
const vhot = (vcaps.capabilities || []).find((c) => Number(c.danger_tier) >= 2);
const vt3 = (vcaps.capabilities || []).find((c) => Number(c.danger_tier) >= 3);

if (vhot) {
  const blocked = await vault.tool("vault_invoke", { capability: vhot.id, params: {} });
  const expected = Number(vhot.danger_tier) >= 3 ? "tier3_blocked" : "bypass_reason_required";
  assert(`tier ${vhot.danger_tier} refused without justification`, blocked.refused === expected, `${vhot.id} -> ${blocked.refused}`);

  const short = await vault.tool("vault_invoke", { capability: vhot.id, params: {}, bypass_reason: "because I said so" });
  assert("short bypass_reason refused", short.refused === expected, `-> ${short.refused}`);
} else {
  assert("tier guard", false, "no tier>=2 capability found in vault namespace to test against");
}

assert("tier 3 blocked by default", vt3 ? (await vault.tool("vault_invoke", { capability: vt3.id, params: {} })).refused === "tier3_blocked" : true, vt3 ? vt3.id : "no tier-3 cap in namespace - vacuously true");

// --- namespace jail -------------------------------------------------------
const foreign = await vault.tool("vault_invoke", { capability: "echo.shell.run", params: { cmd: "whoami" } });
assert("foreign namespace refused", foreign.refused === "namespace_jail", `echo.shell.run -> ${foreign.refused}`);

const unregistered = await vault.tool("vault_invoke", { capability: "echo.vault.definitely_not_real", params: {} });
assert("unregistered capability refused", unregistered.refused === "capability_not_registered", `-> ${unregistered.refused}`);

// --- secret redaction -----------------------------------------------------
const listCap = (vcaps.capabilities || []).find((c) => /list|categories|services/.test(c.id) && Number(c.danger_tier) <= 1);
if (listCap) {
  const out = await vault.tool("vault_invoke", { capability: listCap.id, params: {} });
  const blob = JSON.stringify(out);
  const leaked = /"(secret|password|access_token|refresh_token|client_secret|private_key)"\s*:\s*"(?!<redacted)/i.test(blob);
  assert("no secret-shaped value in response", !leaked, `${listCap.id}, ${blob.length} bytes`);
} else {
  assert("redaction path exercised", false, "no tier<=1 vault list capability found");
}
vault.kill();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length} assertions | ${results.length - failed} passed | ${failed} failed`);
process.exit(failed ? 1 : 0);
