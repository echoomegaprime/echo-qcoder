import { readFile } from "node:fs/promises";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { QCoderSessionService } from "./services/sessionService.js";
import type { TokenVerifier } from "./auth/types.js";
import { QCODER_CONSOLE_URI, toolDefinitions } from "./tools/definitions.js";
import { invokeTool } from "./tools/handlers.js";

export interface McpServerDependencies {
  bearerToken: string | null;
  verifier: TokenVerifier;
  service: QCoderSessionService;
  protectedResourceMetadataUrl: string;
  webBundlePath: string;
}

export function createQCoderMcpServer(dependencies: McpServerDependencies): McpServer {
  const server = new McpServer(
    { name: "echo-qcoder-console", version: "0.3.0" },
    {
      instructions:
        "Control only authenticated, governed QCoder sessions in registered workspaces. Preview before start, use stable IDs and revisions, and never approximate raw terminal or arbitrary shell access.",
    },
  );

  for (const definition of toolDefinitions) {
    const config = {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      annotations: definition.annotations,
      _meta: {
        securitySchemes: definition.securitySchemes,
        ...(definition.resourceUri ? { ui: { resourceUri: definition.resourceUri } } : {}),
      },
    };
    const callback = async (input: unknown) =>
      invokeTool(
        {
          bearerToken: dependencies.bearerToken,
          verifier: dependencies.verifier,
          service: dependencies.service,
          protectedResourceMetadataUrl: dependencies.protectedResourceMetadataUrl,
        },
        definition.name,
        input,
      );
    registerAppTool(server, definition.name, config, callback);
  }

  registerAppResource(
    server,
    "QCoder Console",
    QCODER_CONSOLE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Interactive, authenticated QCoder session console.",
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
    },
    async () => ({
      contents: [
        {
          uri: QCODER_CONSOLE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(dependencies.webBundlePath, "utf8"),
          _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
        },
      ],
    }),
  );

  return server;
}
