import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = new URL(process.argv[2] ?? "http://127.0.0.1:8788/mcp");
const client = new Client({ name: "qcoder-smoke", version: "0.3.0" });
await client.connect(new StreamableHTTPClientTransport(endpoint));
try {
  const tools = await client.listTools();
  if (tools.tools.length !== 7)
    throw new Error(`Expected 7 tools, received ${tools.tools.length}.`);
  if (tools.tools.some((tool) => !tool.inputSchema || !tool.outputSchema || !tool.annotations)) {
    throw new Error("Tool metadata is incomplete.");
  }
  const resource = await client.readResource({ uri: "ui://qcoder/console/v1" });
  if (!resource.contents[0]?.mimeType?.includes("mcp-app"))
    throw new Error("QCoder UI resource is invalid.");
  console.log("QCODER_MCP_PROTOCOL_OK tools=7 resource=ui://qcoder/console/v1");
} finally {
  await client.close();
}
