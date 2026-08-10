#!/usr/bin/env node
/**
 * ECHO CONNECTORS - verification harness.
 *
 * Spawns every connector as a real MCP stdio child, speaks the real protocol,
 * and asserts against the live SDK gate. No mocks: a PASS here means Claude
 * Desktop will get the same answer.
 *
 * Usage:  node smoke.js            (all connectors)
 *         node smoke.js vault sdk  (named connectors only)
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = JSON.parse(readFileSync(join(HERE, "connectors.json"), "utf8"));
const SERVER = join(HERE, "server.js");
const only = process.argv.slice(2);
const KEYS = only.length ? only : Object.keys(REGISTRY.connectors);

function runConnector(key) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, ECHO_CONNECTOR: key },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const pending = new Map();
    let buffer = "";
    let stderr = "";
    let nextId = 1;

    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.stdout.on("data", (d) => {
      buffer += d.toString();
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const waiter = pending.get(msg.id);
        if (waiter) {
          pending.delete(msg.id);
          waiter(msg);
        }
      }
    });

    const call = (method, params) =>
      new Promise((res, rej) => {
        const id = nextId++;
        pending.set(id, res);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            rej(new Error(`timeout on ${method}`));
          }
        }, 45000);
      });

    const parse = (msg) => {
      const text = msg && msg.result && msg.result.content && msg.result.content[0] && msg.result.content[0].text;
      try {
        return JSON.parse(text);
      } catch {
        return { _unparsed: text };
      }
    };

    (async () => {
      const checks = [];
      const record = (name, ok, detail) => checks.push({ name, ok, detail });

      try {
        const init = await call("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "echo-smoke", version: "1.0.0" },
        });
        const serverName = init && init.result && init.result.serverInfo && init.result.serverInfo.name;
        record("initialize", serverName === `echo-${key}`, serverName);

        const list = await call("tools/list", {});
        const tools = (list && list.result && list.result.tools) || [];
        record("tools/list", tools.length === 5, `${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);

        const about = parse(await call("tools/call", { name: `${key}_about`, arguments: {} }));
        record("about", about && about.connector === key, (about && about.github_repo) || "no repo");
        const keyLoaded = about && about.runtime && about.runtime.sovereign_key_loaded === true;
        record("sovereign key", keyLoaded, keyLoaded ? "loaded" : "MISSING");

        const health = parse(await call("tools/call", { name: `${key}_health`, arguments: {} }));
        record("gate reachable", health && health.gate_reachable === true, (health && (health.error || health.gate)) || "");
        record("capabilities registered", Number((health && health.total_capabilities) || 0) > 0, `${(health && health.total_capabilities) || 0} caps`);

        const caps = parse(await call("tools/call", { name: `${key}_caps`, arguments: { limit: 5, max_tier: 1 } }));
        const first = caps && caps.capabilities && caps.capabilities[0] && caps.capabilities[0].id;
        record("caps listing", Array.isArray(caps && caps.capabilities), first ? `first=${first}` : "empty");

        const jailed = parse(
          await call("tools/call", { name: `${key}_invoke`, arguments: { capability: "echo.shell.run", params: {} } }),
        );
        const jailWorks = key === "sdk" ? jailed && jailed.refused !== undefined : jailed && jailed.refused === "namespace_jail";
        record("namespace jail", Boolean(jailWorks), (jailed && jailed.refused) || "NOT REFUSED");

        if (first) {
          const spec = parse(await call("tools/call", { name: `${key}_describe`, arguments: { capability: first } }));
          record("describe", spec && spec.capability === first, `tier=${spec && spec.danger_tier}`);
        } else {
          record("describe", true, "skipped - namespace has no live capabilities yet");
        }
      } catch (err) {
        record("fatal", false, String(err.message || err));
      }

      child.kill();
      resolve({ key, checks, stderr: stderr.trim().split("\n")[0] || "" });
    })();
  });
}

const results = [];
for (const key of KEYS) results.push(await runConnector(key));

let failed = 0;
for (const r of results) {
  const bad = r.checks.filter((c) => !c.ok);
  failed += bad.length;
  const mark = bad.length === 0 ? "PASS" : "FAIL";
  const title = (REGISTRY.connectors[r.key] && REGISTRY.connectors[r.key].title) || "?";
  console.log(`\n[${mark}] ${r.key}  (${title})`);
  for (const c of r.checks) {
    console.log(`   ${c.ok ? "ok  " : "FAIL"} ${c.name.padEnd(24)} ${c.detail === undefined ? "" : c.detail}`);
  }
}
const clean = results.filter((r) => r.checks.every((c) => c.ok)).length;
console.log(`\n${results.length} connectors | ${clean} clean | ${failed} failed checks`);
process.exit(failed ? 1 : 0);
