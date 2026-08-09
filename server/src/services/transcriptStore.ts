import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../errors.js";

const SESSION_ID = /^qcs_[a-f0-9]{32}$/u;
const MAX_ENTRY_TEXT = 2_000;
const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;

export interface TranscriptEntry {
  at: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

export function redactTranscriptText(value: string): string {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s"']+/giu, "$1[REDACTED]")
    .replace(/([?&](?:api[_-]?key|access_token|token)=)[^&\s]+/giu, "$1[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,})\b/gu, "[REDACTED]");
}

export class TranscriptStore {
  readonly #directory: string;

  constructor(directory: string) {
    this.#directory = directory;
    mkdirSync(directory, { recursive: true });
  }

  append(sessionId: string, stream: TranscriptEntry["stream"], text: string): void {
    const path = this.#path(sessionId);
    if (existsSync(path) && statSync(path).size >= MAX_TRANSCRIPT_BYTES) {
      const archived = `${path}.1`;
      if (existsSync(archived)) {
        throw new AppError(
          "RATE_LIMITED",
          "The QCoder transcript reached its retention limit.",
          429,
        );
      }
      renameSync(path, archived);
    }
    const entry: TranscriptEntry = {
      at: new Date().toISOString(),
      stream,
      text: redactTranscriptText(text).slice(0, MAX_ENTRY_TEXT),
    };
    appendFileSync(path, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  tail(sessionId: string, lines: number): TranscriptEntry[] {
    const path = this.#path(sessionId);
    if (lines <= 0 || !existsSync(path)) return [];
    const boundedLines = Math.min(Math.max(Math.trunc(lines), 0), 200);
    const content = readFileSync(path, "utf8");
    return content
      .split(/\r?\n/u)
      .filter(Boolean)
      .slice(-boundedLines)
      .map((line) => JSON.parse(line) as TranscriptEntry);
  }

  #path(sessionId: string): string {
    if (!SESSION_ID.test(sessionId)) {
      throw new AppError("INVALID_INPUT", "The QCoder session identifier is invalid.", 400);
    }
    return join(this.#directory, `${sessionId}.jsonl`);
  }
}
