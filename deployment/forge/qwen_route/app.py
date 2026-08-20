"""Fail-closed, single-flight gateway for the FORGE-local Qwen 27B runtime.

The raw Ollama daemon remains private on 127.0.0.1:11438.  This gateway is
the only supported caller-facing route.  It verifies the exact resident
model and GPU placement, performs an authoritative tokenizer preflight via
Ollama with truncation and context shifting disabled, and never logs prompt
or credential material.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from typing import Any, AsyncIterator, Mapping, Sequence

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse


SERVICE = "echo-qwen-route"
VERSION = "1.0.0"
UPSTREAM = os.environ.get("QWEN_UPSTREAM", "http://127.0.0.1:11438").rstrip("/")
MODEL_ALIAS = os.environ.get("QWEN_MODEL_ALIAS", "c3po-code:echo-abliterated-128k")
BASE_MODEL = os.environ.get(
    "QWEN_BASE_MODEL", "huihui_ai/Qwen3.6-abliterated:27b"
)
EXPECTED_BASE_DIGEST = os.environ.get(
    "QWEN_BASE_DIGEST",
    "418838acbea7dad6eca43e2f74519307235e62b584e08ab7a6e7d6916cff7507",
)
EXPECTED_ALIAS_DIGEST = os.environ.get(
    "QWEN_ALIAS_DIGEST",
    "a8b6dbff993304b29040d734ebc2d118b212e23feec64e0343fff85d9c02c5b0",
)
EXPECTED_CONTEXT = int(os.environ.get("QWEN_CONTEXT_LENGTH", "131072"))
EXPECTED_GPU_COUNT = int(os.environ.get("QWEN_GPU_COUNT", "2"))
OLLAMA_CONTAINER = os.environ.get("QWEN_OLLAMA_CONTAINER", "echo-ollama-qwen27b")
NVIDIA_SMI = os.environ.get("QWEN_NVIDIA_SMI", "/usr/bin/nvidia-smi")
MAX_QUEUE_DEPTH = int(os.environ.get("QWEN_MAX_QUEUE_DEPTH", "1"))
QUEUE_WAIT_SECONDS = float(os.environ.get("QWEN_QUEUE_WAIT_SECONDS", "900"))
UPSTREAM_TIMEOUT_SECONDS = float(os.environ.get("QWEN_UPSTREAM_TIMEOUT_SECONDS", "1800"))
MAX_REQUEST_BYTES = int(os.environ.get("QWEN_MAX_REQUEST_BYTES", str(16 * 1024 * 1024)))
DEFAULT_OUTPUT_TOKENS = int(os.environ.get("QWEN_DEFAULT_OUTPUT_TOKENS", "4096"))
MAX_OUTPUT_TOKENS = int(os.environ.get("QWEN_MAX_OUTPUT_TOKENS", "8192"))
WRAPPER_MARGIN_TOKENS = int(os.environ.get("QWEN_WRAPPER_MARGIN_TOKENS", "128"))
TOOL_MARGIN_TOKENS = int(os.environ.get("QWEN_TOOL_MARGIN_TOKENS", "512"))
NO_TOOL_MARGIN_TOKENS = int(os.environ.get("QWEN_NO_TOOL_MARGIN_TOKENS", "128"))
HEALTH_CACHE_SECONDS = float(os.environ.get("QWEN_HEALTH_CACHE_SECONDS", "2"))
KEEP_ALIVE = os.environ.get("QWEN_KEEP_ALIVE", "24h")
RELEASE_SHA = os.environ.get("QWEN_RELEASE_SHA", "")

if EXPECTED_CONTEXT != 131072:
    raise RuntimeError("QWEN_CONTEXT_LENGTH must remain exactly 131072")
if not (0 <= MAX_QUEUE_DEPTH <= 32):
    raise RuntimeError("QWEN_MAX_QUEUE_DEPTH must be between 0 and 32")


logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
LOG = logging.getLogger(SERVICE)
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,96}$")
_REASONING_MARKER = re.compile(r"<think(?:\s[^>]*)?>", re.IGNORECASE)
_RELEASE_SHA = re.compile(r"^[0-9a-f]{40}$")


class RouteFailure(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        *,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = dict(details or {})


class UpstreamFailure(Exception):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(body)
        self.status = status
        self.body = body[:500]


@dataclass(frozen=True)
class Budget:
    context_window: int
    prompt_tokens: int
    wrapper_margin_tokens: int
    tool_margin_tokens: int
    output_reserve_tokens: int
    total_reserved_tokens: int
    remaining_tokens: int
    tokenizer_source: str = "ollama-prompt-eval"
    template: str = "ollama-qwen35-chat-template"
    truncate: bool = False
    shift: bool = False


@dataclass
class RuntimeState:
    in_system: int = 0
    active: int = 0


STATE = RuntimeState()
STATE_LOCK = asyncio.Lock()
MODEL_SEMAPHORE = asyncio.Semaphore(1)
METRICS: Counter[str] = Counter()
LATENCY_TOTAL: Counter[str] = Counter()
_health_cache: tuple[float, dict[str, Any]] = (0.0, {})
_client = httpx.AsyncClient(
    timeout=httpx.Timeout(
        connect=5.0,
        read=UPSTREAM_TIMEOUT_SECONDS,
        write=30.0,
        pool=5.0,
    )
)


app = FastAPI(title="ECHO FORGE Qwen Route", version=VERSION)


@app.on_event("shutdown")
async def _shutdown() -> None:
    await _client.aclose()


def _request_id(request: Request) -> str:
    candidate = request.headers.get("x-request-id", "")
    if _SAFE_REQUEST_ID.fullmatch(candidate):
        return candidate
    return uuid.uuid4().hex


@app.middleware("http")
async def _request_boundary(request: Request, call_next: Any) -> JSONResponse:
    started = time.perf_counter()
    request_id = _request_id(request)
    request.state.request_id = request_id
    body = await request.body()
    if len(body) > MAX_REQUEST_BYTES:
        response = JSONResponse(
            status_code=413,
            content={
                "ok": False,
                "error": {
                    "code": "request_too_large",
                    "message": "request body exceeds the configured route limit",
                },
            },
        )
    else:
        response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Qwen-Route-Version"] = VERSION
    response.headers["Cache-Control"] = "no-store"
    metric_key = f'{request.method}:{request.url.path}:{response.status_code}'
    METRICS[metric_key] += 1
    LATENCY_TOTAL[f"{request.method}:{request.url.path}"] += int(elapsed_ms)
    LOG.info(
        json.dumps(
            {
                "event": "request_complete",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": elapsed_ms,
                "request_bytes": len(body),
            },
            separators=(",", ":"),
        )
    )
    return response


@app.exception_handler(RouteFailure)
async def _route_failure(request: Request, exc: RouteFailure) -> JSONResponse:
    if request.url.path.startswith("/v1/"):
        payload: dict[str, Any] = {
            "error": {
                "type": exc.code,
                "code": exc.code,
                "message": exc.message,
            }
        }
        if exc.details:
            payload["error"]["details"] = exc.details
    else:
        payload = {
            "ok": False,
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
        }
    return JSONResponse(status_code=exc.status, content=payload)


async def _fetch_json(
    method: str,
    path: str,
    *,
    payload: Mapping[str, Any] | None = None,
    timeout: float | None = None,
) -> dict[str, Any]:
    try:
        response = await _client.request(
            method,
            f"{UPSTREAM}{path}",
            json=payload,
            timeout=timeout or UPSTREAM_TIMEOUT_SECONDS,
        )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise UpstreamFailure(503, f"upstream unreachable: {type(exc).__name__}") from exc
    if response.status_code >= 400:
        raise UpstreamFailure(response.status_code, response.text)
    try:
        data = response.json()
    except ValueError as exc:
        raise UpstreamFailure(502, "upstream returned invalid JSON") from exc
    if not isinstance(data, dict):
        raise UpstreamFailure(502, "upstream returned a non-object JSON value")
    return data


async def _run_command(*argv: str, timeout: float = 5.0) -> tuple[int, str, str]:
    try:
        process = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except (FileNotFoundError, asyncio.TimeoutError) as exc:
        return 127, "", type(exc).__name__
    return process.returncode or 0, stdout.decode(errors="replace"), stderr.decode(errors="replace")


def _parse_parameters(parameters: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for line in parameters.splitlines():
        parts = line.split(None, 1)
        if len(parts) == 2:
            parsed[parts[0]] = parts[1].strip()
    return parsed


async def _container_check() -> dict[str, Any]:
    code, stdout, stderr = await _run_command(
        "docker",
        "inspect",
        "--format",
        "{{.State.Running}}|{{.State.OOMKilled}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
        OLLAMA_CONTAINER,
    )
    value = stdout.strip()
    expected = "true|false|healthy"
    return {
        "ok": code == 0 and value == expected,
        "actual": value or f"inspect_error:{code}",
        "expected": expected,
        "stderr_present": bool(stderr.strip()),
    }


async def _gpu_check() -> dict[str, Any]:
    code, stdout, _ = await _run_command(
        NVIDIA_SMI,
        "--query-compute-apps=gpu_uuid,pid,used_memory",
        "--format=csv,noheader,nounits",
    )
    runner_gpus: set[str] = set()
    runner_pids: set[int] = set()
    if code == 0:
        for line in stdout.splitlines():
            parts = [part.strip() for part in line.split(",")]
            if len(parts) != 3:
                continue
            gpu_uuid, pid_text, memory_text = parts
            try:
                pid = int(pid_text)
                used_memory = int(memory_text)
                command = open(f"/proc/{pid}/cmdline", "rb").read().replace(b"\0", b" ").decode(errors="replace")
            except (OSError, ValueError):
                continue
            if "ollama" in command.lower() and used_memory > 512:
                runner_gpus.add(gpu_uuid)
                runner_pids.add(pid)
    return {
        "ok": code == 0 and len(runner_gpus) == EXPECTED_GPU_COUNT and bool(runner_pids),
        "resident_gpu_count": len(runner_gpus),
        "expected_gpu_count": EXPECTED_GPU_COUNT,
        "runner_process_count": len(runner_pids),
    }


async def _runtime_health(*, use_cache: bool = True) -> dict[str, Any]:
    global _health_cache
    now = time.monotonic()
    if use_cache and now - _health_cache[0] <= HEALTH_CACHE_SECONDS and _health_cache[1]:
        return _health_cache[1]

    checks: dict[str, dict[str, Any]] = {}
    checks["release_identity"] = {
        "ok": _RELEASE_SHA.fullmatch(RELEASE_SHA) is not None,
        "release_sha": RELEASE_SHA or "UNCONFIGURED",
    }
    try:
        tags = await _fetch_json("GET", "/api/tags", timeout=5.0)
        alias = next(
            (item for item in tags.get("models", []) if item.get("name") == MODEL_ALIAS),
            None,
        )
        alias_digest = alias.get("digest") if isinstance(alias, dict) else None
        checks["alias"] = {
            "ok": bool(EXPECTED_ALIAS_DIGEST)
            and alias_digest == EXPECTED_ALIAS_DIGEST,
            "name": MODEL_ALIAS,
            "digest": alias_digest,
            "expected_digest": EXPECTED_ALIAS_DIGEST or "UNCONFIGURED",
        }
        base_artifact = next(
            (item for item in tags.get("models", []) if item.get("name") == BASE_MODEL),
            None,
        )
        base_artifact_digest = (
            base_artifact.get("digest") if isinstance(base_artifact, dict) else None
        )
        checks["base_artifact"] = {
            "ok": base_artifact_digest == EXPECTED_BASE_DIGEST,
            "name": BASE_MODEL,
            "digest": base_artifact_digest,
            "expected_digest": EXPECTED_BASE_DIGEST,
        }

        show = await _fetch_json(
            "POST", "/api/show", payload={"model": MODEL_ALIAS, "verbose": False}, timeout=10.0
        )
        parameters = _parse_parameters(str(show.get("parameters", "")))
        details = show.get("details") if isinstance(show.get("details"), dict) else {}
        checks["model_definition"] = {
            "ok": details.get("parent_model") == BASE_MODEL
            and parameters.get("num_ctx") == str(EXPECTED_CONTEXT),
            "parent_model": details.get("parent_model"),
            "expected_parent_model": BASE_MODEL,
            "context": parameters.get("num_ctx"),
            "expected_context": EXPECTED_CONTEXT,
        }

        ps = await _fetch_json("GET", "/api/ps", timeout=5.0)
        resident = next(
            (
                item
                for item in ps.get("models", [])
                if item.get("digest") == EXPECTED_ALIAS_DIGEST
            ),
            None,
        )
        resident_ok = isinstance(resident, dict)
        if resident_ok:
            resident_size = resident.get("size")
            resident_vram = resident.get("size_vram")
            resident_ok = (
                resident.get("name") == MODEL_ALIAS
                and resident.get("context_length") == EXPECTED_CONTEXT
                and isinstance(resident_size, int)
                and resident_size > 0
                and resident_vram == resident_size
            )
        checks["resident_model"] = {
            "ok": resident_ok,
            "name": resident.get("name") if isinstance(resident, dict) else None,
            "digest": resident.get("digest") if isinstance(resident, dict) else None,
            "expected_digest": EXPECTED_ALIAS_DIGEST or "UNCONFIGURED",
            "context": resident.get("context_length") if isinstance(resident, dict) else None,
            "expected_context": EXPECTED_CONTEXT,
            "size": resident.get("size") if isinstance(resident, dict) else None,
            "size_vram": resident.get("size_vram") if isinstance(resident, dict) else None,
            "fully_gpu_resident": bool(
                isinstance(resident, dict)
                and resident.get("size") == resident.get("size_vram")
            ),
        }
    except UpstreamFailure as exc:
        checks["ollama"] = {
            "ok": False,
            "status": exc.status,
            "reason": exc.body,
        }

    checks["container"] = await _container_check()
    checks["gpu_processes"] = await _gpu_check()
    ok = all(check.get("ok") is True for check in checks.values())
    payload = {
        "ok": ok,
        "status": "ready" if ok else "unavailable",
        "service": SERVICE,
        "version": VERSION,
        "route": "forge-local-qwen",
        "upstream": "127.0.0.1:11438",
        "model": MODEL_ALIAS,
        "base_model": BASE_MODEL,
        "base_digest": f"sha256:{EXPECTED_BASE_DIGEST}",
        "context_length": EXPECTED_CONTEXT,
        "resident": checks.get("resident_model", {}).get("ok") is True,
        "truncate": False,
        "shift": False,
        "release_sha": RELEASE_SHA,
        "checks": checks,
        "queue": {
            "active": STATE.active,
            "depth": max(0, STATE.in_system - STATE.active),
            "max_depth": MAX_QUEUE_DEPTH,
        },
    }
    _health_cache = (now, payload)
    return payload


@asynccontextmanager
async def _single_flight() -> AsyncIterator[None]:
    async with STATE_LOCK:
        if STATE.in_system >= 1 + MAX_QUEUE_DEPTH:
            METRICS["queue_rejected"] += 1
            raise RouteFailure(
                429,
                "queue_full",
                "the single Qwen runner and its bounded queue are full",
                details={"max_queue_depth": MAX_QUEUE_DEPTH, "retry_after_seconds": 5},
            )
        STATE.in_system += 1
    acquired = False
    try:
        try:
            await asyncio.wait_for(MODEL_SEMAPHORE.acquire(), timeout=QUEUE_WAIT_SECONDS)
            acquired = True
        except asyncio.TimeoutError as exc:
            raise RouteFailure(
                503,
                "queue_timeout",
                "the request expired before the Qwen runner became available",
            ) from exc
        async with STATE_LOCK:
            STATE.active = 1
        yield
    finally:
        async with STATE_LOCK:
            STATE.in_system = max(0, STATE.in_system - 1)
            STATE.active = 0
        if acquired:
            MODEL_SEMAPHORE.release()


def _normalize_messages(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise RouteFailure(400, "invalid_messages", "messages must be a non-empty array")
    normalized: list[dict[str, Any]] = []
    allowed = {"system", "user", "assistant", "tool"}
    for index, message in enumerate(value):
        if not isinstance(message, dict):
            raise RouteFailure(400, "invalid_messages", f"message {index} must be an object")
        role = message.get("role")
        content = message.get("content")
        if role not in allowed or not isinstance(content, str):
            raise RouteFailure(
                400,
                "invalid_messages",
                f"message {index} requires an allowed role and string content",
            )
        normalized_message: dict[str, Any] = {"role": role, "content": content}
        if role == "assistant" and message.get("tool_calls") is not None:
            raw_calls = message.get("tool_calls")
            if not isinstance(raw_calls, list):
                raise RouteFailure(400, "invalid_messages", f"message {index} tool_calls must be an array")
            calls: list[dict[str, Any]] = []
            for raw_call in raw_calls:
                if not isinstance(raw_call, dict) or not isinstance(raw_call.get("function"), dict):
                    raise RouteFailure(400, "invalid_messages", f"message {index} has an invalid tool call")
                function = raw_call["function"]
                name = function.get("name")
                arguments = function.get("arguments", {})
                if not isinstance(name, str):
                    raise RouteFailure(400, "invalid_messages", f"message {index} tool name is invalid")
                if isinstance(arguments, str):
                    try:
                        arguments = json.loads(arguments)
                    except json.JSONDecodeError as exc:
                        raise RouteFailure(
                            400,
                            "invalid_messages",
                            f"message {index} tool arguments are not valid JSON",
                        ) from exc
                if not isinstance(arguments, dict):
                    raise RouteFailure(400, "invalid_messages", f"message {index} tool arguments must be an object")
                calls.append({"function": {"name": name, "arguments": arguments}})
            normalized_message["tool_calls"] = calls
        if role == "tool":
            tool_name = message.get("tool_name", message.get("name"))
            if tool_name is not None:
                if not isinstance(tool_name, str):
                    raise RouteFailure(400, "invalid_messages", f"message {index} tool name is invalid")
                normalized_message["tool_name"] = tool_name
        normalized.append(normalized_message)
    return normalized


def _normalize_tools(value: Any) -> list[dict[str, Any]]:
    if value in (None, []):
        return []
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise RouteFailure(400, "invalid_tools", "tools must be an array of JSON objects")
    # Round-trip strips non-JSON objects and gives deterministic canonicalization.
    try:
        return json.loads(json.dumps(value, separators=(",", ":"), sort_keys=True))
    except (TypeError, ValueError) as exc:
        raise RouteFailure(400, "invalid_tools", "tools must contain only JSON values") from exc


def _route_messages(messages: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "role": "system",
            "content": (
                "Operate in nonthinking mode. Do not emit hidden reasoning or chain-of-thought. "
                "Return only the final answer."
            ),
        },
        *[dict(message) for message in messages],
    ]


def _output_tokens(value: Any) -> int:
    if value is None:
        return DEFAULT_OUTPUT_TOKENS
    if isinstance(value, bool) or not isinstance(value, int):
        raise RouteFailure(400, "invalid_max_tokens", "max_tokens must be an integer")
    if value < 1 or value > MAX_OUTPUT_TOKENS:
        raise RouteFailure(
            400,
            "invalid_max_tokens",
            f"max_tokens must be between 1 and {MAX_OUTPUT_TOKENS}",
        )
    return value


def _ollama_error(exc: UpstreamFailure, *, phase: str) -> RouteFailure:
    lowered = exc.body.lower()
    if exc.status in {400, 413} and any(
        marker in lowered for marker in ("context", "token", "too long", "input length")
    ):
        return RouteFailure(
            413,
            "context_overflow",
            "the exact Ollama tokenizer rejected the prompt with truncation disabled",
            details={"phase": phase, "truncate": False, "shift": False},
        )
    status = 503 if exc.status >= 500 else 502
    return RouteFailure(
        status,
        "upstream_failure",
        "the local Qwen runtime failed closed",
        details={"phase": phase, "upstream_status": exc.status},
    )


async def _preflight(
    messages: Sequence[Mapping[str, Any]],
    *,
    tools: Sequence[Mapping[str, Any]],
    output_reserve_tokens: int,
) -> Budget:
    request = {
        "model": MODEL_ALIAS,
        "messages": list(messages),
        "tools": list(tools),
        "stream": False,
        "think": False,
        "truncate": False,
        "shift": False,
        "keep_alive": KEEP_ALIVE,
        "options": {
            "num_ctx": EXPECTED_CONTEXT,
            "num_predict": 1,
            "temperature": 0,
            "seed": 42,
            "stop": ["<|im_end|>"],
        },
    }
    try:
        result = await _fetch_json("POST", "/api/chat", payload=request)
    except UpstreamFailure as exc:
        raise _ollama_error(exc, phase="token_preflight") from exc
    prompt_tokens = result.get("prompt_eval_count")
    if isinstance(prompt_tokens, bool) or not isinstance(prompt_tokens, int) or prompt_tokens < 1:
        raise RouteFailure(
            502,
            "missing_token_count",
            "Ollama did not return its authoritative prompt_eval_count",
        )
    tool_margin = TOOL_MARGIN_TOKENS if tools else NO_TOOL_MARGIN_TOKENS
    total = prompt_tokens + WRAPPER_MARGIN_TOKENS + tool_margin + output_reserve_tokens
    budget = Budget(
        context_window=EXPECTED_CONTEXT,
        prompt_tokens=prompt_tokens,
        wrapper_margin_tokens=WRAPPER_MARGIN_TOKENS,
        tool_margin_tokens=tool_margin,
        output_reserve_tokens=output_reserve_tokens,
        total_reserved_tokens=total,
        remaining_tokens=EXPECTED_CONTEXT - total,
    )
    if total > EXPECTED_CONTEXT:
        METRICS["budget_rejected"] += 1
        raise RouteFailure(
            413,
            "token_budget_exceeded",
            "prompt plus explicit wrapper, tool, and output reserves exceeds 131072 tokens",
            details=asdict(budget),
        )
    return budget


async def _generate(
    messages: Sequence[Mapping[str, Any]],
    tools: Sequence[Mapping[str, Any]],
    budget: Budget,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    native_options = body.get("options", {})
    if not isinstance(native_options, dict):
        raise RouteFailure(400, "invalid_options", "options must be an object")
    temperature = body.get("temperature", native_options.get("temperature", 0.2))
    top_p = body.get("top_p", native_options.get("top_p", 0.8))
    seed = body.get("seed", native_options.get("seed", 0))
    if isinstance(temperature, bool) or not isinstance(temperature, (int, float)) or not 0 <= float(temperature) <= 2:
        raise RouteFailure(400, "invalid_temperature", "temperature must be between 0 and 2")
    if isinstance(top_p, bool) or not isinstance(top_p, (int, float)) or not 0 < float(top_p) <= 1:
        raise RouteFailure(400, "invalid_top_p", "top_p must be greater than 0 and at most 1")
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise RouteFailure(400, "invalid_seed", "seed must be an integer")
    request = {
        "model": MODEL_ALIAS,
        "messages": list(messages),
        "tools": list(tools),
        "stream": False,
        "think": False,
        "truncate": False,
        "shift": False,
        "keep_alive": KEEP_ALIVE,
        "options": {
            "num_ctx": EXPECTED_CONTEXT,
            "num_predict": budget.output_reserve_tokens,
            "temperature": float(temperature),
            "top_p": float(top_p),
            "seed": seed,
            "stop": ["<|im_end|>"],
        },
    }
    try:
        result = await _fetch_json("POST", "/api/chat", payload=request)
    except UpstreamFailure as exc:
        raise _ollama_error(exc, phase="generation") from exc
    actual_prompt_tokens = result.get("prompt_eval_count")
    if actual_prompt_tokens != budget.prompt_tokens:
        raise RouteFailure(
            502,
            "token_count_drift",
            "generation token count differed from the exact preflight count",
            details={"preflight": budget.prompt_tokens, "generation": actual_prompt_tokens},
        )
    message = result.get("message")
    if not isinstance(message, dict):
        raise RouteFailure(502, "invalid_generation", "Ollama returned no assistant message")
    answer = message.get("content", "")
    tool_calls = message.get("tool_calls", [])
    if not isinstance(answer, str) or not isinstance(tool_calls, list):
        raise RouteFailure(502, "invalid_generation", "Ollama returned an invalid assistant message")
    if not answer and not tool_calls:
        raise RouteFailure(502, "invalid_generation", "Ollama returned neither text nor a tool call")
    if _REASONING_MARKER.search(answer):
        raise RouteFailure(
            502,
            "reasoning_contract_violation",
            "the model emitted a reasoning block despite the nonthinking contract",
        )
    result["route_budget"] = asdict(budget)
    result["route_truncated"] = False
    result["route_shifted"] = False
    return result


def _require_route_contract(body: Mapping[str, Any], *, openai: bool) -> None:
    model = body.get("model", MODEL_ALIAS)
    if model != MODEL_ALIAS:
        raise RouteFailure(
            400,
            "wrong_model",
            "this route accepts only its exact stable FORGE-local model alias",
            details={"expected_model": MODEL_ALIAS},
        )
    if body.get("stream", False) is not False:
        raise RouteFailure(400, "stream_not_supported", "streaming is not supported by this governed route")
    if body.get("truncate") is True or body.get("shift") is True:
        raise RouteFailure(
            400,
            "truncation_forbidden",
            "truncate and shift are forced false; silent context loss is forbidden",
        )
    if openai:
        reasoning_effort = body.get("reasoning_effort", "none")
        if reasoning_effort not in (None, "none"):
            raise RouteFailure(
                400,
                "reasoning_not_supported",
                "reasoning_effort must be none for the nonthinking Qwen route",
            )
    elif body.get("think", False) is not False:
        raise RouteFailure(400, "thinking_not_supported", "think must be false")


async def _execute(body: Mapping[str, Any], *, openai: bool, budget_only: bool = False) -> tuple[dict[str, Any] | None, Budget]:
    _require_route_contract(body, openai=openai)
    messages = _normalize_messages(body.get("messages"))
    tools = _normalize_tools(body.get("tools"))
    max_tokens = body.get("max_completion_tokens", body.get("max_tokens"))
    if not openai:
        if body.get("options") is not None and not isinstance(body.get("options"), dict):
            raise RouteFailure(400, "invalid_options", "options must be an object")
        options = body.get("options") if isinstance(body.get("options"), dict) else {}
        max_tokens = options.get("num_predict", max_tokens)
    output_reserve = _output_tokens(max_tokens)
    routed_messages = _route_messages(messages)
    health = await _runtime_health(use_cache=False)
    if not health["ok"]:
        raise RouteFailure(
            503,
            "runtime_unavailable",
            "the exact Qwen model is not ready and fully resident on both GPUs",
            details={"checks": health["checks"]},
        )
    async with _single_flight():
        budget = await _preflight(
            routed_messages,
            tools=tools,
            output_reserve_tokens=output_reserve,
        )
        if budget_only:
            return None, budget
        return await _generate(routed_messages, tools, budget, body), budget


def _budget_headers(budget: Budget) -> dict[str, str]:
    return {
        "X-Qwen-Model-Digest": EXPECTED_BASE_DIGEST,
        "X-Qwen-Context-Length": str(EXPECTED_CONTEXT),
        "X-Qwen-Prompt-Tokens": str(budget.prompt_tokens),
        "X-Qwen-Reserved-Tokens": str(budget.total_reserved_tokens),
        "X-Qwen-Truncated": "false",
        "X-Qwen-Shifted": "false",
    }


def _openai_message(message: Mapping[str, Any], request_id: str) -> dict[str, Any]:
    converted: dict[str, Any] = {
        "role": "assistant",
        "content": message.get("content", ""),
    }
    raw_calls = message.get("tool_calls", [])
    if isinstance(raw_calls, list) and raw_calls:
        calls: list[dict[str, Any]] = []
        for index, raw_call in enumerate(raw_calls):
            if not isinstance(raw_call, dict):
                raise RouteFailure(502, "invalid_tool_call", "Ollama returned an invalid tool call")
            function = raw_call.get("function")
            if not isinstance(function, dict) or not isinstance(function.get("name"), str):
                raise RouteFailure(502, "invalid_tool_call", "Ollama returned an invalid tool function")
            arguments = function.get("arguments", {})
            if not isinstance(arguments, str):
                arguments = json.dumps(arguments, separators=(",", ":"), sort_keys=True)
            calls.append(
                {
                    "id": f"call_{request_id}_{index}",
                    "type": "function",
                    "function": {"name": function["name"], "arguments": arguments},
                }
            )
        converted["tool_calls"] = calls
    return converted


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except (ValueError, json.JSONDecodeError) as exc:
        raise RouteFailure(400, "invalid_json", "request body must be valid JSON") from exc
    if not isinstance(body, dict):
        raise RouteFailure(400, "invalid_request", "request body must be an object")
    return body


@app.get("/livez")
async def livez() -> dict[str, Any]:
    return {"ok": True, "status": "alive", "service": SERVICE, "version": VERSION}


@app.get("/health")
@app.get("/ready")
async def health() -> JSONResponse:
    payload = await _runtime_health(use_cache=False)
    return JSONResponse(status_code=200 if payload["ok"] else 503, content=payload)


@app.get("/v1/models")
async def models() -> JSONResponse:
    payload = await _runtime_health()
    if not payload["ok"]:
        raise RouteFailure(503, "runtime_unavailable", "the exact local model is unavailable")
    return JSONResponse(
        {
            "object": "list",
            "data": [
                {
                    "id": MODEL_ALIAS,
                    "object": "model",
                    "owned_by": "echo-forge-local",
                    "context_window": EXPECTED_CONTEXT,
                    "digest": EXPECTED_BASE_DIGEST,
                    "reasoning": False,
                }
            ],
        }
    )


@app.post("/v1/token-budget")
async def token_budget(request: Request) -> JSONResponse:
    body = await _json_body(request)
    _, budget = await _execute(body, openai=True, budget_only=True)
    return JSONResponse(
        {"ok": True, "model": MODEL_ALIAS, "budget": asdict(budget)},
        headers=_budget_headers(budget),
    )


@app.post("/api/chat")
async def native_chat(request: Request) -> JSONResponse:
    body = await _json_body(request)
    result, budget = await _execute(body, openai=False)
    assert result is not None
    payload = {
        "model": MODEL_ALIAS,
        "created_at": result.get("created_at"),
        "message": result["message"],
        "done": result.get("done", True),
        "done_reason": result.get("done_reason", "stop"),
        "prompt_eval_count": result.get("prompt_eval_count"),
        "eval_count": result.get("eval_count"),
        "load_duration": result.get("load_duration"),
        "prompt_eval_duration": result.get("prompt_eval_duration"),
        "eval_duration": result.get("eval_duration"),
        "total_duration": result.get("total_duration"),
        "route": {
            "provider": "ollama-local-forge",
            "base_model": BASE_MODEL,
            "base_digest": EXPECTED_BASE_DIGEST,
            "budget": asdict(budget),
            "reasoning_effort": "none",
            "truncated": False,
            "shifted": False,
        },
    }
    return JSONResponse(payload, headers=_budget_headers(budget))


@app.post("/v1/chat/completions")
async def openai_chat(request: Request) -> JSONResponse:
    body = await _json_body(request)
    result, budget = await _execute(body, openai=True)
    assert result is not None
    eval_count = int(result.get("eval_count") or 0)
    message = _openai_message(result["message"], request.state.request_id)
    if message.get("tool_calls"):
        finish_reason = "tool_calls"
    else:
        finish_reason = "length" if result.get("done_reason") == "length" else "stop"
    payload = {
        "id": f"chatcmpl-{request.state.request_id}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": MODEL_ALIAS,
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": finish_reason,
            }
        ],
        "usage": {
            "prompt_tokens": budget.prompt_tokens,
            "completion_tokens": eval_count,
            "total_tokens": budget.prompt_tokens + eval_count,
        },
        "route_metadata": {
            "provider": "ollama-local-forge",
            "base_model": BASE_MODEL,
            "base_digest": EXPECTED_BASE_DIGEST,
            "context_window": EXPECTED_CONTEXT,
            "budget": asdict(budget),
            "reasoning_effort": "none",
            "truncated": False,
            "shifted": False,
        },
    }
    return JSONResponse(payload, headers=_budget_headers(budget))


@app.get("/metrics")
async def metrics() -> PlainTextResponse:
    lines = [
        "# HELP echo_qwen_route_requests_total Requests by method, path, and status.",
        "# TYPE echo_qwen_route_requests_total counter",
    ]
    for key, value in sorted(METRICS.items()):
        if key.count(":") == 2:
            method, path, status = key.split(":", 2)
            lines.append(
                f'echo_qwen_route_requests_total{{method="{method}",path="{path}",status="{status}"}} {value}'
            )
    lines.extend(
        [
            "# HELP echo_qwen_route_queue_depth Requests waiting for the single runner.",
            "# TYPE echo_qwen_route_queue_depth gauge",
            f"echo_qwen_route_queue_depth {max(0, STATE.in_system - STATE.active)}",
            "# HELP echo_qwen_route_active_requests Active model requests.",
            "# TYPE echo_qwen_route_active_requests gauge",
            f"echo_qwen_route_active_requests {STATE.active}",
            f"echo_qwen_route_queue_rejected_total {METRICS['queue_rejected']}",
            f"echo_qwen_route_budget_rejected_total {METRICS['budget_rejected']}",
        ]
    )
    return PlainTextResponse("\n".join(lines) + "\n")
