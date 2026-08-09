import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionRepository } from "../src/persistence/sessionRepository.js";

describe("session repository", () => {
  it("binds sessions to subject and tenant and hides cross-tenant IDs", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcoder-repo-"));
    const repository = new SessionRepository(join(dir, "sessions.sqlite3"));
    const created = repository.createSession({
      subject: "subject-a",
      tenant: "tenant-a",
      workspaceKey: "echo-qcoder",
      role: "builder",
      mission: "test",
      initialTask: "run tests",
      idempotencyKey: "create-session-0001",
      requestFingerprint: "f".repeat(64),
    });
    expect(repository.getSession(created.session.sessionId, "subject-a", "tenant-a")).toBeTruthy();
    expect(repository.getSession(created.session.sessionId, "subject-b", "tenant-a")).toBeNull();
    expect(repository.getSession(created.session.sessionId, "subject-a", "tenant-b")).toBeNull();
    repository.close();
  });

  it("returns the existing result for exact retries and rejects key reuse", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcoder-idempotency-"));
    const repository = new SessionRepository(join(dir, "sessions.sqlite3"));
    const input = {
      subject: "subject-a",
      tenant: "tenant-a",
      workspaceKey: "echo-qcoder",
      role: "builder",
      mission: "test",
      initialTask: "run tests",
      idempotencyKey: "create-session-0002",
      requestFingerprint: "a".repeat(64),
    };
    const first = repository.createSession(input);
    const second = repository.createSession(input);
    expect(second.duplicate).toBe(true);
    expect(second.session.sessionId).toBe(first.session.sessionId);
    expect(() =>
      repository.createSession({ ...input, requestFingerprint: "b".repeat(64) }),
    ).toThrowError(/idempotency/i);
    repository.close();
  });
});
