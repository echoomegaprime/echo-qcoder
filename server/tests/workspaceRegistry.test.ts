import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "../src/services/workspaceRegistry.js";

describe("workspace registry", () => {
  it("resolves only configured keys and never accepts paths as keys", () => {
    const root = mkdtempSync(join(tmpdir(), "qcoder-workspaces-"));
    const workspace = join(root, "repo");
    mkdirSync(workspace);
    const realWorkspace = realpathSync.native(workspace);
    const registry = new WorkspaceRegistry({ "echo-qcoder": workspace });
    expect(registry.resolve("echo-qcoder")).toBe(realWorkspace);
    expect(() => registry.resolve("C:\\ECHO_MCP\\echo-qcoder")).toThrowError(/workspace/i);
    expect(() => registry.resolve("../repo")).toThrowError(/workspace/i);
  });

  it("rejects missing and relative configured paths", () => {
    expect(() => new WorkspaceRegistry({ relative: ".\\repo" })).toThrow();
    expect(
      () => new WorkspaceRegistry({ missing: "C:\\definitely-not-a-qcoder-workspace" }),
    ).toThrow();
  });
});
