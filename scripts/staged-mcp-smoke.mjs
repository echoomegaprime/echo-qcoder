import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRootIndex = process.argv.indexOf("--plugin-root");
const suppliedPluginRoot =
  pluginRootIndex >= 0 && process.argv[pluginRootIndex + 1]
    ? resolve(process.argv[pluginRootIndex + 1])
    : undefined;
const ownsStagedDirectory = !suppliedPluginRoot;
const staged = suppliedPluginRoot ?? (await mkdtemp(join(tmpdir(), "echo-qcoder-staged-smoke-")));
const runtimeDirectory = await mkdtemp(join(tmpdir(), "echo-qcoder-runtime-smoke-"));
let client;

try {
  if (ownsStagedDirectory) {
    const powershell = process.platform === "win32" ? "pwsh.exe" : "pwsh";
    const stage = spawnSync(
      powershell,
      [
        "-NoLogo",
        "-NoProfile",
        "-File",
        join(root, "scripts", "stage-plugin.ps1"),
        "-Destination",
        staged,
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(
      stage.status,
      0,
      `Plugin staging failed.\nstdout:\n${stage.stdout}\nstderr:\n${stage.stderr}`,
    );
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(staged, "server", "dist", "index.js"), "--stdio"],
    cwd: staged,
    env: {
      ...process.env,
      QCODER_TRUSTED_STDIO: "1",
      QCODER_DATA_DIR: runtimeDirectory,
    },
    stderr: "pipe",
  });
  let childStderr = "";
  transport.stderr?.on("data", (chunk) => {
    childStderr += chunk.toString();
  });
  client = new Client({ name: "qcoder-staged-smoke", version: "0.3.0" });
  try {
    await client.connect(transport);
  } catch (error) {
    throw new Error(`The staged QCoder MCP process closed before initialization.\n${childStderr}`, {
      cause: error,
    });
  }

  const tools = await client.listTools();
  assert.equal(tools.tools.length, 7, "The staged plugin must expose exactly seven tools");
  assert(
    tools.tools.every((tool) => tool.inputSchema && tool.outputSchema && tool.annotations),
    "Every staged tool must keep its schemas and annotations",
  );
  const resource = await client.readResource({ uri: "ui://qcoder/console/v1" });
  assert.match(resource.contents[0]?.mimeType ?? "", /mcp-app/);
  console.log("QCODER_STAGED_MCP_OK tools=7 resource=ui://qcoder/console/v1");
} finally {
  await client?.close().catch(() => undefined);
  await rm(runtimeDirectory, { recursive: true, force: true });
  if (ownsStagedDirectory) await rm(staged, { recursive: true, force: true });
}
