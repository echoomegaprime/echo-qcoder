export type SessionStatus = "queued" | "running" | "stopping" | "completed" | "failed" | "stopped";

export interface SessionSummary {
  session_id: string;
  workspace_key: string;
  role: string;
  mission: string;
  status: SessionStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  active_task_id: string | null;
  queued_task_count: number;
  last_outcome: string | null;
}

export interface TranscriptLine {
  sequence: number;
  timestamp: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

export interface TaskSummary {
  task_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  queue_position: number;
  outcome: string | null;
}
