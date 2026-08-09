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

  it("rejects a new stop request for a terminal session", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcoder-terminal-stop-"));
    const repository = new SessionRepository(join(dir, "sessions.sqlite3"));
    const created = repository.createSession({
      subject: "subject-a",
      tenant: "tenant-a",
      workspaceKey: "echo-qcoder",
      role: "builder",
      mission: "test",
      initialTask: "run tests",
      idempotencyKey: "create-session-0003",
      requestFingerprint: "a".repeat(64),
    });
    repository.markTaskRunning(created.session.sessionId, created.task.taskId);
    repository.markTaskFinished(created.session.sessionId, created.task.taskId, 0, "done", false);
    const terminal = repository.getSession(created.session.sessionId, "subject-a", "tenant-a");
    expect(terminal?.status).toBe("completed");
    expect(() =>
      repository.requestStop({
        sessionId: created.session.sessionId,
        subject: "subject-a",
        tenant: "tenant-a",
        expectedRevision: terminal?.revision ?? 0,
        reason: "too late",
        idempotencyKey: "stop-terminal-0001",
        requestFingerprint: "b".repeat(64),
        correlationId: "correlation",
        subjectHash: "c".repeat(64),
      }),
    ).toThrowError(/terminal|completed|no longer/i);
    repository.close();
  });

  it("recovers interrupted work without leaving a false running state", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcoder-recovery-"));
    const repository = new SessionRepository(join(dir, "sessions.sqlite3"));
    const created = repository.createSession({
      subject: "subject-a",
      tenant: "tenant-a",
      workspaceKey: "echo-qcoder",
      role: "builder",
      mission: "test",
      initialTask: "run tests",
      idempotencyKey: "create-session-recovery",
      requestFingerprint: "d".repeat(64),
    });
    repository.markTaskRunning(created.session.sessionId, created.task.taskId);
    expect(repository.recoverInterruptedRuns()).toBe(1);
    const recovered = repository.getSession(created.session.sessionId, "subject-a", "tenant-a");
    expect(recovered?.status).toBe("failed");
    expect(recovered?.activeTaskId).toBeNull();
    expect(repository.listTasks(created.session.sessionId)[0]?.status).toBe("failed");
    repository.close();
  });

  it("enforces the hourly session-start quota per subject and tenant", () => {
    const dir = mkdtempSync(join(tmpdir(), "qcoder-quota-"));
    const repository = new SessionRepository(join(dir, "sessions.sqlite3"));
    for (let index = 0; index < 6; index += 1) {
      repository.createSession({
        subject: "subject-a",
        tenant: "tenant-a",
        workspaceKey: "echo-qcoder",
        role: "builder",
        mission: "test",
        initialTask: "run tests",
        idempotencyKey: `create-session-quota-${index}`,
        requestFingerprint: index.toString().padStart(64, "0"),
      });
    }
    expect(() =>
      repository.createSession({
        subject: "subject-a",
        tenant: "tenant-a",
        workspaceKey: "echo-qcoder",
        role: "builder",
        mission: "test",
        initialTask: "run tests",
        idempotencyKey: "create-session-quota-overflow",
        requestFingerprint: "e".repeat(64),
      }),
    ).toThrowError(/hourly.*start.*limit/i);
    repository.close();
  });
});
