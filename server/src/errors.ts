export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "SCOPE_REQUIRED"
  | "TENANT_FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "LAUNCH_FAILED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, status = 400, retryable = false) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError("INTERNAL_ERROR", "QCoder could not complete the request.", 500, false);
}
