import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { AppError } from "../errors.js";
import { workspaceKeySchema } from "../schemas/tools.js";

export class WorkspaceRegistry {
  readonly #workspaces = new Map<string, string>();

  constructor(entries: Readonly<Record<string, string>>) {
    for (const [key, configuredPath] of Object.entries(entries)) {
      const parsed = workspaceKeySchema.safeParse(key);
      if (!parsed.success) throw new AppError("INVALID_INPUT", `Invalid workspace key: ${key}`);
      if (!isAbsolute(configuredPath)) {
        throw new AppError(
          "INVALID_INPUT",
          `Workspace ${key} must use an absolute configured path.`,
        );
      }
      let realPath: string;
      try {
        realPath = realpathSync.native(configuredPath);
        if (!statSync(realPath).isDirectory()) throw new Error("not a directory");
      } catch {
        throw new AppError("INVALID_INPUT", `Configured workspace ${key} is unavailable.`);
      }
      this.#workspaces.set(key, realPath);
    }
    if (this.#workspaces.size === 0) {
      throw new AppError("INVALID_INPUT", "At least one QCoder workspace must be configured.");
    }
  }

  resolve(key: string): string {
    const parsed = workspaceKeySchema.safeParse(key);
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "The QCoder workspace key is invalid.");
    const workspace = this.#workspaces.get(parsed.data);
    if (!workspace)
      throw new AppError("NOT_FOUND", "That QCoder workspace is not registered.", 404);
    return workspace;
  }

  keys(): readonly string[] {
    return [...this.#workspaces.keys()].sort();
  }
}
