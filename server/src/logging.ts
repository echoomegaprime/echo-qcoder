const REDACTED = "[REDACTED]";
const SENSITIVE_KEY =
  /^(?:authorization|cookie|set-cookie|token|access_token|refresh_token|api[_-]?key|password|secret|client_secret|sol_broker_token)$/i;

const TEXT_PATTERNS: readonly [RegExp, string][] = [
  [/\bAuthorization\s*:\s*Bearer\s+[^\s]+/gi, `Authorization: Bearer ${REDACTED}`],
  [/\b(?:Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi, `Cookie: ${REDACTED}`],
  [/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)|password)\s*=\s*[^\s]+/gi, `$1=${REDACTED}`],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, REDACTED],
];

export function redactText(value: string): string {
  let output = value;
  for (const [pattern, replacement] of TEXT_PATTERNS) output = output.replace(pattern, replacement);
  return output;
}

export function redactUnknown(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, seen));
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactUnknown(nested, seen);
  }
  return output;
}

export interface StructuredLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

function emit(level: "info" | "warn" | "error", event: string, fields = {}): void {
  const redacted = redactUnknown(fields) as Record<string, unknown>;
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redacted,
  });
  process.stderr.write(`${record}\n`);
}

export const logger: StructuredLogger = {
  info: (event, fields) => emit("info", event, fields),
  warn: (event, fields) => emit("warn", event, fields),
  error: (event, fields) => emit("error", event, fields),
};
