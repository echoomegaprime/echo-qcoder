import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthIntrospectionVerifier } from "../src/auth/introspection.js";

const endpoint = new URL("https://auth.example.test/oauth/introspect");

afterEach(() => vi.restoreAllMocks());

describe("opaque OAuth introspection", () => {
  it("accepts only active tokens with exact resource and required scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              active: true,
              sub: "echo:family-1",
              tenant: "echo-omega-prime",
              scope: "qcoder.sessions.read qcoder.sessions.start",
              aud: "urn:echo:qcoder",
              iss: "https://auth.example.test",
              exp: Math.floor(Date.now() / 1000) + 300,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );
    const verifier = new OAuthIntrospectionVerifier({
      endpoint,
      clientId: "qcoder-resource",
      clientSecret: "not-logged",
      resource: "urn:echo:qcoder",
      issuer: "https://auth.example.test",
      allowedTenant: "echo-omega-prime",
      timeoutMs: 1000,
    });
    const principal = await verifier.verify("opaque-token", "qcoder.sessions.read");
    expect(principal.subject).toBe("echo:family-1");
    expect(principal.scopes.has("qcoder.sessions.start")).toBe(true);
  });

  it.each([
    [{ active: false }, "AUTH_INVALID"],
    [
      {
        active: true,
        sub: "s",
        tenant: "other",
        scope: "qcoder.sessions.read",
        aud: "urn:echo:qcoder",
        iss: "https://auth.example.test",
        exp: 4102444800,
      },
      "TENANT_FORBIDDEN",
    ],
    [
      {
        active: true,
        sub: "s",
        tenant: "echo-omega-prime",
        scope: "echo.read",
        aud: "urn:echo:qcoder",
        iss: "https://auth.example.test",
        exp: 4102444800,
      },
      "SCOPE_REQUIRED",
    ],
    [
      {
        active: true,
        sub: "s",
        tenant: "echo-omega-prime",
        scope: "qcoder.sessions.read",
        aud: "urn:wrong",
        iss: "https://auth.example.test",
        exp: 4102444800,
      },
      "AUTH_INVALID",
    ],
  ])("fails closed for invalid introspection %#", async (payload, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))),
    );
    const verifier = new OAuthIntrospectionVerifier({
      endpoint,
      clientId: "id",
      clientSecret: "secret",
      resource: "urn:echo:qcoder",
      issuer: "https://auth.example.test",
      allowedTenant: "echo-omega-prime",
      timeoutMs: 1000,
    });
    await expect(verifier.verify("opaque", "qcoder.sessions.read")).rejects.toMatchObject({ code });
  });
});
