import { describe, expect, it } from "vitest";
import { QCODER_CONSOLE_URI, toolDefinitions } from "../src/tools/definitions.js";

describe("tool metadata", () => {
  it("declares seven unique focused tools with strict safety metadata", () => {
    expect(toolDefinitions).toHaveLength(7);
    expect(new Set(toolDefinitions.map((tool) => tool.name)).size).toBe(7);
    for (const tool of toolDefinitions) {
      expect(tool.description.startsWith("Use this when")).toBe(true);
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.outputSchema).toBeTruthy();
      expect(tool.annotations.readOnlyHint).toBeTypeOf("boolean");
      expect(tool.annotations.destructiveHint).toBeTypeOf("boolean");
      expect(tool.annotations.openWorldHint).toBeTypeOf("boolean");
      expect(tool.annotations.idempotentHint).toBeTypeOf("boolean");
      expect(tool.securitySchemes[0]?.type).toBe("oauth2");
      expect(Array.isArray(tool.securitySchemes[0]?.scopes)).toBe(true);
      expect(tool.securitySchemes[0]?.scopes.length).toBeGreaterThan(0);
    }
  });

  it("attaches the UI resource only to the render tool", () => {
    const withUi = toolDefinitions.filter((tool) => tool.resourceUri);
    expect(withUi).toHaveLength(1);
    expect(withUi[0]?.name).toBe("render_qcoder_console");
    expect(withUi[0]?.resourceUri).toBe(QCODER_CONSOLE_URI);
  });

  it("labels actual side effects accurately", () => {
    const start = toolDefinitions.find((tool) => tool.name === "start_qcoder_session");
    const stop = toolDefinitions.find((tool) => tool.name === "stop_qcoder_session");
    expect(start?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
    expect(stop?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
  });
});
