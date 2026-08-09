import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const settings = JSON.parse(readFileSync(resolve(root, "launcher/qwen-settings.json"), "utf8"));
const config = settings.mcpServers?.["qcoder-serena"];
if (!config) throw new Error("qcoder-serena MCP configuration is missing");

const client = new Client({ name: "qcoder-serena-smoke", version: "0.3.0" });
const transport = new StdioClientTransport({
  command: config.command,
  args: config.args,
  cwd: root,
  stderr: "pipe",
});
await client.connect(transport);
try {
  const listed = await client.listTools();
  const names = new Set(listed.tools.map(({ name }) => name));
  for (const name of config.includeTools) {
    if (!names.has(name)) throw new Error(`Serena did not expose allowlisted tool: ${name}`);
  }
  if (!config.excludeTools.includes("execute_shell_command")) {
    throw new Error("QCoder settings do not exclude Serena's raw shell tool");
  }

  const overview = await client.callTool({
    name: "get_symbols_overview",
    arguments: { relative_path: "launcher/qcoder_adapter.py", depth: 1 },
  });
  if (overview.isError) {
    throw new Error(
      `Serena symbol overview returned an error: ${JSON.stringify(overview.content).slice(0, 600)}`,
    );
  }
  console.log(
    `QCODER_SERENA_MCP_OK discovered=${listed.tools.length} allowed=${config.includeTools.length} symbol_overview=pass`,
  );
} finally {
  await client.close();
}
