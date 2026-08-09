import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OAuthIntrospectionVerifier } from "./auth/introspection.js";
import { StaticPrincipalVerifier } from "./auth/staticVerifier.js";
import type { TokenVerifier } from "./auth/types.js";
import { loadConfig } from "./config.js";
import { createHttpApp } from "./httpApp.js";
import { logger } from "./logging.js";
import { SessionRepository } from "./persistence/sessionRepository.js";
import { QCoderProcessRunner } from "./services/processRunner.js";
import { QCoderSessionService } from "./services/sessionService.js";
import { TranscriptStore } from "./services/transcriptStore.js";
import { WorkspaceRegistry } from "./services/workspaceRegistry.js";
import { createQCoderMcpServer } from "./server.js";

function runtime(stdio: boolean) {
  const config = loadConfig(!stdio);
  mkdirSync(config.dataDirectory, { recursive: true });
  const repository = new SessionRepository(join(config.dataDirectory, "sessions.sqlite3"));
  const runner = new QCoderProcessRunner({
    powershellPath: config.powershellPath,
    launcherPath: config.launcherPath,
    leaseReleaseCommand: "ssh",
  });
  const service = new QCoderSessionService({
    repository,
    workspaces: new WorkspaceRegistry(config.workspaces),
    transcripts: new TranscriptStore(join(config.dataDirectory, "transcripts")),
    runner,
    previewSecret: config.previewSecret,
  });
  service.resume();
  return { config, repository, runner, service };
}

async function main(): Promise<void> {
  const stdio = process.argv.includes("--stdio");
  const state = runtime(stdio);
  let verifier: TokenVerifier;
  if (stdio) {
    if (process.env.QCODER_TRUSTED_STDIO !== "1")
      throw new Error("Trusted stdio mode was not explicitly enabled.");
    verifier = new StaticPrincipalVerifier({
      subject: `local:${process.env.USERNAME ?? "operator"}`,
      tenant: state.config.oauth.tenant,
      clientId: "codex-local-plugin",
      scopes: new Set([
        "qcoder.sessions.read",
        "qcoder.sessions.start",
        "qcoder.sessions.write",
        "qcoder.sessions.stop",
      ]),
      expiresAt: 4_102_444_800,
      allowedRoles: new Set(["*"]),
      allowedWorkspaces: new Set(["*"]),
    });
    await createQCoderMcpServer({
      bearerToken: "local-os-user",
      verifier,
      service: state.service,
      protectedResourceMetadataUrl: state.config.oauth.protectedResourceMetadataUrl,
      webBundlePath: state.config.webBundlePath,
    }).connect(new StdioServerTransport());
    return;
  }
  if (process.env.QCODER_LOCAL_DEV_AUTH === "1") {
    // Local-only smoke/dev. Never enable in production or public edge.
    if (
      process.env.NODE_ENV === "production" &&
      process.env.QCODER_ALLOW_LOCAL_AUTH_IN_PROD !== "1"
    ) {
      throw new Error("QCODER_LOCAL_DEV_AUTH is not allowed in production.");
    }
    verifier = new StaticPrincipalVerifier({
      subject: `local-dev:${process.env.USERNAME ?? "operator"}`,
      tenant: state.config.oauth.tenant,
      clientId: "qcoder-local-dev",
      scopes: new Set([
        "qcoder.sessions.read",
        "qcoder.sessions.start",
        "qcoder.sessions.write",
        "qcoder.sessions.stop",
      ]),
      expiresAt: 4_102_444_800,
      allowedRoles: new Set(["*"]),
      allowedWorkspaces: new Set(["*"]),
    });
  } else {
    verifier = new OAuthIntrospectionVerifier({
      endpoint: state.config.oauth.introspectionEndpoint,
      clientId: state.config.oauth.clientId,
      clientSecret: state.config.oauth.clientSecret,
      resource: state.config.oauth.resource,
      issuer: state.config.oauth.issuer,
      allowedTenant: state.config.oauth.tenant,
      timeoutMs: 5_000,
      allowedClientIds: state.config.oauth.allowedClientIds,
    });
  }
  const app = createHttpApp({
    host: state.config.host,
    verifier,
    service: state.service,
    protectedResourceMetadataUrl: state.config.oauth.protectedResourceMetadataUrl,
    authorizationServer: state.config.oauth.issuer,
    resource: state.config.oauth.resource,
    webBundlePath: state.config.webBundlePath,
  });
  const server = app.listen(state.config.port, state.config.host, () =>
    logger.info("qcoder_mcp_started", { host: state.config.host, port: state.config.port }),
  );
  const shutdown = (): void => {
    server.close(() => {
      void state.runner.stopAll().finally(() => {
        state.repository.close();
        process.exit(0);
      });
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  logger.error("qcoder_mcp_start_failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  process.exitCode = 1;
});
