from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DeploymentContractTests(unittest.TestCase):
    def test_compose_pins_image_loopback_volume_gpu_and_log_rotation(self) -> None:
        compose = (ROOT / "docker-compose.yml").read_text()
        self.assertIn("127.0.0.1:11436:11434", compose)
        self.assertIn("ollama/ollama@sha256:57f573", compose)
        self.assertIn("name: ollama_ollama_data", compose)
        self.assertIn('device_ids: ["0", "1"]', compose)
        self.assertIn("OLLAMA_NUM_PARALLEL: \"1\"", compose)
        self.assertIn("max-size: 10m", compose)
        self.assertIn('max-file: "5"', compose)

    def test_systemd_tracks_container_lifecycle_and_route_is_loopback(self) -> None:
        home = (ROOT / "echo-qwen-home.service").read_text()
        route = (ROOT / "echo-qwen-route.service").read_text()
        supervisor = (ROOT / "qwen-home-supervisor.sh").read_text()
        self.assertIn("Type=simple", home)
        self.assertIn("Restart=always", home)
        self.assertIn("docker wait", supervisor)
        self.assertIn("--host 127.0.0.1 --port 11437", route)
        self.assertIn("Requires=echo-qwen-home.service", route)

    def test_registry_names_local_provider_and_never_cloud(self) -> None:
        sql = (ROOT / "register.sql").read_text()
        self.assertIn("echo.qwen.local.health", sql)
        self.assertIn("echo.qwen.local.openai_chat", sql)
        self.assertIn("ollama-local-forge", sql)
        self.assertIn("'cloud_lane', false", sql)
        self.assertIn("http://127.0.0.1:11437/v1", sql)

    def test_app_has_no_prompt_logging_and_forces_no_truncation(self) -> None:
        app = (ROOT / "app.py").read_text()
        self.assertNotIn('"prompt": prompt,\n                "request_id"', app)
        self.assertGreaterEqual(app.count('"truncate": False'), 2)
        self.assertGreaterEqual(app.count('"shift": False'), 2)
        self.assertIn('"prompt_eval_count"', app)

    def test_stage_prewarms_exact_model_and_never_continues_while_red(self) -> None:
        stage = (ROOT / "stage-qwen-route.sh").read_text()
        self.assertIn('python3 "$source_root/qwen-warmup.py"', stage)
        self.assertIn('QWEN_ALIAS_DIGEST="$alias_digest"', stage)
        self.assertIn('if [[ "$ready" -ne 1 ]]', stage)
        self.assertLess(
            stage.index('python3 "$source_root/qwen-warmup.py"'),
            stage.index("systemd-run"),
        )

    def test_verifier_normalizes_http_header_names(self) -> None:
        verifier = (ROOT / "verify-qwen-route.py").read_text()
        self.assertIn("key.lower(): value", verifier)
        self.assertIn('headers2.get("x-qwen-truncated")', verifier)
        self.assertIn('headers2.get("x-qwen-shifted")', verifier)


if __name__ == "__main__":
    unittest.main()
