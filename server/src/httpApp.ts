import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Request, Response, NextFunction } from "express";
import type { QCoderSessionService } from "./services/sessionService.js";
import type { TokenVerifier } from "./auth/types.js";
import { createQCoderMcpServer } from "./server.js";
import { logger } from "./logging.js";

export interface HttpAppDependencies {
  host: string;
  verifier: TokenVerifier;
  service: QCoderSessionService;
  protectedResourceMetadataUrl: string;
  authorizationServer: string;
  resource: string;
  webBundlePath: string;
}

function bearerToken(request: Request): string | null {
  const authorization = request.header("authorization");
  const match = /^Bearer ([^\s]+)$/u.exec(authorization ?? "");
  return match?.[1] ?? null;
}

export function createHttpApp(dependencies: HttpAppDependencies) {
  const app = createMcpExpressApp({ host: dependencies.host });
  app.set("trust proxy", false);
  const windows = new Map<string, { started: number; count: number }>();
  app.use((request: Request, response: Response, next: NextFunction) => {
    const correlationId = request.header("x-correlation-id") ?? randomUUID();
    response.setHeader("x-correlation-id", correlationId);
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("cache-control", "no-store");
    const contentLength = Number(request.header("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 256 * 1024) {
      response.status(413).json({ error: "request_too_large", correlation_id: correlationId });
      return;
    }
    const key = createRateLimitKey(request);
    const current = windows.get(key);
    const now = Date.now();
    const window =
      !current || now - current.started >= 60_000 ? { started: now, count: 0 } : current;
    window.count += 1;
    windows.set(key, window);
    if (windows.size > 1_024) windows.delete(windows.keys().next().value ?? "");
    if (window.count > 120) {
      response.status(429).json({ error: "rate_limited", correlation_id: correlationId });
      return;
    }
    next();
  });

  app.get("/healthz", (_request, response) => response.json({ status: "ok" }));
  app.get("/readyz", (_request, response) => {
    const ready = existsSync(dependencies.webBundlePath);
    response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });
  app.get("/version", (_request, response) =>
    response.json({ name: "echo-qcoder-console", version: "0.2.0", protocol: "streamable-http" }),
  );
  app.get("/.well-known/oauth-protected-resource/oauth-mcp-qcoder-v1", (_request, response) =>
    response.json({
      resource: dependencies.resource,
      authorization_servers: [dependencies.authorizationServer],
      scopes_supported: [
        "qcoder.sessions.read",
        "qcoder.sessions.start",
        "qcoder.sessions.write",
        "qcoder.sessions.stop",
      ],
      bearer_methods_supported: ["header"],
    }),
  );

  app.all("/mcp", async (request: Request, response: Response) => {
    const server = createQCoderMcpServer({
      bearerToken: bearerToken(request),
      verifier: dependencies.verifier,
      service: dependencies.service,
      protectedResourceMetadataUrl: dependencies.protectedResourceMetadataUrl,
      webBundlePath: dependencies.webBundlePath,
    });
    const transport = new StreamableHTTPServerTransport();
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      // SDK 1.30.0's Node wrapper uses optional accessors that conflict with
      // exactOptionalPropertyTypes even though it implements Transport at runtime.
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      logger.error("mcp_request_failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });
  return app;
}

function createRateLimitKey(request: Request): string {
  return `ip:${createHash("sha256")
    .update(request.ip ?? "unknown")
    .digest("hex")
    .slice(0, 16)}`;
}
