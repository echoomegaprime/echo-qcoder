from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


VERIFIER_PATH = Path(__file__).resolve().parents[1] / "verify-qwen-route.py"
SPEC = importlib.util.spec_from_file_location("echo_qwen_route_verifier", VERIFIER_PATH)
assert SPEC and SPEC.loader
verifier = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = verifier
SPEC.loader.exec_module(verifier)


class VerifierContractTests(unittest.TestCase):
    def test_120k_generation_preserves_four_thousand_token_reserve(self) -> None:
        prompt = "deterministic prompt"
        fitted_budget = {
            "prompt_tokens": 120000,
            "output_reserve_tokens": 4096,
            "total_reserved_tokens": 124352,
        }
        captured: list[dict] = []

        def fake_call(base: str, path: str, body: dict | None = None, timeout: int = 2400):
            self.assertEqual(base, "http://127.0.0.1:11437")
            self.assertEqual(path, "/v1/chat/completions")
            assert body is not None
            captured.append(body)
            return (
                200,
                {
                    "choices": [
                        {
                            "message": {
                                "content": "\n".join(verifier.NEEDLES),
                            }
                        }
                    ],
                    "usage": {"prompt_tokens": 120000},
                    "route_metadata": {
                        "truncated": False,
                        "shifted": False,
                        "budget": fitted_budget,
                    },
                },
                1.25,
                {},
            )

        with (
            patch.object(verifier, "fit_prompt", return_value=(prompt, fitted_budget, [])),
            patch.object(verifier, "call", side_effect=fake_call),
        ):
            result = verifier.context_canary("http://127.0.0.1:11437", 120000)

        self.assertEqual(captured[0]["max_tokens"], 4096)
        self.assertEqual(result["output_reserve_tokens"], 4096)
        self.assertEqual(result["total_reserved_tokens"], 124352)
        self.assertEqual(result["missing_needles"], 0)


if __name__ == "__main__":
    unittest.main()
