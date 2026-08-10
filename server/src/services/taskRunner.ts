export interface ManagedRun {
  sessionId: string;
  taskId: string;
  workspacePath: string;
  role: import("../schemas/tools.js").FleetRole;
  mission: string;
  task: string;
  onOutput: (stream: "stdout" | "stderr", text: string) => void;
}

export interface RunResult {
  exitCode: number;
  outcome: string;
  stopped: boolean;
}

export interface ManagedTaskRunner {
  run(run: ManagedRun): Promise<RunResult>;
  stop(sessionId: string): Promise<boolean>;
}
