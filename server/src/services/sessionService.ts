import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuthPrincipal } from "../auth/types.js";
import { AppError } from "../errors.js";
import type {
  SessionRecord,
  SessionRepository,
  SessionStatus,
  TaskRecord,
} from "../persistence/sessionRepository.js";
import type { FleetRole, SessionSummary, TaskSummary } from "../schemas/tools.js";
import type { ManagedTaskRunner } from "./taskRunner.js";
import {
  redactTranscriptText,
  type TranscriptEntry,
  type TranscriptStore,
} from "./transcriptStore.js";
import type { WorkspaceRegistry } from "./workspaceRegistry.js";

interface PreviewInput {
  workspace_key: string;
  role: FleetRole;
  mission: string;
  task: string;
}

interface StartInput extends PreviewInput {
  preview_fingerprint: string;
  idempotency_key: string;
}

interface SendInput {
  session_id: string;
  expected_revision: number;
  task: string;
  idempotency_key: string;
}

interface StopInput {
  session_id: string;
  expected_revision: number;
  confirmation: "STOP_QCODER_SESSION";
  reason: string;
  idempotency_key: string;
}

interface ServiceDependencies {
  repository: SessionRepository;
  workspaces: WorkspaceRegistry;
  transcripts: TranscriptStore;
  runner: ManagedTaskRunner;
  previewSecret: Buffer;
}

export interface PreviewResult {
  accepted: true;
  preview_fingerprint: string;
  normalized: {
    workspace_key: string;
    role: FleetRole;
    mission: string;
    task_hash: string;
  };
  queue: { running: number; queued: number };
  policy: Array<{ rule: string; accepted: boolean; message: string }>;
}

export interface SessionDetail {
  session: SessionSummary;
  tasks: TaskSummary[];
  transcript: TranscriptEntry[];
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function subjectHash(subject: string): string {
  return createHash("sha256").update(subject).digest("hex");
}

function previewPayload(input: PreviewInput, subject: string, tenant: string): string {
  return JSON.stringify({ ...input, subject, tenant });
}

export class QCoderSessionService {
  readonly #repository: SessionRepository;
  readonly #workspaces: WorkspaceRegistry;
  readonly #transcripts: TranscriptStore;
  readonly #runner: ManagedTaskRunner;
  readonly #previewSecret: Buffer;
  #dispatching = false;

  constructor(dependencies: ServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#workspaces = dependencies.workspaces;
    this.#transcripts = dependencies.transcripts;
    this.#runner = dependencies.runner;
    this.#previewSecret = dependencies.previewSecret;
  }

  resume(): void {
    this.#repository.recoverInterruptedRuns();
    this.#dispatch();
  }

  previewTask(principal: AuthPrincipal, input: PreviewInput): PreviewResult {
    this.#authorizeTarget(principal, input.workspace_key, input.role);
    this.#workspaces.resolve(input.workspace_key);
    const fingerprint = createHmac("sha256", this.#previewSecret)
      .update(
        JSON.stringify({
          payload: previewPayload(input, principal.subject, principal.tenant),
          client_id: principal.clientId,
          roles: [...principal.allowedRoles].sort(),
          workspaces: [...principal.allowedWorkspaces].sort(),
          authorization_expires_at: principal.expiresAt,
          policy_revision: 2,
        }),
      )
      .digest("hex");
    return {
      accepted: true,
      preview_fingerprint: fingerprint,
      normalized: {
        workspace_key: input.workspace_key,
        role: input.role,
        mission: input.mission,
        task_hash: digest(input.task),
      },
      queue: this.#repository.queueCounts(),
      policy: [
        {
          rule: "workspace_allowlist",
          accepted: true,
          message: "The workspace key is registered.",
        },
        {
          rule: "governed_launcher",
          accepted: true,
          message: "The task will run through qcoder.ps1 and SOL.",
        },
        {
          rule: "no_raw_shell",
          accepted: true,
          message: "No arbitrary shell or path parameter is exposed.",
        },
        {
          rule: "gpu_lease",
          accepted: true,
          message: "The dual-GPU lease and restoration gate are mandatory.",
        },
      ],
    };
  }

  async startSession(
    principal: AuthPrincipal,
    input: StartInput,
  ): Promise<{ session: SessionSummary; task: TaskSummary; duplicate: boolean }> {
    // Establish the asynchronous tool boundary before persistence can reject.
    await Promise.resolve();
    const expected = this.previewTask(principal, {
      workspace_key: input.workspace_key,
      role: input.role,
      mission: input.mission,
      task: input.task,
    }).preview_fingerprint;
    const supplied = Buffer.from(input.preview_fingerprint, "hex");
    const calculated = Buffer.from(expected, "hex");
    if (supplied.length !== calculated.length || !timingSafeEqual(supplied, calculated)) {
      throw new AppError(
        "CONFLICT",
        "The QCoder preview changed or was tampered with; preview again.",
        409,
      );
    }
    const created = this.#repository.createSession({
      subject: principal.subject,
      tenant: principal.tenant,
      workspaceKey: input.workspace_key,
      role: input.role,
      mission: input.mission,
      initialTask: input.task,
      idempotencyKey: input.idempotency_key,
      requestFingerprint: digest(input),
    });
    this.#dispatch();
    return {
      session: this.#sessionSummary(created.session),
      task: this.#taskSummary(
        created.task,
        created.duplicate ? 0 : this.#repository.queueCounts().queued,
      ),
      duplicate: created.duplicate,
    };
  }

  listSessions(
    principal: AuthPrincipal,
    options: { status?: SessionStatus; limit: number; before?: string },
  ): SessionSummary[] {
    return this.#repository
      .listSessions(principal.subject, principal.tenant, options)
      .map((session) => this.#sessionSummary(session));
  }

  getSession(principal: AuthPrincipal, sessionId: string, transcriptLines: number): SessionDetail {
    const session = this.#ownedSession(principal, sessionId);
    return {
      session: this.#sessionSummary(session),
      tasks: this.#repository.listTasks(sessionId).map((task) => this.#taskSummary(task, 0)),
      transcript: this.#transcripts.tail(sessionId, transcriptLines),
    };
  }

  async sendTask(
    principal: AuthPrincipal,
    input: SendInput,
  ): Promise<{ session: SessionSummary; task: TaskSummary; duplicate: boolean }> {
    // Establish the asynchronous tool boundary before persistence can reject.
    await Promise.resolve();
    const owned = this.#ownedSession(principal, input.session_id);
    this.#authorizeTarget(principal, owned.workspaceKey, owned.role);
    const result = this.#repository.enqueueTask({
      sessionId: input.session_id,
      subject: principal.subject,
      tenant: principal.tenant,
      expectedRevision: input.expected_revision,
      taskText: input.task,
      idempotencyKey: input.idempotency_key,
      requestFingerprint: digest(input),
    });
    this.#dispatch();
    return {
      session: this.#sessionSummary(result.session),
      task: this.#taskSummary(result.task, this.#repository.queueCounts().queued),
      duplicate: result.duplicate,
    };
  }

  async stopSession(
    principal: AuthPrincipal,
    input: StopInput,
  ): Promise<{
    session_id: string;
    status: "stopping" | "stopped";
    session_revision: number;
    audit_id: string;
    duplicate: boolean;
  }> {
    const stopped = this.#repository.requestStop({
      sessionId: input.session_id,
      subject: principal.subject,
      tenant: principal.tenant,
      expectedRevision: input.expected_revision,
      reason: input.reason,
      idempotencyKey: input.idempotency_key,
      requestFingerprint: digest(input),
      correlationId: randomUUID(),
      subjectHash: subjectHash(principal.subject),
    });
    this.#appendTranscript(input.session_id, "system", `Stop requested: ${input.reason}`);
    if (stopped.session.status === "stopping") {
      if (!(await this.#runner.stop(input.session_id))) {
        throw new AppError(
          "UNAVAILABLE",
          "QCoder process termination is not yet verified.",
          503,
          true,
        );
      }
      this.#repository.markSessionStopped(input.session_id);
    }
    const current = this.#sessionSummary(this.#ownedSession(principal, input.session_id));
    if (current.status !== "stopping" && current.status !== "stopped") {
      throw new AppError("INTERNAL_ERROR", "QCoder could not confirm the stop state.", 500);
    }
    return {
      session_id: current.session_id,
      status: current.status,
      session_revision: current.revision,
      audit_id: stopped.auditId,
      duplicate: stopped.duplicate,
    };
  }

  #ownedSession(principal: AuthPrincipal, sessionId: string): SessionRecord {
    const session = this.#repository.getSession(sessionId, principal.subject, principal.tenant);
    if (!session) throw new AppError("NOT_FOUND", "That QCoder session was not found.", 404);
    return session;
  }

  #authorizeTarget(principal: AuthPrincipal, workspaceKey: string, role: FleetRole): void {
    if (!principal.allowedWorkspaces.has("*") && !principal.allowedWorkspaces.has(workspaceKey)) {
      throw new AppError(
        "WORKSPACE_FORBIDDEN",
        "This connection is not entitled to that workspace.",
        403,
      );
    }
    if (!principal.allowedRoles.has("*") && !principal.allowedRoles.has(role)) {
      throw new AppError(
        "ROLE_FORBIDDEN",
        "This connection is not entitled to that fleet role.",
        403,
      );
    }
  }

  #appendTranscript(sessionId: string, stream: TranscriptEntry["stream"], text: string): void {
    try {
      this.#transcripts.append(sessionId, stream, text);
    } catch {
      // Evidence retention must never prevent process termination or state recovery.
    }
  }

  #sessionSummary(session: SessionRecord): SessionSummary {
    return {
      session_id: session.sessionId,
      workspace_key: session.workspaceKey,
      role: session.role,
      mission: session.mission,
      status: session.status,
      revision: session.revision,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      active_task_id: session.activeTaskId,
      queued_task_count: this.#repository.queuedTaskCount(session.sessionId),
      last_outcome: session.lastOutcome,
    };
  }

  #taskSummary(task: TaskRecord, queuePosition: number): TaskSummary {
    return {
      task_id: task.taskId,
      status: task.status,
      created_at: task.createdAt,
      started_at: task.startedAt,
      finished_at: task.finishedAt,
      queue_position: task.status === "queued" ? queuePosition : 0,
      outcome: task.outcome,
    };
  }

  #dispatch(): void {
    if (this.#dispatching) return;
    const next = this.#repository.nextQueuedTask();
    if (!next) return;
    this.#dispatching = true;
    this.#repository.markTaskRunning(next.session.sessionId, next.task.taskId);
    this.#appendTranscript(next.session.sessionId, "system", `Task ${next.task.taskId} started.`);
    const workspacePath = this.#workspaces.resolve(next.session.workspaceKey);
    void this.#runner
      .run({
        sessionId: next.session.sessionId,
        taskId: next.task.taskId,
        workspacePath,
        role: next.session.role,
        mission: next.session.mission,
        task: next.task.taskText,
        onOutput: (stream, text) => this.#appendTranscript(next.session.sessionId, stream, text),
      })
      .then((result) => {
        this.#repository.markTaskFinished(
          next.session.sessionId,
          next.task.taskId,
          result.exitCode,
          result.outcome,
          result.stopped,
        );
      })
      .catch((error: unknown) => {
        const message = redactTranscriptText(
          error instanceof Error ? error.message : "QCoder launch failed.",
        );
        this.#appendTranscript(next.session.sessionId, "stderr", message);
        this.#repository.markTaskFinished(
          next.session.sessionId,
          next.task.taskId,
          1,
          message,
          false,
        );
      })
      .finally(() => {
        this.#dispatching = false;
        this.#dispatch();
      });
  }
}
