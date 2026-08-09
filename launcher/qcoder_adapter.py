from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import ctypes
from ctypes import wintypes
from pathlib import Path
from typing import NamedTuple, Sequence


DEFAULT_MODEL = "c3po-code:latest"
DEFAULT_BASE_URL = "http://192.168.1.220:11434/v1"
DEFAULT_API_KEY = "local-qcoder"


class CodexInvocation(NamedTuple):
    mode: str
    workspace: Path
    prompt: str
    include_directories: tuple[Path, ...]
    resume_session: str | None = None
    continue_latest: bool = False


def parse_codex_invocation(arguments: Sequence[str]) -> CodexInvocation:
    """Translate the bounded argument shape emitted by codex-auto."""
    values = list(arguments)
    mode = "interactive"
    resume_session: str | None = None
    continue_latest = False

    if values and values[0] == "exec":
        mode = "headless"
        values.pop(0)
    elif values and values[0] == "resume":
        mode = "resume"
        values.pop(0)

    workspace: Path | None = None
    include_directories: list[Path] = []
    positional: list[str] = []
    index = 0
    while index < len(values):
        value = values[index]
        if value in {"-C", "--cd"}:
            index += 1
            if index >= len(values):
                raise ValueError(f"{value} requires a workspace path")
            workspace = Path(values[index])
        elif value in {"--add-dir", "--include-directories"}:
            index += 1
            if index >= len(values):
                raise ValueError(f"{value} requires a directory path")
            include_directories.append(Path(values[index]))
        elif value in {
            "--search",
            "--dangerously-bypass-approvals-and-sandbox",
            "--dangerously-bypass-hook-trust",
        }:
            pass
        elif value == "--last":
            continue_latest = True
        elif value in {"--sandbox", "--ask-for-approval", "--model", "-c"}:
            index += 1
            if index >= len(values):
                raise ValueError(f"{value} requires a value")
        elif value.startswith("-"):
            raise ValueError(f"unsupported codex-auto argument: {value}")
        else:
            positional.append(value)
        index += 1

    if workspace is None:
        workspace = Path.cwd()

    if mode == "headless" and positional and positional[0] == "resume":
        positional.pop(0)
        if continue_latest:
            pass
        elif len(positional) >= 2:
            resume_session = positional.pop(0)
        else:
            raise ValueError("resume requires a session identifier and bootstrap prompt")
    elif mode == "resume" and not continue_latest:
        if len(positional) < 2:
            raise ValueError("resume requires a session identifier and bootstrap prompt")
        resume_session = positional.pop(0)

    if not positional or not positional[-1].strip():
        raise ValueError("codex-auto did not supply a bootstrap prompt")
    if len(positional) != 1:
        raise ValueError("unexpected positional arguments from codex-auto")

    return CodexInvocation(
        mode=mode,
        workspace=workspace,
        prompt=positional[0],
        include_directories=tuple(include_directories),
        resume_session=resume_session,
        continue_latest=continue_latest,
    )


def build_qwen_arguments(
    invocation: CodexInvocation,
    *,
    qwen_model: str = DEFAULT_MODEL,
    base_url: str = DEFAULT_BASE_URL,
    api_key: str = DEFAULT_API_KEY,
) -> list[str]:
    """Build explicit local-provider arguments without consulting user auth state."""
    if not base_url.startswith(("http://127.0.0.1:", "http://localhost:", "http://192.168.")):
        raise ValueError("qcoder base URL must be a local or private-network endpoint")
    if not qwen_model.strip():
        raise ValueError("qcoder model must not be empty")

    result = [
        "--model",
        qwen_model,
        "--auth-type",
        "openai",
        "--openai-base-url",
        base_url,
        "--openai-api-key",
        api_key,
        "--approval-mode",
        "yolo",
        "--output-format",
        "text",
    ]
    for directory in invocation.include_directories:
        result.extend(["--include-directories", str(directory)])

    if invocation.continue_latest:
        result.append("--continue")
    elif invocation.resume_session:
        result.extend(["--resume", invocation.resume_session])
    if invocation.mode == "headless":
        result.append("-p")
    result.append(invocation.prompt)
    return result


def apply_target_workspace(invocation: CodexInvocation, target_workspace: str) -> CodexInvocation:
    target = Path(target_workspace)
    include_directories = tuple(dict.fromkeys((*invocation.include_directories, target)))
    return invocation._replace(workspace=target, include_directories=include_directories)


def safe_invocation_summary(
    invocation: CodexInvocation,
    *,
    qwen_model: str = DEFAULT_MODEL,
    base_url: str = DEFAULT_BASE_URL,
) -> str:
    return json.dumps(
        {
            "mode": invocation.mode,
            "workspace": str(invocation.workspace),
            "model": qwen_model,
            "base_url": base_url,
            "include_directory_count": len(invocation.include_directories),
            "resume": bool(invocation.resume_session),
            "continue_latest": invocation.continue_latest,
        },
        separators=(",", ":"),
    )


def resolve_qwen_executable() -> str:
    configured = os.environ.get("QCODER_QWEN_PATH")
    if configured:
        candidate = Path(configured)
        if not candidate.is_file():
            raise FileNotFoundError(f"QCODER_QWEN_PATH does not exist: {candidate}")
        return str(candidate)

    discovered = shutil.which("qwen")
    if discovered:
        return discovered

    windows_candidate = Path(r"E:\tools\npm-global\qwen.cmd")
    if windows_candidate.is_file():
        return str(windows_candidate)
    raise FileNotFoundError("Qwen Code CLI was not found")


def build_qwen_environment(
    base_environment: dict[str, str], *, settings_path: Path
) -> dict[str, str]:
    environment = dict(base_environment)
    environment["QWEN_CODE_SYSTEM_SETTINGS_PATH"] = str(settings_path)
    environment.setdefault("QWEN_CODE_API_TIMEOUT_MS", "900000")
    environment.pop("OPENAI_API_KEY", None)
    return environment


def _create_windows_kill_on_close_job() -> int:
    """Create a Windows job that kills the Qwen process tree if this adapter dies."""

    class IoCounters(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_uint64),
            ("WriteOperationCount", ctypes.c_uint64),
            ("OtherOperationCount", ctypes.c_uint64),
            ("ReadTransferCount", ctypes.c_uint64),
            ("WriteTransferCount", ctypes.c_uint64),
            ("OtherTransferCount", ctypes.c_uint64),
        ]

    class BasicLimitInformation(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class ExtendedLimitInformation(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", BasicLimitInformation),
            ("IoInfo", IoCounters),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.SetInformationJobObject.argtypes = [
        wintypes.HANDLE,
        ctypes.c_int,
        ctypes.c_void_p,
        wintypes.DWORD,
    ]
    kernel32.SetInformationJobObject.restype = wintypes.BOOL
    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        raise ctypes.WinError(ctypes.get_last_error())
    information = ExtendedLimitInformation()
    information.BasicLimitInformation.LimitFlags = 0x00002000
    if not kernel32.SetInformationJobObject(
        job,
        9,
        ctypes.byref(information),
        ctypes.sizeof(information),
    ):
        error = ctypes.get_last_error()
        kernel32.CloseHandle(job)
        raise ctypes.WinError(error)
    return int(job)


def run_supervised_process(
    command: Sequence[str],
    *,
    cwd: Path,
    environment: dict[str, str],
) -> int:
    """Run Qwen so a terminated launcher cannot leave orphan model requests."""
    if os.name != "nt":
        return subprocess.run(
            list(command),
            cwd=cwd,
            env=environment,
            check=False,
        ).returncode

    process = subprocess.Popen(
        list(command),
        cwd=cwd,
        env=environment,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    job = _create_windows_kill_on_close_job()
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    if not kernel32.AssignProcessToJobObject(job, int(process._handle)):
        error = ctypes.get_last_error()
        process.terminate()
        process.wait(timeout=10)
        kernel32.CloseHandle(job)
        raise ctypes.WinError(error)
    try:
        return process.wait()
    finally:
        kernel32.CloseHandle(job)


def main(arguments: Sequence[str] | None = None) -> int:
    invocation = parse_codex_invocation(sys.argv[1:] if arguments is None else arguments)
    target_workspace = os.environ.get("QCODER_TARGET_DIR")
    if target_workspace:
        invocation = apply_target_workspace(invocation, target_workspace)
    if not invocation.workspace.is_dir():
        raise FileNotFoundError(f"QCoder workspace does not exist: {invocation.workspace}")
    executable = resolve_qwen_executable()
    model = os.environ.get("QCODER_MODEL", DEFAULT_MODEL)
    base_url = os.environ.get("QCODER_BASE_URL", DEFAULT_BASE_URL)
    api_key = os.environ.get("QCODER_LOCAL_API_KEY", DEFAULT_API_KEY)
    qwen_arguments = build_qwen_arguments(
        invocation,
        qwen_model=model,
        base_url=base_url,
        api_key=api_key,
    )

    settings_path = Path(__file__).with_name("qwen-settings.json")
    environment = build_qwen_environment(dict(os.environ), settings_path=settings_path)
    print(f"QCoder launching {safe_invocation_summary(invocation, qwen_model=model, base_url=base_url)}")
    return run_supervised_process(
        [executable, *qwen_arguments],
        cwd=invocation.workspace,
        environment=environment,
    )


if __name__ == "__main__":
    raise SystemExit(main())
