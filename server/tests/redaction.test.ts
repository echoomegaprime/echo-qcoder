import { describe, expect, it } from "vitest";
import { redactText, redactUnknown } from "../src/logging.js";

describe("logging redaction", () => {
  it("redacts bearer tokens, API keys, cookies, and secret-like assignments", () => {
    const source =
      "Authorization: Bearer abc.def.ghi OPENAI_API_KEY=sk-secret Cookie: sid=private password=hunter2";
    const output = redactText(source);
    expect(output).not.toContain("abc.def.ghi");
    expect(output).not.toContain("sk-secret");
    expect(output).not.toContain("sid=private");
    expect(output).not.toContain("hunter2");
  });

  it("redacts nested sensitive fields without mutating the input", () => {
    const input = { token: "raw", nested: { authorization: "Bearer raw", safe: "ok" } };
    const output = redactUnknown(input);
    expect(output).toEqual({
      token: "[REDACTED]",
      nested: { authorization: "[REDACTED]", safe: "ok" },
    });
    expect(input.token).toBe("raw");
  });
});
