import { z } from "zod";

export const fleetRoles = [
  "commander",
  "deputy_commander",
  "architect",
  "innovator",
  "observer",
  "builder",
  "cli-build",
  "publisher",
  "enhancer",
  "researcher",
  "trainer",
  "sentinel",
  "curator",
  "quartermaster",
  "steward",
  "beta",
  "echo-prime",
  "marketing",
  "osint",
  "surveyor",
  "troubleshooter",
  "landman",
  "reverse-engineer",
  "pentester",
  "judge",
  "harbormaster",
  "product-manager",
  "experience-designer",
  "data-engineer",
  "compliance-officer",
] as const;

export const sessionStatuses = [
  "queued",
  "running",
  "stopping",
  "completed",
  "failed",
  "stopped",
] as const;
export const taskStatuses = ["queued", "running", "completed", "failed", "cancelled"] as const;

export const sessionIdSchema = z.string().regex(/^qcs_[a-f0-9]{32}$/u);
export const taskIdSchema = z.string().regex(/^qct_[a-f0-9]{32}$/u);
export const auditIdSchema = z.string().regex(/^qca_[a-f0-9]{32}$/u);
export const workspaceKeySchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._~-]+$/u);
export const fleetRoleSchema = z.enum(fleetRoles);

export const listSessionsInputSchema = z.strictObject({
  status: z.enum(sessionStatuses).optional(),
  cursor: z.string().min(1).max(256).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const getSessionInputSchema = z.strictObject({
  session_id: sessionIdSchema,
  transcript_lines: z.number().int().min(0).max(200).default(80),
});

export const previewTaskInputSchema = z.strictObject({
  workspace_key: workspaceKeySchema,
  role: fleetRoleSchema,
  mission: z.string().trim().min(1).max(240),
  task: z.string().trim().min(1).max(12_000),
});

export const startSessionInputSchema = previewTaskInputSchema.extend({
  preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  idempotency_key: idempotencyKeySchema,
});

export const sendTaskInputSchema = z.strictObject({
  session_id: sessionIdSchema,
  expected_revision: z.number().int().min(1),
  task: z.string().trim().min(1).max(12_000),
  idempotency_key: idempotencyKeySchema,
});

export const stopSessionInputSchema = z.strictObject({
  session_id: sessionIdSchema,
  expected_revision: z.number().int().min(1),
  confirmation: z.literal("STOP_QCODER_SESSION"),
  reason: z.string().trim().min(3).max(240),
  idempotency_key: idempotencyKeySchema,
});

export const renderConsoleInputSchema = z.strictObject({
  session_id: sessionIdSchema,
  expected_revision: z.number().int().min(1).optional(),
});

export const sessionSummarySchema = z.strictObject({
  session_id: sessionIdSchema,
  workspace_key: workspaceKeySchema,
  role: fleetRoleSchema,
  mission: z.string(),
  status: z.enum(sessionStatuses),
  revision: z.number().int().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  active_task_id: taskIdSchema.nullable(),
  queued_task_count: z.number().int().min(0),
  last_outcome: z.string().nullable(),
});

export const taskSummarySchema = z.strictObject({
  task_id: taskIdSchema,
  status: z.enum(taskStatuses),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().nullable(),
  finished_at: z.string().datetime().nullable(),
  queue_position: z.number().int().min(0),
  outcome: z.string().nullable(),
});

export type FleetRole = z.infer<typeof fleetRoleSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type TaskSummary = z.infer<typeof taskSummarySchema>;
