from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "qcoder_adapter.py"


def load_adapter():
    spec = importlib.util.spec_from_file_location("qcoder_adapter", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load qcoder adapter")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ParseCodexInvocationTests(unittest.TestCase):
    def test_interactive_invocation_extracts_workspace_and_prompt(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(
            ["-C", r"C:\ECHO_OMEGA_PRIME", "--add-dir", r"C:\ECHO_MCP", "bootstrap"]
        )

        self.assertEqual(invocation.mode, "interactive")
        self.assertEqual(invocation.workspace, Path(r"C:\ECHO_OMEGA_PRIME"))
        self.assertEqual(invocation.prompt, "bootstrap")
        self.assertEqual(invocation.include_directories, (Path(r"C:\ECHO_MCP"),))

    def test_exec_invocation_maps_to_headless(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(
            [
                "exec",
                "-C",
                r"C:\work",
                "--add-dir",
                r"C:\ECHO_MCP",
                "--dangerously-bypass-approvals-and-sandbox",
                "--dangerously-bypass-hook-trust",
                "do the work",
            ]
        )

        self.assertEqual(invocation.mode, "headless")
        self.assertEqual(invocation.prompt, "do the work")

    def test_named_resume_is_preserved(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(
            ["resume", "-C", r"C:\work", "session-123", "continue safely"]
        )

        self.assertEqual(invocation.mode, "resume")
        self.assertEqual(invocation.resume_session, "session-123")
        self.assertEqual(invocation.prompt, "continue safely")

    def test_headless_named_resume_after_common_options_is_preserved(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(
            [
                "exec",
                "-C",
                r"C:\work",
                "--dangerously-bypass-approvals-and-sandbox",
                "resume",
                "session-456",
                "continue headlessly",
            ]
        )

        self.assertEqual(invocation.mode, "headless")
        self.assertEqual(invocation.resume_session, "session-456")
        self.assertEqual(invocation.prompt, "continue headlessly")

    def test_continue_latest_maps_without_a_fake_session_id(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(
            ["resume", "-C", r"C:\work", "--search", "--last", "continue latest"]
        )

        self.assertTrue(invocation.continue_latest)
        self.assertIsNone(invocation.resume_session)

    def test_missing_prompt_fails_closed(self) -> None:
        adapter = load_adapter()
        with self.assertRaisesRegex(ValueError, "bootstrap prompt"):
            adapter.parse_codex_invocation(["-C", r"C:\work"])

    def test_target_workspace_overrides_governance_root(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(
            ["-C", r"C:\ECHO_OMEGA_PRIME", "bootstrap"]
        )
        targeted = adapter.apply_target_workspace(invocation, r"C:\ECHO_MCP\echo-qcoder")

        self.assertEqual(targeted.workspace, Path(r"C:\ECHO_MCP\echo-qcoder"))
        self.assertIn(Path(r"C:\ECHO_MCP\echo-qcoder"), targeted.include_directories)


class QwenArgumentTests(unittest.TestCase):
    def test_local_openai_compatible_arguments_are_explicit(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(
            ["exec", "-C", r"C:\work", "--add-dir", r"C:\ECHO_MCP", "build"]
        )
        args = adapter.build_qwen_arguments(
            invocation,
            qwen_model="c3po-code:latest",
            base_url="http://127.0.0.1:11434/v1",
            api_key="local-qcoder",
        )

        self.assertIn("--auth-type", args)
        self.assertIn("openai", args)
        self.assertIn("--openai-base-url", args)
        self.assertIn("http://127.0.0.1:11434/v1", args)
        self.assertIn("--model", args)
        self.assertIn("c3po-code:latest", args)
        self.assertIn("--approval-mode", args)
        self.assertIn("yolo", args)
        self.assertIn("-p", args)
        self.assertEqual(args[-1], "build")

    def test_interactive_mode_does_not_use_headless_flag(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(["-C", r"C:\work", "bootstrap"])
        args = adapter.build_qwen_arguments(invocation)

        self.assertNotIn("-p", args)
        self.assertEqual(args[-1], "bootstrap")

    def test_continue_latest_uses_qwen_continue_flag(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(
            ["resume", "-C", r"C:\work", "--last", "continue latest"]
        )
        args = adapter.build_qwen_arguments(invocation)

        self.assertIn("--continue", args)
        self.assertNotIn("--resume", args)

    def test_api_key_is_not_in_diagnostic_summary(self) -> None:
        adapter = load_adapter()
        invocation = adapter.parse_codex_invocation(["-C", r"C:\work", "bootstrap"])
        summary = adapter.safe_invocation_summary(
            invocation,
            qwen_model="c3po-code:latest",
            base_url="http://127.0.0.1:11434/v1",
        )

        self.assertNotIn(os.environ.get("OPENAI_API_KEY", "secret-never-print"), summary)
        self.assertIn("c3po-code:latest", summary)

    def test_qwen_environment_extends_slow_local_model_timeout(self) -> None:
        adapter = load_adapter()
        environment = adapter.build_qwen_environment(
            {"OPENAI_API_KEY": "must-be-removed", "PATH": "example"},
            settings_path=Path(r"C:\qcoder\qwen-settings.json"),
        )

        self.assertNotIn("OPENAI_API_KEY", environment)
        self.assertEqual(environment["QWEN_CODE_API_TIMEOUT_MS"], "900000")
        self.assertEqual(
            environment["QWEN_CODE_SYSTEM_SETTINGS_PATH"],
            str(Path(r"C:\qcoder\qwen-settings.json")),
        )

    def test_supervised_process_returns_the_real_exit_code(self) -> None:
        adapter = load_adapter()
        exit_code = adapter.run_supervised_process(
            [sys.executable, "-c", "raise SystemExit(7)"],
            cwd=Path.cwd(),
            environment=dict(os.environ),
        )

        self.assertEqual(exit_code, 7)


if __name__ == "__main__":
    unittest.main()
