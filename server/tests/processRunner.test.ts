import { describe, expect, it } from "vitest";
import { buildLaunchSpec } from "../src/services/processRunner.js";

describe("governed QCoder process launch", () => {
  it("uses an argument array and the fixed launcher without a shell", () => {
    const spec = buildLaunchSpec(
      {
        powershellPath: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        launcherPath: "C:\\ECHO_MCP\\echo-qcoder\\launcher\\qcoder.ps1",
        leaseReleaseCommand: "ssh",
      },
      {
        sessionId: `qcs_${"a".repeat(32)}`,
        taskId: `qct_${"b".repeat(32)}`,
        workspacePath: "C:\\ECHO_MCP\\echo-qcoder",
        role: "cli-build",
        mission: "plugin verification",
        task: "Run tests; do not treat punctuation as shell syntax.",
        leaseToken: "c".repeat(32),
      },
    );
    expect(spec.command).toBe("C:\\Program Files\\PowerShell\\7\\pwsh.exe");
    expect(spec.options.shell).toBe(false);
    expect(spec.args).toContain("C:\\ECHO_MCP\\echo-qcoder\\launcher\\qcoder.ps1");
    expect(
      spec.args.some((argument) =>
        argument.includes("Run tests; do not treat punctuation as shell syntax."),
      ),
    ).toBe(true);
    expect(spec.options.env?.QCODER_GPU_LEASE_TOKEN).toBe("c".repeat(32));
    expect(spec.options.env?.QCODER_PLUGIN_MODE).toBe("1");
  });

  it("passes metacharacters as data instead of a command string", () => {
    const spec = buildLaunchSpec(
      { powershellPath: "pwsh", launcherPath: "C:\\fixed\\qcoder.ps1", leaseReleaseCommand: "ssh" },
      {
        sessionId: `qcs_${"a".repeat(32)}`,
        taskId: `qct_${"b".repeat(32)}`,
        workspacePath: "C:\\allowed",
        role: "builder",
        mission: "safe",
        task: "test; Remove-Item C:\\never-executed",
        leaseToken: "c".repeat(32),
      },
    );
    expect(spec.options.shell).toBe(false);
    expect(spec.command).toBe("pwsh");
    expect(spec.args).toContain(
      "safe\n\nCurrent governed task:\ntest; Remove-Item C:\\never-executed",
    );
  });

  it("passes only the minimum process environment to the governed child", () => {
    process.env.QCODER_OAUTH_CLIENT_SECRET = "must-never-reach-qwen";
    process.env.SOL_BROKER_TOKEN = "parent-mission-secret";
    process.env.AWS_SECRET_ACCESS_KEY = "cloud-secret";
    try {
      const spec = buildLaunchSpec(
        {
          powershellPath: "pwsh",
          launcherPath: "C:\\fixed\\qcoder.ps1",
          leaseReleaseCommand: "ssh",
        },
        {
          sessionId: `qcs_${"a".repeat(32)}`,
          taskId: `qct_${"b".repeat(32)}`,
          workspacePath: "C:\\allowed",
          role: "builder",
          mission: "safe",
          task: "edit the allowlisted workspace",
          leaseToken: "c".repeat(32),
        },
      );
      expect(spec.options.env?.QCODER_OAUTH_CLIENT_SECRET).toBeUndefined();
      expect(spec.options.env?.SOL_BROKER_TOKEN).toBeUndefined();
      expect(spec.options.env?.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    } finally {
      delete process.env.QCODER_OAUTH_CLIENT_SECRET;
      delete process.env.SOL_BROKER_TOKEN;
      delete process.env.AWS_SECRET_ACCESS_KEY;
    }
  });
});
