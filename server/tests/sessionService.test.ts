import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AuthPrincipal } from "../src/auth/types.js";
import { SessionRepository } from "../src/persistence/sessionRepository.js";
import { QCoderSessionService } from "../src/services/sessionService.js";
import type { ManagedRun, ManagedTaskRunner, RunResult } from "../src/services/taskRunner.js";
import { TranscriptStore } from "../src/services/transcriptStore.js";
import { WorkspaceRegistry } from "../src/services/workspaceRegistry.js";

class FakeRunner implements ManagedTaskRunner {
  readonly runs: ManagedRun[] = [];
  readonly stopped: string[] = [];

  run(run: ManagedRun): Promise<RunResult> {
    this.runs.push(run);
    return new Promise<RunResult>(() => undefined);
  }

  stop(sessionId: string): Promise<boolean> {
    this.stopped.push(sessionId);
    return Promise.resolve(true);
  }
}

const principal: AuthPrincipal = {
  subject: "echo:commander",
  tenant: "echo-omega-prime",
  clientId: "chatgpt",
  scopes: new Set([
    "qcoder.sessions.read",
    "qcoder.sessions.start",
    "qcoder.sessions.write",
    "qcoder.sessions.stop",
  ]),
  expiresAt: 4_102_444_800,
  allowedRoles: new Set(["builder", "cli-build"]),
  allowedWorkspaces: new Set(["echo-qcoder"]),
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "qcoder-service-"));
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const repository = new SessionRepository(join(root, "sessions.sqlite3"));
  const runner = new FakeRunner();
  const service = new QCoderSessionService({
    repository,
    workspaces: new WorkspaceRegistry({ "echo-qcoder": workspace }),
    transcripts: new TranscriptStore(join(root, "transcripts")),
    runner,
    previewSecret: Buffer.alloc(32, 7),
  });
  return { repository, runner, service };
}

describe("QCoder session service", () => {
  it("requires an untampered preview and dispatches through the governed runner", async () => {
    const { repository, runner, service } = fixture();
    const previewInput = {
      workspace_key: "echo-qcoder",
      role: "cli-build" as const,
      mission: "plugin acceptance",
      task: "Run the verified test ladder.",
    };
    const preview = service.previewTask(principal, previewInput);
    await expect(
      service.startSession(principal, {
        ...previewInput,
        preview_fingerprint: "0".repeat(64),
        idempotency_key: "start-service-test-0001",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const started = await service.startSession(principal, {
      ...previewInput,
      preview_fingerprint: preview.preview_fingerprint,
      idempotency_key: "start-service-test-0002",
    });
    expect(started.session.workspace_key).toBe("echo-qcoder");
    expect(runner.runs).toHaveLength(1);
    expect(runner.runs[0]?.workspacePath).not.toBe(started.session.workspace_key);
    repository.close();
  });

  it("uses revisions for follow-up and stop operations", async () => {
    const { repository, runner, service } = fixture();
    const previewInput = {
      workspace_key: "echo-qcoder",
      role: "builder" as const,
      mission: "build",
      task: "Implement the requested feature.",
    };
    const preview = service.previewTask(principal, previewInput);
    const started = await service.startSession(principal, {
      ...previewInput,
      preview_fingerprint: preview.preview_fingerprint,
      idempotency_key: "start-service-test-0003",
    });
    await expect(
      service.sendTask(principal, {
        session_id: started.session.session_id,
        expected_revision: 99,
        task: "Run tests.",
        idempotency_key: "send-service-test-0001",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const current = service.getSession(principal, started.session.session_id, 0);
    const stopped = await service.stopSession(principal, {
      session_id: current.session.session_id,
      expected_revision: current.session.revision,
      confirmation: "STOP_QCODER_SESSION",
      reason: "acceptance test",
      idempotency_key: "stop-service-test-0001",
    });
    expect(stopped.status).toMatch(/stopping|stopped/u);
    expect(runner.stopped).toContain(started.session.session_id);
    repository.close();
  });

  it("rejects roles and workspaces not granted to the authenticated principal", () => {
    const { repository, service } = fixture();
    expect(() =>
      service.previewTask(
        { ...principal, allowedRoles: new Set(["builder"]) },
        {
          workspace_key: "echo-qcoder",
          role: "commander",
          mission: "escalate",
          task: "edit files",
        },
      ),
    ).toThrowError(/role/i);
    expect(() =>
      service.previewTask(
        { ...principal, allowedWorkspaces: new Set(["other-workspace"]) },
        {
          workspace_key: "echo-qcoder",
          role: "builder",
          mission: "escape",
          task: "edit files",
        },
      ),
    ).toThrowError(/workspace/i);
    repository.close();
  });
});
