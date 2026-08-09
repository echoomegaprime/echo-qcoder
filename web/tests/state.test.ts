import { describe, expect, it } from "vitest";
import { initialConsoleState, reduceConsoleState } from "../src/state/consoleState.js";

describe("console state reducer", () => {
  it("moves through loading, ready, and recoverable error states", () => {
    const loading = reduceConsoleState(initialConsoleState, { type: "loading" });
    expect(loading.phase).toBe("loading");
    const ready = reduceConsoleState(loading, {
      type: "loaded",
      session: {
        session_id: `qcs_${"a".repeat(32)}`,
        workspace_key: "echo-qcoder",
        role: "builder",
        mission: "verify",
        status: "running",
        revision: 2,
        created_at: "2026-08-09T00:00:00Z",
        updated_at: "2026-08-09T00:00:01Z",
        active_task_id: null,
        queued_task_count: 0,
        last_outcome: null,
      },
      transcript: [],
      tasks: [],
    });
    expect(ready.phase).toBe("ready");
    const failed = reduceConsoleState(ready, { type: "error", message: "Temporary failure" });
    expect(failed.phase).toBe("error");
    expect(failed.error).toBe("Temporary failure");
  });

  it("ignores stale revisions", () => {
    const state = { ...initialConsoleState, revision: 5 };
    expect(reduceConsoleState(state, { type: "revision", revision: 4 })).toEqual(state);
  });

  it("accepts a lower revision when the selected session changes", () => {
    const prior = {
      ...initialConsoleState,
      revision: 5,
      session: {
        session_id: `qcs_${"a".repeat(32)}`,
        workspace_key: "echo-qcoder",
        role: "builder",
        mission: "first",
        status: "running" as const,
        revision: 5,
        created_at: "2026-08-09T00:00:00Z",
        updated_at: "2026-08-09T00:00:01Z",
        active_task_id: null,
        queued_task_count: 0,
        last_outcome: null,
      },
    };
    const next = reduceConsoleState(prior, {
      type: "loaded",
      session: {
        ...prior.session,
        session_id: `qcs_${"b".repeat(32)}`,
        mission: "second",
        revision: 1,
      },
      transcript: [],
      tasks: [],
    });
    expect(next.session?.mission).toBe("second");
    expect(next.revision).toBe(1);
  });
});
