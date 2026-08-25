import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TranscriptStore } from "../src/services/transcriptStore.js";

describe("transcript store", () => {
  it("redacts secrets and returns only a bounded tail", () => {
    const store = new TranscriptStore(mkdtempSync(join(tmpdir(), "qcoder-transcript-")));
    const sessionId = `qcs_${"a".repeat(32)}`;
    store.append(sessionId, "stdout", "line one");
    store.append(sessionId, "stderr", "Authorization: Bearer secret-token");
    store.append(sessionId, "stdout", "line three");
    const tail = store.tail(sessionId, 2);
    expect(tail).toHaveLength(2);
    expect(JSON.stringify(tail)).not.toContain("secret-token");
    expect(tail[1]?.text).toBe("line three");
  });

  it("rejects traversal-shaped session identifiers", () => {
    const store = new TranscriptStore(mkdtempSync(join(tmpdir(), "qcoder-transcript-")));
    expect(() => store.append("../../escape", "stdout", "bad")).toThrow();
  });
});
