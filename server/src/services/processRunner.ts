import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "../errors.js";
import type { FleetRole } from "../schemas/tools.js";
import type { ManagedRun, ManagedTaskRunner, RunResult } from "./taskRunner.js";
import { redactTranscriptText } from "./transcriptStore.js";

const execFileAsync = promisify(execFile);

export interface ProcessRunnerConfig {
  powershellPath: string;
  launcherPath: string;
  leaseReleaseCommand: string;
  maxRuntimeMs?: number;
}

export interface LaunchTask {
  sessionId: string;
  taskId: string;
  workspacePath: string;
  role: FleetRole;
  mission: string;
  task: string;
  leaseToken: string;
}

export interface LaunchSpec {
  command: string;
  args: string[];
  options: SpawnOptionsWithoutStdio;
}

const CHILD_ENV_ALLOWLIST = new Set([
  "APPDATA",
  "COMPUTERNAME",
  "COMSPEC",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATH",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PSMODULEPATH",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
]);

function minimumChildEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => CHILD_ENV_ALLOWLIST.has(key.toUpperCase())),
  );
}

export function buildLaunchSpec(config: ProcessRunnerConfig, task: LaunchTask): LaunchSpec {
  const mission = `${task.mission}\n\nCurrent governed task:\n${task.task}`;
  return {
    command: config.powershellPath,
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      config.launcherPath,
      "-Role",
      task.role,
      "-WorkerId",
      `qcoder-plugin-${task.sessionId.slice(-12)}`,
      "-Mission",
      mission,
      "-ProjectDir",
      task.workspacePath,
      "-Headless",
      "-UntilDone",
      "-Verify",
      "strict",
    ],
    options: {
      cwd: task.workspacePath,
      env: {
        ...minimumChildEnvironment(),
        QCODER_GPU_LEASE_TOKEN: task.leaseToken,
        QCODER_PLUGIN_MODE: "1",
        QCODER_SUPERVISOR_PID: String(process.pid),
        QCODER_PLUGIN_SESSION_ID: task.sessionId,
        QCODER_PLUGIN_TASK_ID: task.taskId,
      },
      shell: false,
      windowsHide: true,
    },
  };
}

interface ActiveProcess {
  child: ChildProcessWithoutNullStreams;
  leaseToken: string;
  stopped: boolean;
}

export class QCoderProcessRunner implements ManagedTaskRunner {
  readonly #config: ProcessRunnerConfig;
  readonly #active = new Map<string, ActiveProcess>();
  readonly #pendingLeaseCleanup = new Map<string, string>();

  constructor(config: ProcessRunnerConfig) {
    this.#config = config;
  }

  run(run: ManagedRun): Promise<RunResult> {
    if (this.#active.has(run.sessionId)) {
      return Promise.reject(
        new AppError("CONFLICT", "That QCoder session is already running.", 409),
      );
    }
    const leaseToken = randomBytes(16).toString("hex");
    const spec = buildLaunchSpec(this.#config, { ...run, leaseToken });
    const child = spawn(spec.command, spec.args, { ...spec.options, stdio: "pipe" });
    const active: ActiveProcess = { child, leaseToken, stopped: false };
    this.#active.set(run.sessionId, active);
    const outcome: string[] = [];
    let outcomeLength = 0;
    const capture = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      const text = redactTranscriptText(chunk.toString("utf8").slice(-8_000));
      outcome.push(text);
      outcomeLength += text.length;
      while (outcomeLength > 8_000 && outcome.length > 1) {
        outcomeLength -= outcome.shift()?.length ?? 0;
      }
      try {
        run.onOutput(stream, text);
      } catch {
        // A transcript sink failure must not crash the shared MCP process.
      }
    };
    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));
    return new Promise<RunResult>((resolve, reject) => {
      let settled = false;
      const deadline = setTimeout(
        () => {
          void this.stop(run.sessionId).catch(() => {
            if (child.exitCode === null) child.kill("SIGKILL");
          });
        },
        this.#config.maxRuntimeMs ?? 12 * 60 * 60 * 1000,
      );
      deadline.unref();
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        this.#active.delete(run.sessionId);
        reject(
          new AppError("LAUNCH_FAILED", `QCoder could not start: ${error.message}`, 503, true),
        );
      });
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        this.#active.delete(run.sessionId);
        const normalizedCode = code ?? (active.stopped ? 130 : 1);
        const summary =
          outcome.join("").trim().slice(-2_000) || `QCoder exited with code ${normalizedCode}.`;
        resolve({ exitCode: normalizedCode, outcome: summary, stopped: active.stopped });
      });
    });
  }

  async stop(sessionId: string): Promise<boolean> {
    const active = this.#active.get(sessionId);
    if (!active) {
      const pendingToken = this.#pendingLeaseCleanup.get(sessionId);
      if (!pendingToken) return false;
      await this.#releaseLease(pendingToken);
      this.#pendingLeaseCleanup.delete(sessionId);
      return true;
    }
    active.stopped = true;
    this.#pendingLeaseCleanup.set(sessionId, active.leaseToken);
    if (process.platform === "win32" && active.child.pid) {
      try {
        await execFileAsync("taskkill.exe", ["/PID", String(active.child.pid), "/T", "/F"], {
          windowsHide: true,
          timeout: 10_000,
        });
      } catch (error) {
        if (active.child.exitCode === null) {
          void error;
          throw new AppError("UNAVAILABLE", "QCoder process termination failed.", 503, true);
        }
      }
    } else {
      if (!active.child.kill("SIGTERM") && active.child.exitCode === null) {
        throw new AppError("UNAVAILABLE", "QCoder process termination failed.", 503, true);
      }
      const timer = setTimeout(() => active.child.kill("SIGKILL"), 5_000);
      timer.unref();
    }
    await this.#waitForExit(active.child);
    await this.#releaseLease(active.leaseToken);
    this.#pendingLeaseCleanup.delete(sessionId);
    return true;
  }

  async stopAll(): Promise<void> {
    const results = await Promise.allSettled([...this.#active.keys()].map((id) => this.stop(id)));
    if (results.some((result) => result.status === "rejected")) {
      throw new AppError("UNAVAILABLE", "Not every QCoder process stopped cleanly.", 503, true);
    }
  }

  async #waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(new AppError("UNAVAILABLE", "QCoder process exit was not verified.", 503, true)),
        12_000,
      );
      timeout.unref();
      child.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async #releaseLease(token: string): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await execFileAsync(
          this.#config.leaseReleaseCommand,
          ["forge", "sudo", "/usr/local/sbin/qcoder-gpu-lease", "release", "--token", token],
          { windowsHide: true, timeout: 30_000 },
        );
        return;
      } catch (error) {
        lastError = error;
      }
    }
    void lastError;
    throw new AppError("UNAVAILABLE", "QCoder GPU restoration is not yet verified.", 503, true);
  }
}
