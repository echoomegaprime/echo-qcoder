import { AppError, toAppError } from "../errors.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  getSessionInputSchema,
  listSessionsInputSchema,
  previewTaskInputSchema,
  renderConsoleInputSchema,
  sendTaskInputSchema,
  startSessionInputSchema,
  stopSessionInputSchema,
} from "../schemas/tools.js";
import type { QCoderSessionService } from "../services/sessionService.js";
import type { TokenVerifier } from "../auth/types.js";
import { QCODER_CONSOLE_URI, toolDefinitions } from "./definitions.js";

export interface HandlerContext {
  bearerToken: string | null;
  verifier: TokenVerifier;
  service: QCoderSessionService;
  protectedResourceMetadataUrl: string;
}

export type ToolResult = CallToolResult;

function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  try {
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    if (Number.isNaN(Date.parse(value))) throw new Error("invalid");
    return value;
  } catch {
    throw new AppError("INVALID_INPUT", "The QCoder session cursor is invalid.", 400);
  }
}

function successful(value: Record<string, unknown>, summary: string): ToolResult {
  return { content: [{ type: "text", text: summary }], structuredContent: value };
}

export async function invokeTool(
  context: HandlerContext,
  name: string,
  rawInput: unknown,
): Promise<ToolResult> {
  const definition = toolDefinitions.find((candidate) => candidate.name === name);
  if (!definition)
    return failure(context, new AppError("NOT_FOUND", "That QCoder tool does not exist.", 404));
  try {
    const scope = definition.securitySchemes[0].scopes[0];
    if (!scope)
      throw new AppError("INTERNAL_ERROR", "The QCoder tool has no authorization scope.", 500);
    const principal = await context.verifier.verify(context.bearerToken ?? "", scope);
    let value: Record<string, unknown>;
    switch (name) {
      case "list_qcoder_sessions": {
        const input = listSessionsInputSchema.parse(rawInput);
        const before = decodeCursor(input.cursor);
        const sessions = context.service.listSessions(principal, {
          limit: input.limit,
          ...(input.status ? { status: input.status } : {}),
          ...(before ? { before } : {}),
        });
        const next = sessions.length === input.limit ? sessions.at(-1)?.updated_at : undefined;
        value = { sessions, next_cursor: next ? Buffer.from(next).toString("base64url") : null };
        break;
      }
      case "get_qcoder_session": {
        const input = getSessionInputSchema.parse(rawInput);
        const detail = context.service.getSession(
          principal,
          input.session_id,
          input.transcript_lines,
        );
        value = {
          session: detail.session,
          tasks: detail.tasks,
          transcript: detail.transcript.map((entry, sequence) => ({
            sequence,
            timestamp: entry.at,
            stream: entry.stream,
            text: entry.text,
          })),
        };
        break;
      }
      case "preview_qcoder_task":
        value = {
          ...context.service.previewTask(principal, previewTaskInputSchema.parse(rawInput)),
        };
        break;
      case "start_qcoder_session":
        value = {
          ...(await context.service.startSession(
            principal,
            startSessionInputSchema.parse(rawInput),
          )),
        };
        break;
      case "send_qcoder_task": {
        const result = await context.service.sendTask(
          principal,
          sendTaskInputSchema.parse(rawInput),
        );
        value = {
          session_id: result.session.session_id,
          session_revision: result.session.revision,
          task: result.task,
          queue_position: result.task.queue_position,
          duplicate: result.duplicate,
        };
        break;
      }
      case "stop_qcoder_session":
        value = {
          ...(await context.service.stopSession(principal, stopSessionInputSchema.parse(rawInput))),
        };
        break;
      case "render_qcoder_console": {
        const input = renderConsoleInputSchema.parse(rawInput);
        const current = context.service.getSession(principal, input.session_id, 0).session;
        if (input.expected_revision !== undefined && input.expected_revision !== current.revision) {
          throw new AppError(
            "CONFLICT",
            "The QCoder session changed; refresh it before rendering.",
            409,
          );
        }
        value = {
          rendered: true,
          session_id: current.session_id,
          resource_uri: QCODER_CONSOLE_URI,
        };
        break;
      }
      default:
        throw new AppError("NOT_FOUND", "That QCoder tool does not exist.", 404);
    }
    const parsed = definition.outputSchema.safeParse(value);
    if (!parsed.success)
      throw new AppError("INTERNAL_ERROR", "QCoder produced an invalid tool result.", 500);
    return successful(parsed.data as Record<string, unknown>, `${definition.title} completed.`);
  } catch (error) {
    return failure(context, error);
  }
}

function failure(context: HandlerContext, error: unknown): ToolResult {
  const normalized = toAppError(error);
  const result: ToolResult = {
    isError: true,
    content: [{ type: "text", text: `${normalized.code}: ${normalized.message}` }],
  };
  if (["AUTH_REQUIRED", "AUTH_INVALID", "SCOPE_REQUIRED"].includes(normalized.code)) {
    result._meta = {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${context.protectedResourceMetadataUrl}", error="invalid_token"`,
      ],
    };
  }
  return result;
}
