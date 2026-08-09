import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { StaticPrincipalVerifier } from "../src/auth/staticVerifier.js";
import { SessionRepository } from "../src/persistence/sessionRepository.js";
import { QCoderSessionService } from "../src/services/sessionService.js";
import type { ManagedTaskRunner } from "../src/services/taskRunner.js";
import { TranscriptStore } from "../src/services/transcriptStore.js";
import { WorkspaceRegistry } from "../src/services/workspaceRegistry.js";
import { createQCoderMcpServer } from "../src/server.js";

function fixture(scopes = ["qcoder.sessions.read"]) {
  const root = mkdtempSync(join(tmpdir(), "qcoder-mcp-"));
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const webBundlePath = join(root, "index.html");
  writeFileSync(webBundlePath, "<!doctype html><title>QCoder</title>");
  const repository = new SessionRepository(join(root, "sessions.sqlite3"));
  const runner: ManagedTaskRunner = {
    run: () => new Promise(() => undefined),
    stop: () => Promise.resolve(true),
  };
  const service = new QCoderSessionService({
    repository,
    workspaces: new WorkspaceRegistry({ repo: workspace }),
    transcripts: new TranscriptStore(join(root, "transcripts")),
    runner,
    previewSecret: Buffer.alloc(32, 4),
  });
  const verifier = new StaticPrincipalVerifier({
    subject: "echo:commander",
    tenant: "echo-omega-prime",
    clientId: "test",
    scopes: new Set(scopes),
    expiresAt: 4_102_444_800,
  });
  return { repository, service, verifier, webBundlePath };
}

async function connect(scopes?: string[]) {
  const state = fixture(scopes);
  const server = createQCoderMcpServer({
    bearerToken: "test-token",
    verifier: state.verifier,
    service: state.service,
    protectedResourceMetadataUrl:
      "https://mcp.example.test/.well-known/oauth-protected-resource/qcoder",
    webBundlePath: state.webBundlePath,
  });
  const client = new Client({ name: "qcoder-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { ...state, server, client };
}

describe("QCoder MCP protocol", () => {
  it("initializes, lists strict tools, invokes a read, and resolves the UI resource", async () => {
    const state = await connect();
    const listed = await state.client.listTools();
    expect(listed.tools).toHaveLength(7);
    expect(
      listed.tools.find((tool) => tool.name === "stop_qcoder_session")?.annotations,
    ).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
    const result = await state.client.callTool({
      name: "list_qcoder_sessions",
      arguments: { limit: 10 },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ sessions: [], next_cursor: null });
    const resource = await state.client.readResource({ uri: "ui://qcoder/console/v1" });
    expect(resource.contents[0]?.mimeType).toContain("mcp-app");
    await Promise.all([state.client.close(), state.server.close()]);
    state.repository.close();
  });

  it("rejects invalid input and missing write scope", async () => {
    const state = await connect(["qcoder.sessions.read"]);
    const invalid = CallToolResultSchema.parse(
      await state.client.callTool({
        name: "get_qcoder_session",
        arguments: { session_id: "../../escape" },
      }),
    );
    expect(invalid.isError).toBe(true);
    const invalidText = invalid.content.find((item) => item.type === "text");
    expect(invalidText?.type === "text" ? invalidText.text : "").toContain("Input validation");
    const denied = await state.client.callTool({
      name: "start_qcoder_session",
      arguments: {
        workspace_key: "repo",
        role: "builder",
        mission: "test",
        task: "test",
        preview_fingerprint: "0".repeat(64),
        idempotency_key: "integration-test-key-0001",
      },
    });
    expect(denied.isError).toBe(true);
    expect(denied._meta).toHaveProperty("mcp/www_authenticate");
    await Promise.all([state.client.close(), state.server.close()]);
    state.repository.close();
  });
});
