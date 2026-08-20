from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DeploymentContractTests(unittest.TestCase):
    def test_compose_pins_image_loopback_volume_gpu_and_log_rotation(self) -> None:
        compose = (ROOT / "docker-compose.yml").read_text()
        self.assertIn("name: echo-qwen-home", compose)
        self.assertIn("127.0.0.1:11438:11434", compose)
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
        self.assertIn("--force-recreate --remove-orphans qwen", supervisor)
        self.assertIn("--host 127.0.0.1 --port 11437", route)
        self.assertIn("Requires=echo-qwen-home.service", route)
        self.assertIn("Before=echo-titlehound.service", route)

    def test_registry_names_local_provider_and_never_cloud(self) -> None:
        sql = (ROOT / "register.sql").read_text()
        self.assertIn("echo.qwen.local.health", sql)
        self.assertIn("echo.qwen.local.openai_chat", sql)
        self.assertIn("ollama-local-forge", sql)
        self.assertIn("'cloud_lane', false", sql)
        self.assertIn("http://127.0.0.1:11437/v1", sql)
        self.assertIn("'echo.qwen.local.health'", sql)
        self.assertIn("'tier:0'", sql)
        self.assertIn("llm_model_activation_permits", sql)
        self.assertIn("'c3po-code:echo-abliterated-128k'", sql)

    def test_app_has_no_prompt_logging_and_forces_no_truncation(self) -> None:
        app = (ROOT / "app.py").read_text()
        self.assertNotIn('"prompt": prompt,\n                "request_id"', app)
        self.assertGreaterEqual(app.count('"truncate": False'), 2)
        self.assertGreaterEqual(app.count('"shift": False'), 2)
        self.assertIn('"prompt_eval_count"', app)

    def test_stage_prewarms_exact_model_and_never_continues_while_red(self) -> None:
        stage = (ROOT / "stage-qwen-route.sh").read_text()
        warmup = (ROOT / "qwen-warmup.py").read_text()
        self.assertIn('python3 "$source_root/qwen-warmup.py"', stage)
        self.assertIn('QWEN_ALIAS_DIGEST="$alias_digest"', stage)
        self.assertNotIn("QWEN_MODEL_BYTES", stage)
        self.assertNotIn("MODEL_BYTES", warmup)
        self.assertIn("resident_vram != resident_size", warmup)
        self.assertIn('if [[ "$ready" -ne 1 ]]', stage)
        self.assertLess(
            stage.index('python3 "$source_root/qwen-warmup.py"'),
            stage.index("systemd-run"),
        )

    def test_installer_invokes_the_shared_provisioner_through_bash(self) -> None:
        installer = (ROOT / "install-qwen-route.sh").read_text()
        rollback = (ROOT / "rollback-qwen-route.sh").read_text()
        self.assertIn(
            '/usr/bin/bash "$repo_root/deployment/forge/provision-qcoder-model.sh"',
            installer,
        )
        self.assertIn('<"$release_dir/register.sql"', installer)
        self.assertNotIn('-f "$release_dir/register.sql"', installer)
        self.assertIn("systemctl disable echo-titlehound.service", installer)
        self.assertIn("titlehound-before.state", installer)
        self.assertIn("titlehound-before.enabled", installer)
        self.assertIn("/etc/echo/qwen-dual-gpu.lease", installer)
        self.assertIn("echo-titlehound-qwen-lease.conf", installer)
        self.assertIn("systemctl enable echo-titlehound.service", rollback)
        self.assertIn("systemctl start echo-titlehound.service", rollback)
        self.assertIn("titlehound-before.state", rollback)
        self.assertIn("titlehound-before.enabled", rollback)
        self.assertIn("titlehound-qwen-lease.conf", rollback)
        self.assertIn("qwen-dual-gpu.lease", rollback)

    def test_titlehound_lease_condition_blocks_external_reactivation(self) -> None:
        lease = (ROOT / "echo-titlehound-qwen-lease.conf").read_text()
        self.assertIn("ConditionPathExists=!/etc/echo/qwen-dual-gpu.lease", lease)

    def test_shared_provisioner_preserves_named_parent_through_structured_api(self) -> None:
        provisioner = (ROOT.parent / "provision-qcoder-model.sh").read_text()
        self.assertIn("127.0.0.1:11438/api/create", provisioner)
        self.assertIn('"from": source', provisioner)
        self.assertIn('"parameters": {"num_ctx": context}', provisioner)
        self.assertIn('if [[ "$actual_parent" != "$source_model" ]]', provisioner)
        self.assertNotIn("ollama show --modelfile", provisioner)

    def test_verifier_normalizes_http_header_names(self) -> None:
        verifier = (ROOT / "verify-qwen-route.py").read_text()
        self.assertIn("key.lower(): value", verifier)
        self.assertIn('headers2.get("x-qwen-truncated")', verifier)
        self.assertIn('headers2.get("x-qwen-shifted")', verifier)


if __name__ == "__main__":
    unittest.main()
