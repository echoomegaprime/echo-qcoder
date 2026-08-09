import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QCoderConsoleInner, type ConsoleBridge } from "../src/App.js";

const sessionId = `qcs_${"a".repeat(32)}`;
function detail(): CallToolResult {
  return {
    content: [{ type: "text", text: "ok" }],
    structuredContent: {
      session: {
        session_id: sessionId,
        workspace_key: "echo-qcoder",
        role: "builder",
        mission: "Build safely",
        status: "running",
        revision: 2,
        created_at: "2026-08-09T00:00:00Z",
        updated_at: "2026-08-09T00:00:01Z",
        active_task_id: null,
        queued_task_count: 0,
        last_outcome: null,
      },
      tasks: [],
      transcript: [
        { sequence: 0, timestamp: "2026-08-09T00:00:01Z", stream: "stdout", text: "ready" },
      ],
    },
  };
}

describe("QCoder MCP App", () => {
  it("loads through tools/call and exposes accessible session controls", async () => {
    const callServerTool = vi.fn().mockResolvedValue(detail());
    const app = {
      callServerTool,
      sendMessage: vi.fn().mockResolvedValue({}),
    } as unknown as ConsoleBridge;
    render(<QCoderConsoleInner app={app} sessionId={sessionId} />);
    expect(screen.getByText("Loading session")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "QCoder Console" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "QCoder transcript" })).toHaveTextContent("ready");
    expect(callServerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "get_qcoder_session" }),
    );
    expect(screen.getByLabelText("Follow-up task")).toBeEnabled();
  });

  it("calls the separate write tool and sends a follow-up host message", async () => {
    const callServerTool = vi.fn().mockResolvedValue(detail());
    const sendMessage = vi.fn().mockResolvedValue({});
    const app = { callServerTool, sendMessage } as unknown as ConsoleBridge;
    render(<QCoderConsoleInner app={app} sessionId={sessionId} />);
    await screen.findByRole("heading", { name: "QCoder Console" });
    fireEvent.change(screen.getByLabelText("Follow-up task"), {
      target: { value: "Run the tests" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));
    await waitFor(() =>
      expect(callServerTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: "send_qcoder_task" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask ChatGPT" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
  });

  it("renders authorization-required state without leaking tool details", async () => {
    const app = {
      callServerTool: vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "AUTH_REQUIRED: Connect QCoder." }],
      }),
      sendMessage: vi.fn(),
    } as unknown as ConsoleBridge;
    render(<QCoderConsoleInner app={app} sessionId={sessionId} />);
    expect(
      await screen.findByRole("heading", { name: "Authorization required" }),
    ).toBeInTheDocument();
  });

  it("requires a second session-bound confirmation before stopping", async () => {
    const callServerTool = vi.fn().mockResolvedValue(detail());
    const app = { callServerTool, sendMessage: vi.fn() } as unknown as ConsoleBridge;
    render(<QCoderConsoleInner app={app} sessionId={sessionId} />);
    await screen.findByRole("heading", { name: "QCoder Console" });
    fireEvent.click(screen.getByRole("button", { name: "Stop session" }));
    expect(screen.getByRole("dialog", { name: "Confirm QCoder stop" })).toBeInTheDocument();
    expect(
      callServerTool.mock.calls.some(
        (arguments_) =>
          (arguments_[0] as { name?: string } | undefined)?.name === "stop_qcoder_session",
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm stop" }));
    await waitFor(() =>
      expect(callServerTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: "stop_qcoder_session" }),
      ),
    );
  });
});
