import type { SessionSummary, TaskSummary, TranscriptLine } from "../types/session.js";

export interface ConsoleState {
  phase: "loading" | "empty" | "ready" | "auth-required" | "error";
  session: SessionSummary | null;
  transcript: readonly TranscriptLine[];
  tasks: readonly TaskSummary[];
  revision: number;
  error: string | null;
  writePending: boolean;
}

export type ConsoleAction =
  | { type: "loading" }
  | { type: "empty" }
  | { type: "auth-required" }
  | { type: "error"; message: string }
  | { type: "write-pending"; pending: boolean }
  | { type: "revision"; revision: number }
  | {
      type: "loaded";
      session: SessionSummary;
      transcript: readonly TranscriptLine[];
      tasks: readonly TaskSummary[];
    };

export const initialConsoleState: ConsoleState = {
  phase: "loading",
  session: null,
  transcript: [],
  tasks: [],
  revision: 0,
  error: null,
  writePending: false,
};

export function reduceConsoleState(state: ConsoleState, action: ConsoleAction): ConsoleState {
  switch (action.type) {
    case "loading":
      return { ...state, phase: "loading", error: null };
    case "empty":
      return { ...state, phase: "empty", session: null, transcript: [], tasks: [], error: null };
    case "auth-required":
      return { ...state, phase: "auth-required", error: null };
    case "error":
      return { ...state, phase: "error", error: action.message, writePending: false };
    case "write-pending":
      return { ...state, writePending: action.pending };
    case "revision":
      return action.revision > state.revision ? { ...state, revision: action.revision } : state;
    case "loaded":
      if (
        state.session?.session_id === action.session.session_id &&
        action.session.revision < state.revision
      )
        return state;
      return {
        ...state,
        phase: "ready",
        session: action.session,
        transcript: action.transcript,
        tasks: action.tasks,
        revision: action.session.revision,
        error: null,
        writePending: false,
      };
  }
}
