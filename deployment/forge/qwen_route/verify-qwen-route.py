#!/usr/bin/env python3
"""Deterministic acceptance canaries for the governed FORGE Qwen route.

The report contains identities, counts, timings, and host diagnostics only.
It never stores prompts, completions, credentials, cookies, or request bodies.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


MODEL = "c3po-code:echo-abliterated-128k"
BASE_DIGEST = "418838acbea7dad6eca43e2f74519307235e62b584e08ab7a6e7d6916cff7507"
EXPECTED_CONTEXT = 131072
NEEDLES = [
    "NEEDLE_ALPHA_7F3A",
    "NEEDLE_BRAVO_29C1",
    "NEEDLE_CHARLIE_8D04",
    "NEEDLE_DELTA_51BE",
    "NEEDLE_ECHO_C672",
]


def call(base: str, path: str, body: dict | None = None, timeout: int = 2400) -> tuple[int, dict, float, dict]:
    data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    request = urllib.request.Request(
        base + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="GET" if body is None else "POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
            headers = {key.lower(): value for key, value in response.headers.items()}
            return response.status, payload, time.perf_counter() - started, headers
    except urllib.error.HTTPError as exc:
        try:
            payload = json.load(exc)
        except (ValueError, json.JSONDecodeError):
            payload = {"error": "non-json error response"}
        return exc.code, payload, time.perf_counter() - started, dict(exc.headers.items())


def command(*args: str, timeout: int = 300) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=False, capture_output=True, text=True, timeout=timeout)


def exact_health(base: str) -> dict:
    status, payload, elapsed, _ = call(base, "/health", timeout=15)
    if status != 200 or payload.get("ok") is not True:
        raise AssertionError(f"health was not exact-ready: status={status}")
    checks = payload.get("checks", {})
    resident = checks.get("resident_model", {})
    base_artifact = checks.get("base_artifact", {})
    alias = checks.get("alias", {})
    if base_artifact.get("digest") != BASE_DIGEST or resident.get("context") != EXPECTED_CONTEXT:
        raise AssertionError("health returned the wrong digest or context")
    if resident.get("digest") != alias.get("digest"):
        raise AssertionError("resident alias digest did not match the registered stable alias")
    if resident.get("fully_gpu_resident") is not True:
        raise AssertionError("health did not prove full GPU residency")
    return {"status": status, "elapsed_s": round(elapsed, 3), "checks": checks}


def small_canaries(base: str) -> dict:
    native = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Reply with exactly ROUTE_OK"}],
        "stream": False,
        "think": False,
        "options": {"num_predict": 32, "temperature": 0},
    }
    status, payload, native_seconds, headers = call(base, "/api/chat", native)
    if status != 200 or payload.get("route", {}).get("truncated") is not False:
        raise AssertionError(f"native chat failed: {status}")
    if payload.get("route", {}).get("shifted") is not False:
        raise AssertionError("native chat shifted context")

    openai = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "Reply with exactly OPENAI_OK"}],
        "stream": False,
        "reasoning_effort": "none",
        "max_tokens": 32,
        "temperature": 0,
    }
    status2, payload2, openai_seconds, headers2 = call(base, "/v1/chat/completions", openai)
    if status2 != 200 or payload2.get("route_metadata", {}).get("reasoning_effort") != "none":
        raise AssertionError(f"OpenAI chat failed: {status2}")
    if headers2.get("x-qwen-truncated") != "false" or headers2.get("x-qwen-shifted") != "false":
        raise AssertionError("OpenAI route did not prove no truncation/no shift")

    wrong = dict(openai)
    wrong["model"] = "qwen-cloud-incorrect"
    wrong_status, wrong_payload, _, _ = call(base, "/v1/chat/completions", wrong, timeout=30)
    if wrong_status != 400 or wrong_payload.get("error", {}).get("code") != "wrong_model":
        raise AssertionError("wrong-model negative control did not fail for its own reason")
    return {
        "native": {
            "status": status,
            "elapsed_s": round(native_seconds, 3),
            "prompt_tokens": payload.get("prompt_eval_count"),
            "truncated": payload.get("route", {}).get("truncated"),
            "shifted": payload.get("route", {}).get("shifted"),
        },
        "openai": {
            "status": status2,
            "elapsed_s": round(openai_seconds, 3),
            "usage": payload2.get("usage"),
            "reasoning_effort": payload2.get("route_metadata", {}).get("reasoning_effort"),
        },
        "wrong_model": {"status": wrong_status, "code": wrong_payload.get("error", {}).get("code")},
    }


def long_content(repetitions: int) -> str:
    segments = []
    base, remainder = divmod(max(repetitions, 0), len(NEEDLES) + 1)
    for index in range(len(NEEDLES) + 1):
        segments.append(" x" * (base + (1 if index < remainder else 0)))
        if index < len(NEEDLES):
            segments.append(f"\n{NEEDLES[index]}\n")
    return "".join(segments) + "\nReturn all five NEEDLE_* values exactly, in their original order, one per line."


def fit_prompt(base: str, target_tokens: int) -> tuple[str, dict, list[dict]]:
    repetitions = target_tokens - 256
    attempts: list[dict] = []
    for _ in range(6):
        content = long_content(repetitions)
        body = {
            "model": MODEL,
            "messages": [{"role": "user", "content": content}],
            "reasoning_effort": "none",
            "stream": False,
            "max_tokens": 4096,
        }
        status, payload, elapsed, _ = call(base, "/v1/token-budget", body)
        if status != 200:
            raise AssertionError(f"token calibration failed: status={status}")
        budget = payload["budget"]
        count = int(budget["prompt_tokens"])
        attempts.append({"prompt_tokens": count, "elapsed_s": round(elapsed, 3)})
        if abs(count - target_tokens) <= 32:
            return content, budget, attempts
        repetitions = max(1, repetitions + (target_tokens - count))
    raise AssertionError(f"could not fit deterministic prompt near {target_tokens} tokens")


def context_canary(base: str, target_tokens: int) -> dict:
    content, budget, attempts = fit_prompt(base, target_tokens)
    if budget["output_reserve_tokens"] != 4096:
        raise AssertionError("long-context canary did not reserve 4096 output tokens")
    if budget["total_reserved_tokens"] > EXPECTED_CONTEXT:
        raise AssertionError("long-context canary exceeded the admitted budget")
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
        "reasoning_effort": "none",
        "stream": False,
        "max_tokens": 512,
        "temperature": 0,
    }
    status, payload, elapsed, _ = call(base, "/v1/chat/completions", body)
    if status != 200:
        raise AssertionError(f"long-context generation failed: status={status}")
    answer = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    missing = [needle for needle in NEEDLES if needle not in answer]
    if missing:
        raise AssertionError(f"long-context multi-needle miss count={len(missing)}")
    route = payload.get("route_metadata", {})
    if route.get("truncated") is not False or route.get("shifted") is not False:
        raise AssertionError("long-context response did not prove no truncation/no shift")
    return {
        "target_tokens": target_tokens,
        "prompt_tokens": payload.get("usage", {}).get("prompt_tokens"),
        "total_reserved_tokens": route.get("budget", {}).get("total_reserved_tokens"),
        "output_reserve_tokens": route.get("budget", {}).get("output_reserve_tokens"),
        "needle_count": len(NEEDLES),
        "missing_needles": len(missing),
        "elapsed_s": round(elapsed, 3),
        "calibration": attempts,
    }


def concurrency_canary(base: str) -> dict:
    content = " concurrency" * 40000
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
        "reasoning_effort": "none",
        "stream": False,
        "max_tokens": 32,
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(call, base, "/v1/token-budget", body, 2400) for _ in range(3)]
        results = [future.result() for future in futures]
    statuses = sorted(item[0] for item in results)
    if statuses != [200, 200, 429]:
        raise AssertionError(f"single-flight backpressure mismatch: {statuses}")
    return {"statuses": statuses, "max_active": 1, "max_queue_depth": 1}


def host_diagnostics(since: str) -> dict:
    memory: dict[str, int] = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        if line.startswith(("MemAvailable:", "SwapTotal:", "SwapFree:")):
            key, value, *_ = line.replace(":", "").split()
            memory[key] = int(value)
    gpu = command(
        "nvidia-smi",
        "--query-gpu=index,name,memory.total,memory.used,utilization.gpu,temperature.gpu",
        "--format=csv,noheader,nounits",
        timeout=30,
    )
    kernel = command("journalctl", "-k", "--since", since, "--no-pager", "-o", "cat", timeout=60)
    lines = kernel.stdout.splitlines()
    xid = [line for line in lines if "NVRM: Xid" in line]
    qwen_oom = [line for line in lines if "oom" in line.lower() and ("qwen" in line.lower() or "ollama" in line.lower())]
    inspect = command(
        "docker",
        "inspect",
        "--format",
        "{{.State.OOMKilled}}|{{.HostConfig.LogConfig.Type}}|{{json .HostConfig.LogConfig.Config}}|{{range .Mounts}}{{.Name}}:{{.Destination}}{{end}}",
        "echo-ollama-qwen27b",
        timeout=30,
    )
    return {
        "memory_kib": memory,
        "gpu_rows": len([line for line in gpu.stdout.splitlines() if line.strip()]),
        "gpu_query_ok": gpu.returncode == 0,
        "xid_count_since_start": len(xid),
        "qwen_oom_count_since_start": len(qwen_oom),
        "container_contract": inspect.stdout.strip(),
        "container_inspect_ok": inspect.returncode == 0,
    }


def destructive_recovery(base: str) -> dict:
    if os.geteuid() != 0:
        raise AssertionError("--destructive requires root")
    before = exact_health(base)

    unload = command(
        "docker",
        "exec",
        "echo-ollama-qwen27b",
        "ollama",
        "stop",
        MODEL,
        timeout=60,
    )
    if unload.returncode != 0:
        raise AssertionError("cold-model unload injection failed")
    cold_red = False
    for _ in range(30):
        status, payload, _, _ = call(base, "/health", timeout=10)
        if status == 503 and payload.get("ok") is False:
            cold_red = True
            break
        time.sleep(1)
    if not cold_red:
        raise AssertionError("cold/unloaded model did not turn readiness red")
    cold_started = time.perf_counter()
    restart_route = command("systemctl", "restart", "echo-qwen-route.service", timeout=1800)
    if restart_route.returncode != 0:
        raise AssertionError("route warmup restart failed")
    exact_health(base)
    cold_load_seconds = time.perf_counter() - cold_started
    warm_started = time.perf_counter()
    status, _, _, _ = call(
        base,
        "/v1/token-budget",
        {
            "model": MODEL,
            "messages": [{"role": "user", "content": "warm latency probe"}],
            "reasoning_effort": "none",
            "stream": False,
            "max_tokens": 32,
        },
        timeout=120,
    )
    if status != 200:
        raise AssertionError("warm latency probe failed")
    warm_seconds = time.perf_counter() - warm_started

    killed_at = time.perf_counter()
    killed = command("docker", "kill", "echo-ollama-qwen27b", timeout=30)
    if killed.returncode != 0:
        raise AssertionError("container death injection failed")
    saw_red = False
    recovered = False
    for _ in range(180):
        status, payload, _, _ = call(base, "/health", timeout=10)
        if status == 503 and payload.get("ok") is False:
            saw_red = True
        if saw_red and status == 200 and payload.get("ok") is True:
            recovered = True
            break
        time.sleep(1)
    if not saw_red or not recovered:
        raise AssertionError(f"container-death recovery failed red={saw_red} recovered={recovered}")
    recovery_seconds = time.perf_counter() - killed_at

    before_alias = before["checks"]["alias"]["digest"]
    restart = command("systemctl", "restart", "echo-qwen-home.service", timeout=1800)
    if restart.returncode != 0:
        raise AssertionError("service restart failed")
    for _ in range(180):
        try:
            after = exact_health(base)
            break
        except (AssertionError, OSError, urllib.error.URLError):
            time.sleep(1)
    else:
        raise AssertionError("route did not recover after service restart")
    after_alias = after["checks"]["alias"]["digest"]
    if before_alias != after_alias:
        raise AssertionError("stable alias digest changed across service restart")
    volume = command("docker", "volume", "inspect", "ollama_ollama_data", timeout=30)
    if volume.returncode != 0:
        raise AssertionError("persistent model volume disappeared")
    return {
        "cold_unloaded_red": cold_red,
        "cold_load_s": round(cold_load_seconds, 3),
        "warm_preflight_s": round(warm_seconds, 3),
        "container_death_red": saw_red,
        "container_recovered": recovered,
        "container_recovery_s": round(recovery_seconds, 3),
        "service_restart_ok": True,
        "alias_digest_durable": before_alias == after_alias,
        "volume_durable": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:11437")
    parser.add_argument("--long-context", action="store_true")
    parser.add_argument("--concurrency", action="store_true")
    parser.add_argument("--destructive", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    started = dt.datetime.now(dt.timezone.utc)
    since = started.strftime("%Y-%m-%d %H:%M:%S UTC")
    report: dict[str, Any] = {
        "service": "echo-qwen-route",
        "base": args.base,
        "started_at": started.isoformat(),
        "health": exact_health(args.base),
        "quick": small_canaries(args.base),
    }
    if args.long_context:
        report["context_gt_32k"] = context_canary(args.base, 36000)
        report["context_120k"] = context_canary(args.base, 120000)
    if args.concurrency:
        report["concurrency"] = concurrency_canary(args.base)
    if args.destructive:
        report["recovery"] = destructive_recovery(args.base)
    report["diagnostics"] = host_diagnostics(since)
    diagnostics = report["diagnostics"]
    if diagnostics["xid_count_since_start"] or diagnostics["qwen_oom_count_since_start"]:
        raise AssertionError("new Qwen Xid/OOM evidence appeared during the canary")
    report["ok"] = True
    report["completed_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered + "\n")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
