import { createHash } from "node:crypto";
import { AppError } from "../errors.js";
import type { AuthPrincipal, TokenVerifier } from "./types.js";

export interface IntrospectionConfig {
  endpoint: URL;
  clientId: string;
  clientSecret: string;
  resource: string;
  issuer: string;
  allowedTenant: string;
  timeoutMs: number;
  allowedClientIds: ReadonlySet<string>;
}

interface IntrospectionPayload {
  active?: boolean;
  sub?: string;
  tenant?: string;
  scope?: string;
  aud?: string | string[];
  iss?: string;
  client_id?: string;
  exp?: number;
  qcoder_roles?: unknown;
  qcoder_workspaces?: unknown;
}

interface CachedPrincipal {
  principal: AuthPrincipal;
  checkedAt: number;
}

function exactAudience(aud: string | string[] | undefined, resource: string): boolean {
  return typeof aud === "string" ? aud === resource : Array.isArray(aud) && aud.includes(resource);
}

function stringSet(value: unknown, label: string): ReadonlySet<string> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 64 ||
    value.some((item) => typeof item !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(item))
  ) {
    throw new AppError("AUTH_INVALID", `The QCoder token has invalid ${label} entitlements.`, 401);
  }
  return new Set(value);
}

export class OAuthIntrospectionVerifier implements TokenVerifier {
  readonly #config: IntrospectionConfig;
  readonly #cache = new Map<string, CachedPrincipal>();

  constructor(config: IntrospectionConfig) {
    if (config.endpoint.protocol !== "https:") {
      throw new AppError("INVALID_INPUT", "OAuth introspection must use HTTPS.");
    }
    if (!config.clientId || !config.clientSecret || !config.resource || !config.allowedTenant) {
      throw new AppError("INVALID_INPUT", "OAuth introspection configuration is incomplete.");
    }
    if (config.allowedClientIds.size === 0) {
      throw new AppError("INVALID_INPUT", "At least one OAuth client ID must be allowlisted.");
    }
    this.#config = config;
  }

  async verify(token: string, requiredScope: string): Promise<AuthPrincipal> {
    if (!token) throw new AppError("AUTH_REQUIRED", "Connect QCoder before using this tool.", 401);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const cached = this.#cache.get(tokenHash);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      cached &&
      Date.now() - cached.checkedAt < 15_000 &&
      cached.principal.expiresAt > nowSeconds + 5
    ) {
      if (!cached.principal.scopes.has(requiredScope)) {
        throw new AppError(
          "SCOPE_REQUIRED",
          "Reconnect QCoder to approve the required permission.",
          403,
        );
      }
      return cached.principal;
    }

    const payload = await this.#introspect(token);
    if (!payload.active || !payload.sub || !payload.exp || payload.exp <= nowSeconds) {
      throw new AppError("AUTH_INVALID", "The QCoder connection is no longer valid.", 401);
    }
    if (payload.iss !== this.#config.issuer || !exactAudience(payload.aud, this.#config.resource)) {
      throw new AppError("AUTH_INVALID", "The QCoder token is not bound to this service.", 401);
    }
    if (payload.tenant !== this.#config.allowedTenant) {
      throw new AppError(
        "TENANT_FORBIDDEN",
        "This QCoder connection belongs to another workspace.",
        403,
      );
    }
    if (!payload.client_id || !this.#config.allowedClientIds.has(payload.client_id)) {
      throw new AppError(
        "AUTH_INVALID",
        "The QCoder token was issued to an unapproved client.",
        401,
      );
    }
    const allowedRoles = stringSet(payload.qcoder_roles, "role");
    const allowedWorkspaces = stringSet(payload.qcoder_workspaces, "workspace");
    const scopes = new Set((payload.scope ?? "").split(/\s+/u).filter(Boolean));
    if (!scopes.has(requiredScope)) {
      throw new AppError(
        "SCOPE_REQUIRED",
        "Reconnect QCoder to approve the required permission.",
        403,
      );
    }
    const principal: AuthPrincipal = {
      subject: payload.sub,
      tenant: payload.tenant,
      clientId: payload.client_id ?? null,
      scopes,
      expiresAt: payload.exp,
      allowedRoles,
      allowedWorkspaces,
    };
    this.#cache.set(tokenHash, { principal, checkedAt: Date.now() });
    if (this.#cache.size > 512) this.#cache.delete(this.#cache.keys().next().value ?? "");
    return principal;
  }

  async #introspect(token: string): Promise<IntrospectionPayload> {
    const body = new URLSearchParams({ token, resource: this.#config.resource });
    const basic = Buffer.from(
      `${this.#config.clientId}:${this.#config.clientSecret}`,
      "utf8",
    ).toString("base64");
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(this.#config.endpoint, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Basic ${basic}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
          signal: AbortSignal.timeout(this.#config.timeoutMs),
        });
        if (!response.ok) {
          if (response.status >= 500 && attempt === 0) continue;
          throw new AppError("AUTH_INVALID", "The QCoder connection could not be validated.", 401);
        }
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new AppError("AUTH_INVALID", "The QCoder authorization response was invalid.", 401);
        }
        return value;
      } catch (error) {
        if (error instanceof AppError) throw error;
        lastError = error;
      }
    }
    void lastError;
    throw new AppError(
      "UNAVAILABLE",
      "QCoder authorization is temporarily unavailable.",
      503,
      true,
    );
  }
}
