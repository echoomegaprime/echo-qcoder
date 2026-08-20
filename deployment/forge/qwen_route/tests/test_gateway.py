from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


try:
    import fastapi  # noqa: F401
    import httpx  # noqa: F401
except ModuleNotFoundError:
    class _DummyApp:
        def __init__(self, *_: object, **__: object) -> None:
            pass

        def _decorator(self, *_: object, **__: object):
            return lambda function: function

        on_event = middleware = exception_handler = get = post = _decorator

    class _DummyResponse:
        def __init__(self, content: object = None, status_code: int = 200, headers: dict | None = None) -> None:
            self.content = content
            self.status_code = status_code
            self.headers = headers or {}

    class _DummyClient:
        def __init__(self, *_: object, **__: object) -> None:
            pass

        async def aclose(self) -> None:
            pass

    fastapi_stub = types.ModuleType("fastapi")
    fastapi_stub.FastAPI = _DummyApp
    fastapi_stub.Request = object
    responses_stub = types.ModuleType("fastapi.responses")
    responses_stub.JSONResponse = _DummyResponse
    responses_stub.PlainTextResponse = _DummyResponse
    httpx_stub = types.ModuleType("httpx")
    httpx_stub.AsyncClient = _DummyClient
    httpx_stub.Timeout = lambda *args, **kwargs: None
    httpx_stub.TimeoutException = TimeoutError
    httpx_stub.NetworkError = OSError
    sys.modules["fastapi"] = fastapi_stub
    sys.modules["fastapi.responses"] = responses_stub
    sys.modules["httpx"] = httpx_stub


APP_PATH = Path(__file__).resolve().parents[1] / "app.py"
SPEC = importlib.util.spec_from_file_location("echo_qwen_route_app", APP_PATH)
assert SPEC and SPEC.loader
gateway = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = gateway
SPEC.loader.exec_module(gateway)


def healthy_payload() -> dict:
    return {"ok": True, "checks": {"resident_model": {"ok": True}}}


class GatewayContractTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        gateway.STATE.in_system = 0
        gateway.STATE.active = 0
        gateway.EXPECTED_ALIAS_DIGEST = "a" * 64
        gateway.RELEASE_SHA = "f" * 40

    async def test_native_execution_forces_exact_nontruncating_contract(self) -> None:
        calls: list[dict] = []

        async def fake_fetch(method: str, path: str, **kwargs: object) -> dict:
            self.assertEqual(path, "/api/chat")
            payload = kwargs["payload"]
            assert isinstance(payload, dict)
            calls.append(payload)
            if len(calls) == 1:
                return {"prompt_eval_count": 100, "message": {"role": "assistant", "content": "x"}, "eval_count": 1}
            return {
                "prompt_eval_count": 100,
                "message": {"role": "assistant", "content": "OK"},
                "eval_count": 1,
                "done": True,
                "done_reason": "stop",
            }

        body = {
            "model": gateway.MODEL_ALIAS,
            "messages": [{"role": "user", "content": "Reply OK"}],
            "stream": False,
            "think": False,
            "options": {"num_predict": 32},
        }
        with (
            patch.object(gateway, "_runtime_health", AsyncMock(return_value=healthy_payload())),
            patch.object(gateway, "_fetch_json", side_effect=fake_fetch),
        ):
            result, budget = await gateway._execute(body, openai=False)

        self.assertEqual(result["message"]["content"], "OK")
        self.assertEqual(budget.prompt_tokens, 100)
        self.assertEqual(budget.output_reserve_tokens, 32)
        self.assertEqual(len(calls), 2)
        for payload in calls:
            self.assertIs(payload["truncate"], False)
            self.assertIs(payload["shift"], False)
            self.assertIs(payload["think"], False)
            self.assertEqual(payload["options"]["num_ctx"], 131072)
            self.assertEqual(payload["messages"], calls[0]["messages"])
        self.assertEqual(calls[0]["options"]["num_predict"], 1)
        self.assertEqual(calls[1]["options"]["num_predict"], 32)

    async def test_openai_requires_reasoning_effort_none(self) -> None:
        with self.assertRaises(gateway.RouteFailure) as caught:
            gateway._require_route_contract(
                {
                    "model": gateway.MODEL_ALIAS,
                    "stream": False,
                    "reasoning_effort": "high",
                },
                openai=True,
            )
        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(caught.exception.code, "reasoning_not_supported")

    async def test_openai_tool_history_and_tool_calls_are_preserved(self) -> None:
        normalized = gateway._normalize_messages(
            [
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call_external",
                            "type": "function",
                            "function": {"name": "lookup", "arguments": '{"key":"value"}'},
                        }
                    ],
                },
                {"role": "tool", "name": "lookup", "content": "result"},
            ]
        )
        self.assertEqual(normalized[0]["tool_calls"][0]["function"]["arguments"], {"key": "value"})
        self.assertEqual(normalized[1]["tool_name"], "lookup")
        converted = gateway._openai_message(
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [{"function": {"name": "lookup", "arguments": {"key": "value"}}}],
            },
            "request123",
        )
        self.assertEqual(converted["tool_calls"][0]["function"]["arguments"], '{"key":"value"}')

    async def test_wrong_model_is_explicit_400(self) -> None:
        with self.assertRaises(gateway.RouteFailure) as caught:
            gateway._require_route_contract(
                {"model": "cloud/qwen", "stream": False, "reasoning_effort": "none"},
                openai=True,
            )
        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(caught.exception.code, "wrong_model")

    async def test_exact_preflight_rejects_reserved_budget_overflow(self) -> None:
        with patch.object(
            gateway,
            "_fetch_json",
            AsyncMock(return_value={"prompt_eval_count": 127000, "eval_count": 1}),
        ):
            with self.assertRaises(gateway.RouteFailure) as caught:
                await gateway._preflight(
                    [{"role": "user", "content": "large prompt"}],
                    tools=[{"type": "function"}],
                    output_reserve_tokens=4096,
                )
        self.assertEqual(caught.exception.status, 413)
        self.assertEqual(caught.exception.code, "token_budget_exceeded")
        details = caught.exception.details
        self.assertEqual(details["prompt_tokens"], 127000)
        self.assertEqual(details["wrapper_margin_tokens"], 128)
        self.assertEqual(details["tool_margin_tokens"], 512)
        self.assertEqual(details["output_reserve_tokens"], 4096)
        self.assertFalse(details["truncate"])
        self.assertFalse(details["shift"])

    async def test_generation_token_count_drift_fails_closed(self) -> None:
        budget = gateway.Budget(
            context_window=131072,
            prompt_tokens=100,
            wrapper_margin_tokens=128,
            tool_margin_tokens=128,
            output_reserve_tokens=16,
            total_reserved_tokens=372,
            remaining_tokens=130700,
        )
        with patch.object(
            gateway,
            "_fetch_json",
            AsyncMock(
                return_value={
                    "prompt_eval_count": 101,
                    "message": {"role": "assistant", "content": "OK"},
                }
            ),
        ):
            with self.assertRaises(gateway.RouteFailure) as caught:
                await gateway._generate([{"role": "user", "content": "prompt"}], [], budget, {})
        self.assertEqual(caught.exception.code, "token_count_drift")
        self.assertEqual(caught.exception.status, 502)

    async def test_reasoning_marker_fails_closed_instead_of_leaking(self) -> None:
        budget = gateway.Budget(
            context_window=131072,
            prompt_tokens=100,
            wrapper_margin_tokens=128,
            tool_margin_tokens=128,
            output_reserve_tokens=16,
            total_reserved_tokens=372,
            remaining_tokens=130700,
        )
        with patch.object(
            gateway,
            "_fetch_json",
            AsyncMock(
                return_value={
                    "prompt_eval_count": 100,
                    "message": {"role": "assistant", "content": "<think>hidden</think>OK"},
                }
            ),
        ):
            with self.assertRaises(gateway.RouteFailure) as caught:
                await gateway._generate([{"role": "user", "content": "prompt"}], [], budget, {})
        self.assertEqual(caught.exception.code, "reasoning_contract_violation")

    async def test_single_active_request_has_bounded_backpressure(self) -> None:
        gateway.STATE.in_system = 1 + gateway.MAX_QUEUE_DEPTH
        with self.assertRaises(gateway.RouteFailure) as caught:
            async with gateway._single_flight():
                self.fail("full queue must not admit a request")
        self.assertEqual(caught.exception.status, 429)
        self.assertEqual(caught.exception.code, "queue_full")

    async def test_health_is_red_for_wrong_resident_digest(self) -> None:
        async def fake_fetch(method: str, path: str, **_: object) -> dict:
            if path == "/api/tags":
                return {
                    "models": [
                        {"name": gateway.MODEL_ALIAS, "digest": "a" * 64},
                        {"name": gateway.BASE_MODEL, "digest": gateway.EXPECTED_BASE_DIGEST},
                    ]
                }
            if path == "/api/show":
                return {
                    "details": {"parent_model": gateway.BASE_MODEL},
                    "parameters": "num_ctx 131072",
                }
            if path == "/api/ps":
                return {
                    "models": [
                        {
                            "name": gateway.MODEL_ALIAS,
                            "digest": "b" * 64,
                            "context_length": 131072,
                            "size": gateway.EXPECTED_MODEL_BYTES,
                            "size_vram": gateway.EXPECTED_MODEL_BYTES,
                        }
                    ]
                }
            raise AssertionError(path)

        with (
            patch.object(gateway, "_fetch_json", side_effect=fake_fetch),
            patch.object(gateway, "_container_check", AsyncMock(return_value={"ok": True})),
            patch.object(gateway, "_gpu_check", AsyncMock(return_value={"ok": True})),
        ):
            result = await gateway._runtime_health(use_cache=False)
        self.assertFalse(result["ok"])
        self.assertFalse(result["checks"]["resident_model"]["ok"])
        self.assertEqual(result["base_model"], gateway.BASE_MODEL)
        self.assertEqual(
            result["base_digest"], f"sha256:{gateway.EXPECTED_BASE_DIGEST}"
        )
        self.assertEqual(result["context_length"], 131072)
        self.assertFalse(result["resident"])
        self.assertIs(result["truncate"], False)
        self.assertIs(result["shift"], False)
        self.assertEqual(result["release_sha"], "f" * 40)

    async def test_health_is_red_for_missing_release_identity(self) -> None:
        async def fake_fetch(method: str, path: str, **_: object) -> dict:
            if path == "/api/tags":
                return {
                    "models": [
                        {
                            "name": gateway.MODEL_ALIAS,
                            "digest": gateway.EXPECTED_ALIAS_DIGEST,
                        },
                        {
                            "name": gateway.BASE_MODEL,
                            "digest": gateway.EXPECTED_BASE_DIGEST,
                        },
                    ]
                }
            if path == "/api/show":
                return {
                    "details": {"parent_model": gateway.BASE_MODEL},
                    "parameters": "num_ctx 131072",
                }
            if path == "/api/ps":
                return {
                    "models": [
                        {
                            "name": gateway.MODEL_ALIAS,
                            "digest": gateway.EXPECTED_ALIAS_DIGEST,
                            "context_length": 131072,
                            "size": gateway.EXPECTED_MODEL_BYTES,
                            "size_vram": gateway.EXPECTED_MODEL_BYTES,
                        }
                    ]
                }
            raise AssertionError(path)

        with (
            patch.object(gateway, "RELEASE_SHA", ""),
            patch.object(gateway, "_fetch_json", side_effect=fake_fetch),
            patch.object(
                gateway, "_container_check", AsyncMock(return_value={"ok": True})
            ),
            patch.object(gateway, "_gpu_check", AsyncMock(return_value={"ok": True})),
        ):
            result = await gateway._runtime_health(use_cache=False)
        self.assertFalse(result["ok"])
        self.assertFalse(result["checks"]["release_identity"]["ok"])
        self.assertEqual(result["checks"]["release_identity"]["release_sha"], "UNCONFIGURED")

    async def test_health_is_red_when_model_is_cold_or_unloaded(self) -> None:
        async def fake_fetch(method: str, path: str, **_: object) -> dict:
            if path == "/api/tags":
                return {
                    "models": [
                        {"name": gateway.MODEL_ALIAS, "digest": gateway.EXPECTED_ALIAS_DIGEST},
                        {"name": gateway.BASE_MODEL, "digest": gateway.EXPECTED_BASE_DIGEST},
                    ]
                }
            if path == "/api/show":
                return {
                    "details": {"parent_model": gateway.BASE_MODEL},
                    "parameters": "num_ctx 131072",
                }
            if path == "/api/ps":
                return {"models": []}
            raise AssertionError(path)

        with (
            patch.object(gateway, "_fetch_json", side_effect=fake_fetch),
            patch.object(gateway, "_container_check", AsyncMock(return_value={"ok": True})),
            patch.object(gateway, "_gpu_check", AsyncMock(return_value={"ok": True})),
        ):
            result = await gateway._runtime_health(use_cache=False)
        self.assertFalse(result["ok"])
        self.assertFalse(result["checks"]["resident_model"]["ok"])

    async def test_health_is_red_for_wrong_gpu_placement(self) -> None:
        async def fake_fetch(method: str, path: str, **_: object) -> dict:
            if path == "/api/tags":
                return {
                    "models": [
                        {"name": gateway.MODEL_ALIAS, "digest": gateway.EXPECTED_ALIAS_DIGEST},
                        {"name": gateway.BASE_MODEL, "digest": gateway.EXPECTED_BASE_DIGEST},
                    ]
                }
            if path == "/api/show":
                return {
                    "details": {"parent_model": gateway.BASE_MODEL},
                    "parameters": "num_ctx 131072",
                }
            if path == "/api/ps":
                return {
                    "models": [
                        {
                            "name": gateway.MODEL_ALIAS,
                            "digest": gateway.EXPECTED_ALIAS_DIGEST,
                            "context_length": 131072,
                            "size": gateway.EXPECTED_MODEL_BYTES,
                            "size_vram": gateway.EXPECTED_MODEL_BYTES,
                        }
                    ]
                }
            raise AssertionError(path)

        gpu_failure = {
            "ok": False,
            "resident_gpu_count": 1,
            "expected_gpu_count": 2,
            "runner_process_count": 1,
        }
        with (
            patch.object(gateway, "_fetch_json", side_effect=fake_fetch),
            patch.object(gateway, "_container_check", AsyncMock(return_value={"ok": True})),
            patch.object(gateway, "_gpu_check", AsyncMock(return_value=gpu_failure)),
        ):
            result = await gateway._runtime_health(use_cache=False)
        self.assertFalse(result["ok"])
        self.assertEqual(result["checks"]["gpu_processes"]["resident_gpu_count"], 1)

    async def test_routed_messages_preserve_all_needles_without_trimming(self) -> None:
        needles = [f"NEEDLE_{index:02d}_A7F3" for index in range(5)]
        content = " | ".join(needles)
        routed = gateway._route_messages(
            [{"role": "system", "content": "test"}, {"role": "user", "content": content}]
        )
        rendered = "\n".join(message["content"] for message in routed)
        for needle in needles:
            self.assertIn(needle, rendered)
        self.assertIn("Return only the final answer.", rendered)
        self.assertEqual(routed[-1]["content"], content)


if __name__ == "__main__":
    unittest.main()
