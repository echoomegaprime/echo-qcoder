import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AppError } from "./errors.js";

export interface ServerConfig {
  host: string;
  port: number;
  dataDirectory: string;
  webBundlePath: string;
  workspaces: Record<string, string>;
  powershellPath: string;
  launcherPath: string;
  oauth: {
    introspectionEndpoint: URL;
    clientId: string;
    clientSecret: string;
    resource: string;
    issuer: string;
    tenant: string;
    protectedResourceMetadataUrl: string;
    allowedClientIds: ReadonlySet<string>;
  };
  previewSecret: Buffer;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new AppError("INVALID_INPUT", `Required environment variable ${name} is missing.`);
  return value;
}

function loadOrCreateSecret(path: string): Buffer {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path))
    writeFileSync(path, randomBytes(32).toString("hex"), { encoding: "utf8", mode: 0o600 });
  const value = readFileSync(path, "utf8").trim();
  if (!/^[a-f0-9]{64}$/u.test(value))
    throw new AppError("INVALID_INPUT", "The preview secret file is invalid.");
  return Buffer.from(value, "hex");
}

function parseWorkspaces(raw: string): Record<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AppError("INVALID_INPUT", "QCODER_WORKSPACES_JSON must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("INVALID_INPUT", "QCODER_WORKSPACES_JSON must be an object.");
  }
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.some(([, path]) => typeof path !== "string")) {
    throw new AppError("INVALID_INPUT", "QCODER_WORKSPACES_JSON must map keys to paths.");
  }
  return Object.fromEntries(entries);
}

export function loadConfig(requireOAuthCredentials = true): ServerConfig {
  if (process.env.QCODER_LOCAL_DEV_AUTH === "1") requireOAuthCredentials = false;
  const repositoryRoot = resolve(import.meta.dirname, "..", "..");
  const dataDirectory = resolve(process.env.QCODER_DATA_DIR ?? resolve(repositoryRoot, ".runtime"));
  const port = Number(process.env.PORT ?? "8788");
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new AppError("INVALID_INPUT", "PORT is invalid.");
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port,
    dataDirectory,
    webBundlePath: resolve(
      process.env.QCODER_WEB_BUNDLE ?? resolve(repositoryRoot, "web", "dist", "index.html"),
    ),
    workspaces: parseWorkspaces(
      process.env.QCODER_WORKSPACES_JSON ?? JSON.stringify({ "echo-qcoder": repositoryRoot }),
    ),
    powershellPath: process.env.QCODER_PWSH_PATH ?? "pwsh",
    launcherPath: resolve(
      process.env.QCODER_LAUNCHER_PATH ?? resolve(repositoryRoot, "launcher", "qcoder.ps1"),
    ),
    oauth: {
      introspectionEndpoint: new URL(
        requireOAuthCredentials
          ? required("QCODER_OAUTH_INTROSPECTION_URL")
          : (process.env.QCODER_OAUTH_INTROSPECTION_URL ??
              "https://mcp.echo-op.com/oauth/introspect"),
      ),
      clientId: requireOAuthCredentials
        ? required("QCODER_OAUTH_CLIENT_ID")
        : (process.env.QCODER_OAUTH_CLIENT_ID ?? ""),
      clientSecret: requireOAuthCredentials
        ? required("QCODER_OAUTH_CLIENT_SECRET")
        : (process.env.QCODER_OAUTH_CLIENT_SECRET ?? ""),
      resource: process.env.QCODER_OAUTH_RESOURCE ?? "https://mcp.echo-op.com/oauth-mcp-qcoder-v1",
      issuer: process.env.QCODER_OAUTH_ISSUER ?? "https://mcp.echo-op.com",
      tenant: process.env.QCODER_OAUTH_TENANT ?? "echo-omega-prime",
      protectedResourceMetadataUrl:
        process.env.QCODER_OAUTH_METADATA_URL ??
        "https://mcp.echo-op.com/.well-known/oauth-protected-resource/oauth-mcp-qcoder-v1",
      allowedClientIds: new Set(
        (requireOAuthCredentials
          ? required("QCODER_OAUTH_ALLOWED_CLIENT_IDS")
          : (process.env.QCODER_OAUTH_ALLOWED_CLIENT_IDS ?? "qcoder-local-dev,codex-local-plugin")
        )
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    },
    previewSecret: loadOrCreateSecret(resolve(dataDirectory, "preview-secret")),
  };
}
