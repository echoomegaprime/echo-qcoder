import { z } from "zod";
import {
  getSessionInputSchema,
  listSessionsInputSchema,
  previewTaskInputSchema,
  renderConsoleInputSchema,
  sendTaskInputSchema,
  sessionIdSchema,
  sessionSummarySchema,
  startSessionInputSchema,
  stopSessionInputSchema,
  taskSummarySchema,
} from "../schemas/tools.js";

export const QCODER_CONSOLE_URI = "ui://qcoder/console/v1";

const transcriptLineSchema = z.strictObject({
  sequence: z.number().int().min(0),
  timestamp: z.string().datetime(),
  stream: z.enum(["stdout", "stderr", "system"]),
  text: z.string().max(2_000),
});

const policyDecisionSchema = z.strictObject({
  rule: z.string(),
  accepted: z.boolean(),
  message: z.string(),
});

const outputSchemas = {
  list: z.strictObject({
    sessions: z.array(sessionSummarySchema).max(50),
    next_cursor: z.string().nullable(),
  }),
  get: z.strictObject({
    session: sessionSummarySchema,
    transcript: z.array(transcriptLineSchema).max(200),
    tasks: z.array(taskSummarySchema).max(50),
  }),
  preview: z.strictObject({
    accepted: z.boolean(),
    normalized: z.strictObject({
      workspace_key: z.string(),
      role: z.string(),
      mission: z.string(),
      task_hash: z.string().regex(/^[a-f0-9]{64}$/u),
    }),
    queue: z.strictObject({ running: z.number().int().min(0), queued: z.number().int().min(0) }),
    policy: z.array(policyDecisionSchema),
    preview_fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
  start: z.strictObject({
    session: sessionSummarySchema,
    task: taskSummarySchema,
    duplicate: z.boolean(),
  }),
  send: z.strictObject({
    session_id: sessionIdSchema,
    session_revision: z.number().int().min(1),
    task: taskSummarySchema,
    queue_position: z.number().int().min(0),
    duplicate: z.boolean(),
  }),
  stop: z.strictObject({
    session_id: sessionIdSchema,
    status: z.enum(["stopping", "stopped"]),
    session_revision: z.number().int().min(1),
    audit_id: z.string().regex(/^qca_[a-f0-9]{32}$/u),
    duplicate: z.boolean(),
  }),
  render: z.strictObject({
    rendered: z.literal(true),
    session_id: sessionIdSchema,
    resource_uri: z.literal(QCODER_CONSOLE_URI),
  }),
};

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
    idempotentHint: boolean;
  };
  securitySchemes: readonly [{ type: "oauth2"; scopes: readonly string[] }];
  resourceUri?: string;
}

function security(...scopes: string[]): ToolDefinition["securitySchemes"] {
  return [{ type: "oauth2", scopes }];
}

export const toolDefinitions: readonly ToolDefinition[] = [
  {
    name: "list_qcoder_sessions",
    title: "List QCoder sessions",
    description:
      "Use this when the user wants to see their governed QCoder sessions or determine what the local builder is doing. Do not use it to inspect another user, arbitrary host processes, or raw logs.",
    inputSchema: listSessionsInputSchema,
    outputSchema: outputSchemas.list,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    securitySchemes: security("qcoder.sessions.read"),
  },
  {
    name: "get_qcoder_session",
    title: "Get QCoder session",
    description:
      "Use this when the user needs the current state, bounded transcript tail, or queued tasks for one known QCoder session. Do not use it with guessed IDs or as a raw log download.",
    inputSchema: getSessionInputSchema,
    outputSchema: outputSchemas.get,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    securitySchemes: security("qcoder.sessions.read"),
  },
  {
    name: "preview_qcoder_task",
    title: "Preview QCoder task",
    description:
      "Use this when the user wants to validate a governed QCoder task before starting it. Do not use it to execute work or to validate arbitrary commands or paths.",
    inputSchema: previewTaskInputSchema,
    outputSchema: outputSchemas.preview,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    securitySchemes: security("qcoder.sessions.read"),
  },
  {
    name: "start_qcoder_session",
    title: "Start QCoder session",
    description:
      "Use this when the user has approved a validated task and wants a new governed QCoder builder session. Do not use it for arbitrary shell commands, unregistered workspaces, or unrequested background work.",
    inputSchema: startSessionInputSchema,
    outputSchema: outputSchemas.start,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: true,
    },
    securitySchemes: security("qcoder.sessions.start"),
  },
  {
    name: "send_qcoder_task",
    title: "Send QCoder task",
    description:
      "Use this when the user wants an existing owned QCoder session to perform one follow-up task. Do not use it to create a new workspace session, change workspace or role, or send arbitrary terminal input.",
    inputSchema: sendTaskInputSchema,
    outputSchema: outputSchemas.send,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: true,
    },
    securitySchemes: security("qcoder.sessions.write"),
  },
  {
    name: "stop_qcoder_session",
    title: "Stop QCoder session",
    description:
      "Use this when the user explicitly wants to cancel one governed QCoder session. Do not use it to stop arbitrary processes, services, GPUs, another user's session, or completed sessions as a cleanup shortcut.",
    inputSchema: stopSessionInputSchema,
    outputSchema: outputSchemas.stop,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: true,
    },
    securitySchemes: security("qcoder.sessions.stop"),
  },
  {
    name: "render_qcoder_console",
    title: "Render QCoder console",
    description:
      "Use this when the user wants an interactive visual console after current QCoder session data has been retrieved. Do not use it as a substitute for fetching state or for an unreadable session.",
    inputSchema: renderConsoleInputSchema,
    outputSchema: outputSchemas.render,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    securitySchemes: security("qcoder.sessions.read"),
    resourceUri: QCODER_CONSOLE_URI,
  },
] as const;
