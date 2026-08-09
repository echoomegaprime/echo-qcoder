import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const sessionSchema = z.strictObject({
  session_id: z.string().regex(/^qcs_[a-f0-9]{32}$/u),
  workspace_key: z.string(),
  role: z.string(),
  mission: z.string(),
  status: z.enum(["queued", "running", "stopping", "completed", "failed", "stopped"]),
  revision: z.number().int().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  active_task_id: z.string().nullable(),
  queued_task_count: z.number().int().min(0),
  last_outcome: z.string().nullable(),
});

const taskSchema = z.strictObject({
  task_id: z.string(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  queue_position: z.number().int().min(0),
  outcome: z.string().nullable(),
});

const transcriptSchema = z.strictObject({
  sequence: z.number().int().min(0),
  timestamp: z.string(),
  stream: z.enum(["stdout", "stderr", "system"]),
  text: z.string(),
});

const detailSchema = z.strictObject({
  session: sessionSchema,
  tasks: z.array(taskSchema),
  transcript: z.array(transcriptSchema),
});

export function parseSessionDetail(result: CallToolResult) {
  if (result.isError) throw new Error(toolErrorMessage(result));
  return detailSchema.parse(result.structuredContent);
}

export function toolErrorMessage(result: CallToolResult): string {
  const text = result.content.find((item) => item.type === "text");
  return text?.type === "text" ? text.text : "QCoder returned an unknown error.";
}

export function isAuthenticationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /AUTH_REQUIRED|AUTH_INVALID|SCOPE_REQUIRED|authentication/iu.test(error.message)
  );
}
