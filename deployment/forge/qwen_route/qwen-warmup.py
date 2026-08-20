#!/usr/bin/env python3
"""Load and verify the exact model before the governed route starts."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request


UPSTREAM = os.environ.get("QWEN_UPSTREAM", "http://127.0.0.1:11436").rstrip("/")
MODEL = os.environ.get("QWEN_MODEL_ALIAS", "c3po-code:echo-abliterated-128k")
DIGEST = os.environ.get(
    "QWEN_BASE_DIGEST",
    "418838acbea7dad6eca43e2f74519307235e62b584e08ab7a6e7d6916cff7507",
)
ALIAS_DIGEST = os.environ.get("QWEN_ALIAS_DIGEST", "")
CONTEXT = int(os.environ.get("QWEN_CONTEXT_LENGTH", "131072"))


def request(path: str, body: dict | None = None, timeout: float = 1200) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"{UPSTREAM}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="GET" if body is None else "POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        value = json.load(response)
    if not isinstance(value, dict):
        raise RuntimeError(f"{path} returned a non-object")
    return value


deadline = time.monotonic() + 180
while True:
    try:
        request("/api/tags", timeout=5)
        break
    except (OSError, urllib.error.URLError):
        if time.monotonic() >= deadline:
            raise SystemExit("QWEN_WARMUP_UPSTREAM_UNREACHABLE")
        time.sleep(2)

result = request(
    "/api/chat",
    {
        "model": MODEL,
        "messages": [{"role": "user", "content": "health probe"}],
        "stream": False,
        "think": False,
        "truncate": False,
        "shift": False,
        "keep_alive": "24h",
        "options": {
            "num_ctx": CONTEXT,
            "num_predict": 1,
            "temperature": 0,
            "seed": 42,
        },
    },
)
if not isinstance(result.get("prompt_eval_count"), int):
    raise SystemExit("QWEN_WARMUP_TOKEN_COUNT_MISSING")

tags = request("/api/tags", timeout=10).get("models", [])
base_artifact = next((item for item in tags if item.get("name") == "huihui_ai/Qwen3.6-abliterated:27b"), None)
alias_artifact = next((item for item in tags if item.get("name") == MODEL), None)
if not isinstance(base_artifact, dict) or base_artifact.get("digest") != DIGEST:
    raise SystemExit("QWEN_WARMUP_BASE_DIGEST_MISMATCH")
if not ALIAS_DIGEST or not isinstance(alias_artifact, dict) or alias_artifact.get("digest") != ALIAS_DIGEST:
    raise SystemExit("QWEN_WARMUP_ALIAS_DIGEST_MISMATCH")

resident = next(
    (
        item
        for item in request("/api/ps", timeout=10).get("models", [])
        if item.get("digest") == ALIAS_DIGEST
    ),
    None,
)
if not isinstance(resident, dict):
    raise SystemExit("QWEN_WARMUP_EXACT_MODEL_NOT_RESIDENT")
if resident.get("context_length") != CONTEXT:
    raise SystemExit("QWEN_WARMUP_CONTEXT_MISMATCH")
resident_size = resident.get("size")
resident_vram = resident.get("size_vram")
if not isinstance(resident_size, int) or resident_size <= 0 or resident_vram != resident_size:
    raise SystemExit("QWEN_WARMUP_GPU_RESIDENCY_MISMATCH")
print(
    "QWEN_WARM_READY "
    f"base_digest={DIGEST} alias_digest={ALIAS_DIGEST} "
    f"context={CONTEXT} size={resident_size} size_vram={resident_vram}"
)
