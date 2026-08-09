from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "qcoder_gpu_lease.py"


def load_module():
    spec = importlib.util.spec_from_file_location("qcoder_gpu_lease", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load GPU lease controller")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakePlatform:
    def __init__(self) -> None:
        self.healthy_checks = 0
        self.pauses = 0
        self.clears = 0
        self.resumes: list[dict[str, bool]] = []
        self.status = {
            "echo-prime-family.service": True,
            "echo-convai-tts.service": True,
            "echo-titlehound.service": True,
        }

    def assert_healthy(self) -> None:
        self.healthy_checks += 1

    def capture_service_state(self) -> dict[str, bool]:
        return dict(self.status)

    def pause_services(self) -> None:
        self.pauses += 1

    def clear_qwen(self) -> None:
        self.clears += 1

    def resume_services(self, original_state: dict[str, bool]) -> None:
        self.resumes.append(dict(original_state))


class LeaseManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.state_path = Path(self.temp_dir.name) / "lease.json"
        self.platform = FakePlatform()
        self.now = 1_000.0
        self.manager = self.module.LeaseManager(
            self.state_path,
            self.platform,
            clock=lambda: self.now,
        )
        self.token = "a" * 32

    def test_acquire_persists_only_a_token_hash_and_pauses_services(self) -> None:
        state = self.manager.acquire(self.token, "qcoder-hammer", 600)

        saved = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertNotIn(self.token, self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(saved["token_hash"], self.module.hash_token(self.token))
        self.assertEqual(state.phase, "active")
        self.assertEqual(self.platform.healthy_checks, 1)
        self.assertEqual(self.platform.pauses, 1)
        self.assertEqual(self.platform.clears, 1)

    def test_second_live_holder_is_rejected_without_mutation(self) -> None:
        self.manager.acquire(self.token, "first", 600)

        with self.assertRaises(self.module.LeaseBusyError):
            self.manager.acquire("b" * 32, "second", 600)

        self.assertEqual(self.platform.pauses, 1)
        self.assertEqual(self.platform.resumes, [])

    def test_stale_lease_is_restored_before_new_holder_acquires(self) -> None:
        self.manager.acquire(self.token, "first", 180)
        self.now += 181

        state = self.manager.acquire("b" * 32, "second", 600)

        self.assertEqual(state.holder, "second")
        self.assertEqual(len(self.platform.resumes), 1)
        self.assertEqual(self.platform.pauses, 2)

    def test_release_rejects_wrong_token(self) -> None:
        self.manager.acquire(self.token, "first", 600)

        with self.assertRaises(self.module.LeaseAuthorizationError):
            self.manager.release("b" * 32)

        self.assertTrue(self.state_path.exists())
        self.assertEqual(self.platform.resumes, [])

    def test_release_clears_qwen_restores_services_and_removes_state(self) -> None:
        self.manager.acquire(self.token, "first", 600)

        released = self.manager.release(self.token)

        self.assertTrue(released)
        self.assertFalse(self.state_path.exists())
        self.assertEqual(self.platform.clears, 2)
        self.assertEqual(self.platform.resumes, [self.platform.status])

    def test_renew_extends_expiry_for_current_holder(self) -> None:
        initial = self.manager.acquire(self.token, "first", 300)
        self.now += 120

        renewed = self.manager.renew(self.token, 600)

        self.assertGreater(renewed.expires_at, initial.expires_at)
        self.assertEqual(renewed.expires_at, self.now + 600)

    def test_recover_stale_is_noop_for_a_live_lease(self) -> None:
        self.manager.acquire(self.token, "first", 300)

        self.assertFalse(self.manager.recover_stale())
        self.assertTrue(self.state_path.exists())

    def test_recover_stale_restores_an_expired_lease(self) -> None:
        self.manager.acquire(self.token, "first", 180)
        self.now += 181

        self.assertTrue(self.manager.recover_stale())
        self.assertFalse(self.state_path.exists())
        self.assertEqual(len(self.platform.resumes), 1)


class RecordingSystemPlatform:
    def __init__(self, module, drop_in_root: Path) -> None:
        self.module = module
        self.drop_in_root = drop_in_root
        self.commands: list[list[str]] = []

    def _drop_in(self, service: str) -> Path:
        return self.drop_in_root / f"{service}.d" / self.module.DROP_IN_NAME

    def _run(self, command, *, timeout=None, check=True):
        command = list(command)
        self.commands.append(command)
        stdout = ""
        if command[:2] == ["systemctl", "show"] and "Restart" in command:
            stdout = "no\n"
        if command[:2] == ["systemctl", "show"] and "RefuseManualStart" in command:
            stdout = "yes\n"
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    def _wait_services_inactive(self, timeout_seconds: int) -> bool:
        return True

    def _is_active(self, service: str) -> bool:
        return False


class SystemPlatformMaskTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.platform = RecordingSystemPlatform(self.module, Path(self.temp_dir.name))

    def test_pause_refuses_manual_starts_before_stopping_services(self) -> None:
        self.module.SystemPlatform.pause_services(self.platform)

        guard_index = self.platform.commands.index(
            [
                "systemctl",
                "show",
                self.module.SERVICES[0],
                "-p",
                "RefuseManualStart",
                "--value",
            ]
        )
        stop_index = self.platform.commands.index(
            ["systemctl", "stop", "--no-block", *self.module.SERVICES]
        )
        self.assertLess(guard_index, stop_index)
        self.assertFalse(any(command[1:2] == ["mask"] for command in self.platform.commands))

    def test_resume_removes_restart_guard_before_starting_services(self) -> None:
        original_state = {service: True for service in self.module.SERVICES}
        for service in self.module.SERVICES:
            drop_in = self.platform._drop_in(service)
            drop_in.parent.mkdir(parents=True, exist_ok=True)
            drop_in.write_text("[Service]\nRestart=no\n", encoding="utf-8")
        self.platform._http_ok = lambda url: True
        self.platform._is_active = lambda service: True
        self.platform.health_timeout = 1

        self.module.SystemPlatform.resume_services(self.platform, original_state)

        daemon_reload_index = max(
            index
            for index, command in enumerate(self.platform.commands)
            if command[:2] == ["systemctl", "daemon-reload"]
        )
        first_start_index = next(
            index
            for index, command in enumerate(self.platform.commands)
            if command[:2] == ["systemctl", "start"]
        )
        self.assertLess(daemon_reload_index, first_start_index)
        self.assertFalse(any(command[1:2] == ["unmask"] for command in self.platform.commands))


if __name__ == "__main__":
    unittest.main()
