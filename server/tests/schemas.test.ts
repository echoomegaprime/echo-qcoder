import { describe, expect, it } from "vitest";
import {
  getSessionInputSchema,
  previewTaskInputSchema,
  sendTaskInputSchema,
  startSessionInputSchema,
  stopSessionInputSchema,
} from "../src/schemas/tools.js";

describe("QCoder tool schemas", () => {
  it("rejects unknown fields and raw workspace paths", () => {
    expect(() =>
      previewTaskInputSchema.parse({
        workspace_key: "C:\\secret",
        role: "builder",
        mission: "verify",
        task: "run tests",
        command: "whoami",
      }),
    ).toThrow();
  });

  it("requires a preview fingerprint and bounded idempotency key to start", () => {
    const parsed = startSessionInputSchema.parse({
      workspace_key: "echo-qcoder",
      role: "cli-build",
      mission: "release verification",
      task: "Run the complete test suite and repair actual failures.",
      preview_fingerprint: "a".repeat(64),
      idempotency_key: "start-20260809-0001",
    });
    expect(parsed.role).toBe("cli-build");
    expect(() => startSessionInputSchema.parse({ ...parsed, idempotency_key: "short" })).toThrow();
  });

  it("rejects guessed session identifiers and oversized transcript reads", () => {
    expect(() =>
      getSessionInputSchema.parse({ session_id: "123", transcript_lines: 201 }),
    ).toThrow();
  });

  it("requires optimistic concurrency for follow-up tasks", () => {
    expect(() =>
      sendTaskInputSchema.parse({
        session_id: `qcs_${"b".repeat(32)}`,
        expected_revision: 0,
        task: "continue",
        idempotency_key: "task-20260809-0001",
      }),
    ).toThrow();
  });

  it("requires the exact destructive confirmation", () => {
    const base = {
      session_id: `qcs_${"c".repeat(32)}`,
      expected_revision: 2,
      reason: "Commander requested cancellation",
      idempotency_key: "stop-20260809-0001",
    };
    expect(() => stopSessionInputSchema.parse({ ...base, confirmation: "yes" })).toThrow();
    expect(
      stopSessionInputSchema.parse({ ...base, confirmation: "STOP_QCODER_SESSION" }),
    ).toBeTruthy();
  });
});
