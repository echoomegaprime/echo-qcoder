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

const execFileAsync = promisify(execFile);

export interface ProcessRunnerConfig {
  powershellPath: string;
  launcherPath: string;
  leaseReleaseCommand: string;
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
        ...process.env,
        QCODER_GPU_LEASE_TOKEN: task.leaseToken,
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
    const capture = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      outcome.push(text);
      if (outcome.join("").length > 8_000) outcome.splice(0, Math.max(outcome.length - 8, 1));
      run.onOutput(stream, text);
    };
    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));
    return new Promise<RunResult>((resolve, reject) => {
      let settled = false;
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        this.#active.delete(run.sessionId);
        reject(
          new AppError("LAUNCH_FAILED", `QCoder could not start: ${error.message}`, 503, true),
        );
      });
      child.once("close", (code) => {
        if (settled) return;
        settled = true;
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
    if (!active) return false;
    active.stopped = true;
    if (process.platform === "win32" && active.child.pid) {
      await execFileAsync("taskkill.exe", ["/PID", String(active.child.pid), "/T", "/F"], {
        windowsHide: true,
        timeout: 10_000,
      }).catch(() => undefined);
    } else {
      active.child.kill("SIGTERM");
      const timer = setTimeout(() => active.child.kill("SIGKILL"), 5_000);
      timer.unref();
    }
    await this.#releaseLease(active.leaseToken);
    return true;
  }

  async #releaseLease(token: string): Promise<void> {
    await execFileAsync(
      this.#config.leaseReleaseCommand,
      ["forge", "sudo", "/usr/local/sbin/qcoder-gpu-lease", "release", "--token", token],
      { windowsHide: true, timeout: 30_000 },
    ).catch(() => undefined);
  }
}
