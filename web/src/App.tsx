import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { FormEvent, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { isAuthenticationError, parseSessionDetail, toolErrorMessage } from "./bridge/results.js";
import { initialConsoleState, reduceConsoleState } from "./state/consoleState.js";
import "./styles.css";

export type ConsoleBridge = Pick<McpApp, "callServerTool" | "sendMessage">;

function resultSessionId(result: CallToolResult): string | null {
  const value = result.structuredContent;
  if (!value || typeof value !== "object") return null;
  const sessionId = (value as Record<string, unknown>).session_id;
  return typeof sessionId === "string" && /^qcs_[a-f0-9]{32}$/u.test(sessionId) ? sessionId : null;
}

export function QCoderConsole() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { app, error } = useApp({
    appInfo: { name: "QCoder Console", version: "0.3.0" },
    capabilities: {},
    onAppCreated: (instance) => {
      instance.ontoolinput = (input) => {
        const candidate = input.arguments?.session_id;
        if (typeof candidate === "string" && /^qcs_[a-f0-9]{32}$/u.test(candidate))
          setSessionId(candidate);
      };
      instance.ontoolresult = (result) => {
        const candidate = resultSessionId(result);
        if (candidate) setSessionId(candidate);
      };
      instance.ontoolcancelled = () => undefined;
      instance.onerror = () => undefined;
    },
  });
  if (error) return <StatusPanel title="Bridge error" body={error.message} />;
  if (!app)
    return <StatusPanel title="Connecting" body="Initializing the secure MCP Apps bridge." busy />;
  if (!sessionId)
    return (
      <StatusPanel
        title="No session selected"
        body="Ask ChatGPT to retrieve and render a QCoder session."
      />
    );
  return <QCoderConsoleInner key={sessionId} app={app} sessionId={sessionId} />;
}

export function QCoderConsoleInner({ app, sessionId }: { app: ConsoleBridge; sessionId: string }) {
  const [state, dispatch] = useReducer(reduceConsoleState, initialConsoleState);
  const [task, setTask] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);
  const mounted = useRef(true);
  const requestGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    dispatch({ type: "loading" });
    try {
      const result = await app.callServerTool({
        name: "get_qcoder_session",
        arguments: { session_id: sessionId, transcript_lines: 120 },
      });
      if (!mounted.current || generation !== requestGeneration.current) return;
      const detail = parseSessionDetail(result);
      if (detail.session.session_id !== sessionId) return;
      dispatch({ type: "loaded", ...detail });
    } catch (error) {
      if (!mounted.current || generation !== requestGeneration.current) return;
      dispatch(
        isAuthenticationError(error)
          ? { type: "auth-required" }
          : { type: "error", message: message(error) },
      );
    }
  }, [app, sessionId]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const submitTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!state.session || !task.trim() || state.writePending) return;
    dispatch({ type: "write-pending", pending: true });
    try {
      const result = await app.callServerTool({
        name: "send_qcoder_task",
        arguments: {
          session_id: state.session.session_id,
          expected_revision: state.session.revision,
          task: task.trim(),
          idempotency_key: `ui-${crypto.randomUUID()}`,
        },
      });
      if (result.isError) throw new Error(toolErrorMessage(result));
      setTask("");
      await refresh();
    } catch (error) {
      dispatch(
        isAuthenticationError(error)
          ? { type: "auth-required" }
          : { type: "error", message: message(error) },
      );
    }
  };

  const stop = async () => {
    if (!state.session || state.writePending) return;
    dispatch({ type: "write-pending", pending: true });
    try {
      const result = await app.callServerTool({
        name: "stop_qcoder_session",
        arguments: {
          session_id: state.session.session_id,
          expected_revision: state.session.revision,
          confirmation: "STOP_QCODER_SESSION",
          reason: "Stopped from the authenticated QCoder console.",
          idempotency_key: `ui-${crypto.randomUUID()}`,
        },
      });
      if (result.isError) throw new Error(toolErrorMessage(result));
      setConfirmStop(false);
      await refresh();
    } catch (error) {
      dispatch(
        isAuthenticationError(error)
          ? { type: "auth-required" }
          : { type: "error", message: message(error) },
      );
    }
  };

  const askHost = async () => {
    await app.sendMessage(
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Summarize QCoder session ${sessionId} and recommend the next action.`,
          },
        ],
      },
      { signal: AbortSignal.timeout(5_000) },
    );
  };

  if (state.phase === "auth-required")
    return (
      <StatusPanel
        title="Authorization required"
        body="Reconnect QCoder, approve the requested scope, and retry."
      />
    );
  if (!state.session && state.phase === "error")
    return <StatusPanel title="Could not load QCoder" body={state.error ?? "Unknown error"} />;
  if (!state.session)
    return (
      <StatusPanel
        title="Loading session"
        body="Fetching current state and the bounded transcript."
        busy
      />
    );

  const terminal = ["completed", "failed", "stopped"].includes(state.session.status);
  return (
    <main className="console-shell">
      <header className="console-header">
        <div>
          <p className="eyebrow">ECHO OMEGA PRIME / GOVERNED BUILDER</p>
          <h1>QCoder Console</h1>
          <p className="mission">{state.session.mission}</p>
        </div>
        <span className={`status status-${state.session.status}`}>{state.session.status}</span>
      </header>

      <section className="facts" aria-label="Session summary">
        <Fact label="Workspace" value={state.session.workspace_key} />
        <Fact label="Role" value={state.session.role} />
        <Fact label="Revision" value={String(state.session.revision)} />
        <Fact label="Queued" value={String(state.session.queued_task_count)} />
      </section>

      <section className="terminal" aria-label="QCoder transcript" aria-live="polite">
        <div className="terminal-bar">
          <span />
          <span />
          <span />
          <strong>bounded, redacted transcript</strong>
        </div>
        <div className="terminal-lines" tabIndex={0}>
          {state.transcript.length === 0 ? (
            <p className="muted">No output yet.</p>
          ) : (
            state.transcript.map((line) => (
              <p key={`${line.timestamp}-${line.sequence}`} className={`line line-${line.stream}`}>
                <time dateTime={line.timestamp}>
                  {new Date(line.timestamp).toLocaleTimeString()}
                </time>
                <span>{line.text}</span>
              </p>
            ))
          )}
        </div>
      </section>

      {state.error ? (
        <p className="error-banner" role="alert">
          {state.error}
        </p>
      ) : null}
      <form className="composer" onSubmit={(event) => void submitTask(event)}>
        <label htmlFor="qcoder-task">Follow-up task</label>
        <textarea
          id="qcoder-task"
          value={task}
          onChange={(event) => setTask(event.target.value)}
          maxLength={12_000}
          rows={3}
          disabled={terminal || state.writePending}
          placeholder={
            terminal ? "This session is closed." : "Describe the next outcome for QCoder…"
          }
        />
        <div className="actions">
          <button
            className="primary"
            type="submit"
            disabled={terminal || state.writePending || !task.trim()}
          >
            Send task
          </button>
          <button type="button" onClick={() => void askHost()} disabled={state.writePending}>
            Ask ChatGPT
          </button>
          <button
            className="danger"
            type="button"
            onClick={() => setConfirmStop(true)}
            disabled={terminal || state.writePending}
          >
            Stop session
          </button>
          <button type="button" onClick={() => void refresh()} disabled={state.writePending}>
            Refresh
          </button>
        </div>
      </form>
      {confirmStop ? (
        <div
          className="confirm-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm QCoder stop"
        >
          <p>
            Stop session <code>{state.session.session_id}</code> at revision{" "}
            {state.session.revision}? Queued work will be cancelled.
          </p>
          <div className="actions">
            <button type="button" onClick={() => setConfirmStop(false)}>
              Keep running
            </button>
            <button className="danger" type="button" onClick={() => void stop()}>
              Confirm stop
            </button>
          </div>
        </div>
      ) : null}
      <p className="sr-only" aria-live="assertive">
        {state.writePending ? "QCoder action in progress." : ""}
      </p>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPanel({
  title,
  body,
  busy = false,
}: {
  title: string;
  body: string;
  busy?: boolean;
}) {
  return (
    <main className="status-panel" aria-busy={busy}>
      <div className="signal" />
      <h1>{title}</h1>
      <p>{body}</p>
    </main>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "QCoder could not complete the action.";
}
