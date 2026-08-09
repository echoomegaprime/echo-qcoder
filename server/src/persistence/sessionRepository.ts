import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppError } from "../errors.js";
import type { FleetRole } from "../schemas/tools.js";

export type SessionStatus = "queued" | "running" | "stopping" | "completed" | "failed" | "stopped";
export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface SessionRecord {
  sessionId: string;
  subject: string;
  tenant: string;
  workspaceKey: string;
  role: FleetRole;
  mission: string;
  status: SessionStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  activeTaskId: string | null;
  lastOutcome: string | null;
}

export interface TaskRecord {
  taskId: string;
  sessionId: string;
  taskText: string;
  status: TaskStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  outcome: string | null;
}

export interface CreateSessionInput {
  subject: string;
  tenant: string;
  workspaceKey: string;
  role: string;
  mission: string;
  initialTask: string;
  idempotencyKey: string;
  requestFingerprint: string;
}

export interface CreateSessionResult {
  session: SessionRecord;
  task: TaskRecord;
  duplicate: boolean;
}

export interface EnqueueTaskInput {
  sessionId: string;
  subject: string;
  tenant: string;
  expectedRevision: number;
  taskText: string;
  idempotencyKey: string;
  requestFingerprint: string;
}

export interface EnqueueTaskResult {
  session: SessionRecord;
  task: TaskRecord;
  duplicate: boolean;
}

export interface StopSessionInput {
  sessionId: string;
  subject: string;
  tenant: string;
  expectedRevision: number;
  reason: string;
  idempotencyKey: string;
  requestFingerprint: string;
  correlationId: string;
  subjectHash: string;
}

export interface StopSessionResult {
  session: SessionRecord;
  auditId: string;
  duplicate: boolean;
}

export interface QueueCounts {
  running: number;
  queued: number;
}

interface SessionRow {
  session_id: string;
  subject: string;
  tenant: string;
  workspace_key: string;
  role: FleetRole;
  mission: string;
  status: SessionStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  active_task_id: string | null;
  last_outcome: string | null;
}

interface TaskRow {
  task_id: string;
  session_id: string;
  task_text: string;
  status: TaskStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  outcome: string | null;
}

interface IdempotencyRow {
  request_fingerprint: string;
  session_id: string;
  task_id: string;
}

interface CountRow {
  count: number;
}

function identifier(prefix: "qcs" | "qct" | "qca"): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

function sessionFromRow(row: SessionRow): SessionRecord {
  return {
    sessionId: row.session_id,
    subject: row.subject,
    tenant: row.tenant,
    workspaceKey: row.workspace_key,
    role: row.role,
    mission: row.mission,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeTaskId: row.active_task_id,
    lastOutcome: row.last_outcome,
  };
}

function taskFromRow(row: TaskRow): TaskRecord {
  return {
    taskId: row.task_id,
    sessionId: row.session_id,
    taskText: row.task_text,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    outcome: row.outcome,
  };
}

export class SessionRepository {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.#database = new DatabaseSync(path, { timeout: 10_000 });
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        tenant TEXT NOT NULL,
        workspace_key TEXT NOT NULL,
        role TEXT NOT NULL,
        mission TEXT NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        active_task_id TEXT,
        last_outcome TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_sessions_owner_updated
        ON sessions(subject, tenant, updated_at DESC);
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE RESTRICT,
        task_text TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        outcome TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_tasks_session_created
        ON tasks(session_id, created_at ASC);
      CREATE TABLE IF NOT EXISTS idempotency (
        subject TEXT NOT NULL,
        tenant TEXT NOT NULL,
        action TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(subject, tenant, action, idempotency_key)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS audit_log (
        audit_id TEXT PRIMARY KEY,
        correlation_id TEXT NOT NULL,
        subject_hash TEXT NOT NULL,
        tenant TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_id TEXT,
        outcome TEXT NOT NULL,
        idempotency_hash TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  createSession(input: CreateSessionInput): CreateSessionResult {
    const prior = this.#database
      .prepare(
        `SELECT request_fingerprint, session_id, task_id
         FROM idempotency
         WHERE subject = ? AND tenant = ? AND action = 'start' AND idempotency_key = ?`,
      )
      .get(input.subject, input.tenant, input.idempotencyKey) as IdempotencyRow | undefined;
    if (prior) {
      if (prior.request_fingerprint !== input.requestFingerprint) {
        throw new AppError(
          "CONFLICT",
          "That idempotency key was already used for different QCoder work.",
          409,
        );
      }
      const session = this.#getSessionById(prior.session_id);
      const task = this.#getTaskById(prior.task_id);
      if (!session || !task) {
        throw new AppError(
          "UNAVAILABLE",
          "The prior QCoder operation record is incomplete.",
          503,
          true,
        );
      }
      return { session, task, duplicate: true };
    }

    const sessionId = identifier("qcs");
    const taskId = identifier("qct");
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare(
          `INSERT INTO sessions (
             session_id, subject, tenant, workspace_key, role, mission, status,
             revision, created_at, updated_at, active_task_id, last_outcome
           ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 1, ?, ?, NULL, NULL)`,
        )
        .run(
          sessionId,
          input.subject,
          input.tenant,
          input.workspaceKey,
          input.role,
          input.mission,
          now,
          now,
        );
      this.#database
        .prepare(
          `INSERT INTO tasks (
             task_id, session_id, task_text, status, created_at, started_at, finished_at, outcome
           ) VALUES (?, ?, ?, 'queued', ?, NULL, NULL, NULL)`,
        )
        .run(taskId, sessionId, input.initialTask, now);
      this.#database
        .prepare(
          `INSERT INTO idempotency (
             subject, tenant, action, idempotency_key, request_fingerprint, session_id, task_id, created_at
           ) VALUES (?, ?, 'start', ?, ?, ?, ?, ?)`,
        )
        .run(
          input.subject,
          input.tenant,
          input.idempotencyKey,
          input.requestFingerprint,
          sessionId,
          taskId,
          now,
        );
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
    const session = this.#getSessionById(sessionId);
    const task = this.#getTaskById(taskId);
    if (!session || !task)
      throw new AppError("INTERNAL_ERROR", "QCoder could not persist the session.", 500);
    return { session, task, duplicate: false };
  }

  getSession(sessionId: string, subject: string, tenant: string): SessionRecord | null {
    const row = this.#database
      .prepare("SELECT * FROM sessions WHERE session_id = ? AND subject = ? AND tenant = ?")
      .get(sessionId, subject, tenant) as SessionRow | undefined;
    return row ? sessionFromRow(row) : null;
  }

  listSessions(
    subject: string,
    tenant: string,
    options: { status?: SessionStatus; limit: number; before?: string },
  ): SessionRecord[] {
    const clauses = ["subject = ?", "tenant = ?"];
    const parameters: Array<string | number> = [subject, tenant];
    if (options.status) {
      clauses.push("status = ?");
      parameters.push(options.status);
    }
    if (options.before) {
      clauses.push("updated_at < ?");
      parameters.push(options.before);
    }
    parameters.push(options.limit);
    const rows = this.#database
      .prepare(
        `SELECT * FROM sessions WHERE ${clauses.join(" AND ")}
         ORDER BY updated_at DESC, session_id DESC LIMIT ?`,
      )
      .all(...parameters) as unknown as SessionRow[];
    return rows.map(sessionFromRow);
  }

  listTasks(sessionId: string): TaskRecord[] {
    const rows = this.#database
      .prepare(
        "SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC, task_id ASC LIMIT 50",
      )
      .all(sessionId) as unknown as TaskRow[];
    return rows.map(taskFromRow);
  }

  queuedTaskCount(sessionId: string): number {
    const row = this.#database
      .prepare("SELECT count(*) AS count FROM tasks WHERE session_id = ? AND status = 'queued'")
      .get(sessionId) as unknown as CountRow;
    return row.count;
  }

  queueCounts(): QueueCounts {
    const running = this.#database
      .prepare("SELECT count(*) AS count FROM tasks WHERE status = 'running'")
      .get() as unknown as CountRow;
    const queued = this.#database
      .prepare("SELECT count(*) AS count FROM tasks WHERE status = 'queued'")
      .get() as unknown as CountRow;
    return { running: running.count, queued: queued.count };
  }

  enqueueTask(input: EnqueueTaskInput): EnqueueTaskResult {
    const prior = this.#idempotency(input.subject, input.tenant, "send", input.idempotencyKey);
    if (prior) {
      if (prior.request_fingerprint !== input.requestFingerprint) {
        throw new AppError(
          "CONFLICT",
          "That idempotency key was already used for a different QCoder task.",
          409,
        );
      }
      const session = this.getSession(prior.session_id, input.subject, input.tenant);
      const task = this.#getTaskById(prior.task_id);
      if (!session || !task)
        throw new AppError("UNAVAILABLE", "The prior QCoder task record is incomplete.", 503, true);
      return { session, task, duplicate: true };
    }
    const session = this.getSession(input.sessionId, input.subject, input.tenant);
    if (!session) throw new AppError("NOT_FOUND", "That QCoder session was not found.", 404);
    if (session.revision !== input.expectedRevision) {
      throw new AppError(
        "CONFLICT",
        "The QCoder session changed; refresh it before sending work.",
        409,
      );
    }
    if (["stopping", "completed", "failed", "stopped"].includes(session.status)) {
      throw new AppError("CONFLICT", "That QCoder session no longer accepts tasks.", 409);
    }
    if (this.queuedTaskCount(session.sessionId) >= 20) {
      throw new AppError(
        "RATE_LIMITED",
        "That QCoder session already has the maximum queued tasks.",
        429,
        true,
      );
    }
    const taskId = identifier("qct");
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare(
          `INSERT INTO tasks (
             task_id, session_id, task_text, status, created_at, started_at, finished_at, outcome
           ) VALUES (?, ?, ?, 'queued', ?, NULL, NULL, NULL)`,
        )
        .run(taskId, session.sessionId, input.taskText, now);
      this.#database
        .prepare("UPDATE sessions SET revision = revision + 1, updated_at = ? WHERE session_id = ?")
        .run(now, session.sessionId);
      this.#database
        .prepare(
          `INSERT INTO idempotency (
             subject, tenant, action, idempotency_key, request_fingerprint, session_id, task_id, created_at
           ) VALUES (?, ?, 'send', ?, ?, ?, ?, ?)`,
        )
        .run(
          input.subject,
          input.tenant,
          input.idempotencyKey,
          input.requestFingerprint,
          session.sessionId,
          taskId,
          now,
        );
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
    const updated = this.getSession(session.sessionId, input.subject, input.tenant);
    const task = this.#getTaskById(taskId);
    if (!updated || !task)
      throw new AppError("INTERNAL_ERROR", "QCoder could not persist the task.", 500);
    return { session: updated, task, duplicate: false };
  }

  nextQueuedTask(): { session: SessionRecord; task: TaskRecord } | null {
    const row = this.#database
      .prepare(
        `SELECT t.* FROM tasks t
         JOIN sessions s ON s.session_id = t.session_id
         WHERE t.status = 'queued' AND s.status IN ('queued', 'running')
         ORDER BY t.created_at ASC, t.task_id ASC LIMIT 1`,
      )
      .get() as TaskRow | undefined;
    if (!row) return null;
    const session = this.#getSessionById(row.session_id);
    return session ? { session, task: taskFromRow(row) } : null;
  }

  markTaskRunning(sessionId: string, taskId: string): void {
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const changed = this.#database
        .prepare(
          "UPDATE tasks SET status = 'running', started_at = ? WHERE task_id = ? AND status = 'queued'",
        )
        .run(now, taskId);
      if (changed.changes !== 1)
        throw new AppError("CONFLICT", "The queued QCoder task changed.", 409);
      this.#database
        .prepare(
          `UPDATE sessions
           SET status = 'running', active_task_id = ?, revision = revision + 1, updated_at = ?
           WHERE session_id = ?`,
        )
        .run(taskId, now, sessionId);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  markTaskFinished(
    sessionId: string,
    taskId: string,
    exitCode: number,
    outcome: string,
    stopped: boolean,
  ): void {
    const now = new Date().toISOString();
    const taskStatus: TaskStatus = stopped ? "cancelled" : exitCode === 0 ? "completed" : "failed";
    const more = this.queuedTaskCount(sessionId) > 0;
    const sessionStatus: SessionStatus = stopped
      ? "stopped"
      : more
        ? "queued"
        : exitCode === 0
          ? "completed"
          : "failed";
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare("UPDATE tasks SET status = ?, finished_at = ?, outcome = ? WHERE task_id = ?")
        .run(taskStatus, now, outcome.slice(0, 2_000), taskId);
      this.#database
        .prepare(
          `UPDATE sessions
           SET status = ?, active_task_id = NULL, last_outcome = ?, revision = revision + 1, updated_at = ?
           WHERE session_id = ?`,
        )
        .run(sessionStatus, outcome.slice(0, 2_000), now, sessionId);
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  requestStop(input: StopSessionInput): StopSessionResult {
    const prior = this.#idempotency(input.subject, input.tenant, "stop", input.idempotencyKey);
    if (prior) {
      if (prior.request_fingerprint !== input.requestFingerprint) {
        throw new AppError(
          "CONFLICT",
          "That idempotency key was already used for a different stop request.",
          409,
        );
      }
      const session = this.getSession(prior.session_id, input.subject, input.tenant);
      if (!session)
        throw new AppError("UNAVAILABLE", "The prior stop record is incomplete.", 503, true);
      return { session, auditId: prior.task_id, duplicate: true };
    }
    const session = this.getSession(input.sessionId, input.subject, input.tenant);
    if (!session) throw new AppError("NOT_FOUND", "That QCoder session was not found.", 404);
    if (session.revision !== input.expectedRevision) {
      throw new AppError(
        "CONFLICT",
        "The QCoder session changed; refresh it before stopping.",
        409,
      );
    }
    const auditId = identifier("qca");
    const now = new Date().toISOString();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare(
          "UPDATE tasks SET status = 'cancelled', finished_at = ?, outcome = ? WHERE session_id = ? AND status = 'queued'",
        )
        .run(now, `Cancelled: ${input.reason}`.slice(0, 2_000), session.sessionId);
      this.#database
        .prepare(
          `UPDATE sessions SET status = ?, revision = revision + 1, updated_at = ?, last_outcome = ?
           WHERE session_id = ?`,
        )
        .run(
          session.status === "running" ? "stopping" : "stopped",
          now,
          `Stop requested: ${input.reason}`,
          session.sessionId,
        );
      this.#database
        .prepare(
          `INSERT INTO audit_log (
             audit_id, correlation_id, subject_hash, tenant, action, resource_id,
             outcome, idempotency_hash, created_at
           ) VALUES (?, ?, ?, ?, 'stop', ?, 'accepted', ?, ?)`,
        )
        .run(
          auditId,
          input.correlationId,
          input.subjectHash,
          input.tenant,
          session.sessionId,
          input.requestFingerprint,
          now,
        );
      this.#database
        .prepare(
          `INSERT INTO idempotency (
             subject, tenant, action, idempotency_key, request_fingerprint, session_id, task_id, created_at
           ) VALUES (?, ?, 'stop', ?, ?, ?, ?, ?)`,
        )
        .run(
          input.subject,
          input.tenant,
          input.idempotencyKey,
          input.requestFingerprint,
          session.sessionId,
          auditId,
          now,
        );
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
    const updated = this.getSession(session.sessionId, input.subject, input.tenant);
    if (!updated)
      throw new AppError("INTERNAL_ERROR", "QCoder could not persist the stop request.", 500);
    return { session: updated, auditId, duplicate: false };
  }

  markSessionStopped(sessionId: string): void {
    const now = new Date().toISOString();
    this.#database
      .prepare(
        `UPDATE sessions
         SET status = 'stopped', active_task_id = NULL, revision = revision + 1, updated_at = ?
         WHERE session_id = ? AND status = 'stopping'`,
      )
      .run(now, sessionId);
  }

  close(): void {
    this.#database.close();
  }

  #getSessionById(sessionId: string): SessionRecord | null {
    const row = this.#database
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId) as SessionRow | undefined;
    return row ? sessionFromRow(row) : null;
  }

  #getTaskById(taskId: string): TaskRecord | null {
    const row = this.#database.prepare("SELECT * FROM tasks WHERE task_id = ?").get(taskId) as
      TaskRow | undefined;
    return row ? taskFromRow(row) : null;
  }

  #idempotency(
    subject: string,
    tenant: string,
    action: string,
    key: string,
  ): IdempotencyRow | undefined {
    return this.#database
      .prepare(
        `SELECT request_fingerprint, session_id, task_id FROM idempotency
         WHERE subject = ? AND tenant = ? AND action = ? AND idempotency_key = ?`,
      )
      .get(subject, tenant, action, key) as IdempotencyRow | undefined;
  }
}
