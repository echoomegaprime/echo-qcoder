#!/usr/bin/env python3
"""Transactional, exclusive GPU lease for the FORGE QCoder runtime."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable, NamedTuple, Protocol


DEFAULT_STATE_PATH = Path("/run/echo-qcoder/lease.json")
DEFAULT_LOCK_PATH = Path("/run/lock/echo-qcoder-gpu-lease.lock")
TOKEN_PATTERN = re.compile(r"^[a-f0-9]{32}$")
HOLDER_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,96}$")
MIN_TTL_SECONDS = 180
MAX_TTL_SECONDS = 43_200
SERVICES = (
    "echo-prime-family.service",
    "echo-convai-tts.service",
    "echo-titlehound.service",
)
HEALTH_URLS = {
    "echo-prime-family.service": "http://127.0.0.1:18420/health",
    "echo-convai-tts.service": "http://127.0.0.1:7800/health",
    "echo-titlehound.service": "http://127.0.0.1:18991/health",
}
DROP_IN_NAME = "99-qcoder-gpu-lease.conf"


class LeaseError(RuntimeError):
    """Base class for controlled lease failures."""


class LeaseBusyError(LeaseError):
    """Raised when an unexpired lease already exists."""


class LeaseAuthorizationError(LeaseError):
    """Raised when a holder token does not match the active lease."""


class PlatformError(LeaseError):
    """Raised when FORGE cannot enter or leave the lease safely."""


class LeaseState(NamedTuple):
    token_hash: str
    holder: str
    acquired_at: float
    expires_at: float
    phase: str
    original_services: dict[str, bool]

    def to_json(self) -> dict[str, object]:
        return {
            "schema_version": 1,
            "token_hash": self.token_hash,
            "holder": self.holder,
            "acquired_at": self.acquired_at,
            "expires_at": self.expires_at,
            "phase": self.phase,
            "original_services": self.original_services,
        }

    @classmethod
    def from_json(cls, data: dict[str, object]) -> "LeaseState":
        if data.get("schema_version") != 1:
            raise LeaseError("unsupported lease state schema")
        services = data.get("original_services")
        if not isinstance(services, dict) or set(services) != set(SERVICES):
            raise LeaseError("lease state has an invalid service inventory")
        if not all(isinstance(value, bool) for value in services.values()):
            raise LeaseError("lease state service values must be boolean")
        return cls(
            token_hash=str(data["token_hash"]),
            holder=str(data["holder"]),
            acquired_at=float(data["acquired_at"]),
            expires_at=float(data["expires_at"]),
            phase=str(data["phase"]),
            original_services={str(key): bool(value) for key, value in services.items()},
        )


class LeasePlatform(Protocol):
    def assert_healthy(self) -> None: ...

    def capture_service_state(self) -> dict[str, bool]: ...

    def pause_services(self) -> None: ...

    def clear_qwen(self) -> None: ...

    def resume_services(self, original_state: dict[str, bool]) -> None: ...


def hash_token(token: str) -> str:
    validate_token(token)
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def validate_token(token: str) -> None:
    if not TOKEN_PATTERN.fullmatch(token):
        raise LeaseAuthorizationError("lease token must be 32 lowercase hexadecimal characters")


def validate_holder(holder: str) -> None:
    if not HOLDER_PATTERN.fullmatch(holder):
        raise LeaseError("holder contains unsupported characters or has an invalid length")


def validate_ttl(ttl_seconds: int) -> None:
    if ttl_seconds < MIN_TTL_SECONDS or ttl_seconds > MAX_TTL_SECONDS:
        raise LeaseError(
            f"lease TTL must be between {MIN_TTL_SECONDS} and {MAX_TTL_SECONDS} seconds"
        )


class LeaseManager:
    def __init__(
        self,
        state_path: Path,
        platform: LeasePlatform,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.state_path = state_path
        self.platform = platform
        self.clock = clock

    def load(self) -> LeaseState | None:
        if not self.state_path.exists():
            return None
        try:
            data = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise LeaseError(f"lease state is unreadable: {exc}") from exc
        if not isinstance(data, dict):
            raise LeaseError("lease state must be a JSON object")
        return LeaseState.from_json(data)

    def save(self, state: LeaseState) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        payload = json.dumps(state.to_json(), sort_keys=True, separators=(",", ":")) + "\n"
        descriptor, temporary_name = tempfile.mkstemp(
            dir=self.state_path.parent,
            prefix="lease.",
            suffix=".tmp",
            text=True,
        )
        temporary_path = Path(temporary_name)
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            temporary_path.replace(self.state_path)
        finally:
            temporary_path.unlink(missing_ok=True)

    def acquire(self, token: str, holder: str, ttl_seconds: int) -> LeaseState:
        validate_token(token)
        validate_holder(holder)
        validate_ttl(ttl_seconds)
        now = self.clock()
        existing = self.load()
        if existing is not None:
            if existing.expires_at > now:
                raise LeaseBusyError(
                    f"GPU lease is held by {existing.holder} until {int(existing.expires_at)}"
                )
            self._restore(existing)

        self.platform.assert_healthy()
        original_services = self.platform.capture_service_state()
        if set(original_services) != set(SERVICES):
            raise PlatformError("platform returned an incomplete service inventory")
        state = LeaseState(
            token_hash=hash_token(token),
            holder=holder,
            acquired_at=now,
            expires_at=now + ttl_seconds,
            phase="acquiring",
            original_services=original_services,
        )
        self.save(state)
        try:
            self.platform.pause_services()
            self.platform.clear_qwen()
            state = state._replace(phase="active")
            self.save(state)
            return state
        except Exception:
            try:
                self.platform.clear_qwen()
                self.platform.resume_services(original_services)
                self.state_path.unlink(missing_ok=True)
            except Exception as restore_error:
                failed = state._replace(phase=f"restore_failed:{type(restore_error).__name__}")
                self.save(failed)
            raise

    def renew(self, token: str, ttl_seconds: int) -> LeaseState:
        validate_ttl(ttl_seconds)
        state = self._authorized_state(token)
        if state.phase != "active":
            raise LeaseError(f"cannot renew lease in phase {state.phase}")
        renewed = state._replace(expires_at=self.clock() + ttl_seconds)
        self.save(renewed)
        return renewed

    def release(self, token: str) -> bool:
        state = self.load()
        if state is None:
            return False
        if state.token_hash != hash_token(token):
            raise LeaseAuthorizationError("lease token does not match the active holder")
        self._restore(state)
        return True

    def recover_stale(self) -> bool:
        state = self.load()
        if state is None or state.expires_at > self.clock():
            return False
        self._restore(state)
        return True

    def public_status(self) -> dict[str, object]:
        state = self.load()
        if state is None:
            return {"active": False}
        return {
            "active": True,
            "holder": state.holder,
            "acquired_at": state.acquired_at,
            "expires_at": state.expires_at,
            "phase": state.phase,
            "original_services": state.original_services,
        }

    def _authorized_state(self, token: str) -> LeaseState:
        state = self.load()
        if state is None:
            raise LeaseAuthorizationError("no active GPU lease exists")
        if state.token_hash != hash_token(token):
            raise LeaseAuthorizationError("lease token does not match the active holder")
        return state

    def _restore(self, state: LeaseState) -> None:
        restoring = state._replace(phase="restoring")
        self.save(restoring)
        try:
            self.platform.clear_qwen()
            self.platform.resume_services(state.original_services)
        except Exception as exc:
            self.save(restoring._replace(phase=f"restore_failed:{type(exc).__name__}"))
            raise
        self.state_path.unlink(missing_ok=True)


class SystemPlatform:
    def __init__(
        self,
        *,
        command_timeout: int = 45,
        health_timeout: int = 360,
        ollama_restart_timeout: int = 180,
    ) -> None:
        self.command_timeout = command_timeout
        self.health_timeout = health_timeout
        self.ollama_restart_timeout = ollama_restart_timeout

    def assert_healthy(self) -> None:
        failures: list[str] = []
        for service in SERVICES:
            if not self._is_active(service):
                failures.append(f"{service}:inactive")
                continue
            if not self._http_ok(HEALTH_URLS[service]):
                failures.append(f"{service}:health")
        if failures:
            raise PlatformError("refusing GPU lease while production is unhealthy: " + ", ".join(failures))

    def capture_service_state(self) -> dict[str, bool]:
        return {service: self._is_active(service) for service in SERVICES}

    def pause_services(self) -> None:
        for service in SERVICES:
            drop_in = self._drop_in(service)
            drop_in.parent.mkdir(parents=True, exist_ok=True)
            drop_in.write_text(
                "[Unit]\nRefuseManualStart=yes\n\n[Service]\nRestart=no\n",
                encoding="utf-8",
            )
            os.chmod(drop_in, 0o644)
        self._run(["systemctl", "daemon-reload"])
        for service in SERVICES:
            restart_value = self._run(
                ["systemctl", "show", service, "-p", "Restart", "--value"]
            ).stdout.strip()
            if restart_value != "no":
                raise PlatformError(f"failed to suppress automatic restart for {service}")
            manual_start = self._run(
                ["systemctl", "show", service, "-p", "RefuseManualStart", "--value"]
            ).stdout.strip()
            if manual_start != "yes":
                raise PlatformError(f"failed to block external starts for {service}")

        self._run(["systemctl", "stop", "--no-block", *SERVICES])
        if not self._wait_services_inactive(25):
            self._run(
                ["systemctl", "kill", "--kill-whom=all", "--signal=SIGKILL", *SERVICES],
                check=False,
            )
        if not self._wait_services_inactive(20):
            active = [service for service in SERVICES if self._is_active(service)]
            raise PlatformError("GPU services did not stop: " + ", ".join(active))

    def clear_qwen(self) -> None:
        self._run(
            ["docker", "restart", "-t", "10", "echo-ollama"],
            timeout=self.ollama_restart_timeout,
        )
        # Poll Ollama itself instead of Docker's coarse 30-second health
        # scheduler. The CLI becomes usable well before the next health tick.
        deadline = time.monotonic() + 75
        while time.monotonic() < deadline:
            ready = self._run(
                ["docker", "exec", "echo-ollama", "ollama", "list"],
                check=False,
                timeout=10,
            )
            if ready.returncode == 0:
                break
            state = self._run(
                ["docker", "inspect", "-f", "{{.State.Status}}", "echo-ollama"],
                check=False,
            ).stdout.strip()
            if state in {"exited", "dead"}:
                raise PlatformError(f"Ollama entered terminal state {state}")
            time.sleep(1)
        else:
            raise PlatformError("Ollama API did not become ready after restart")
        loaded = self._run(["docker", "exec", "echo-ollama", "ollama", "ps"]).stdout
        if "c3po-code" in loaded:
            raise PlatformError("QCoder model remained loaded after Ollama restart")

    def resume_services(self, original_state: dict[str, bool]) -> None:
        for service in SERVICES:
            self._drop_in(service).unlink(missing_ok=True)
            try:
                self._drop_in(service).parent.rmdir()
            except OSError:
                pass
        self._run(["systemctl", "daemon-reload"])
        self._run(["systemctl", "reset-failed", *SERVICES], check=False)
        to_start = [service for service in SERVICES if original_state.get(service, False)]
        # Restore one model at a time. Concurrent cold loads fill swap and turn
        # an otherwise healthy NVMe host into an avoidable paging storm.
        for service in to_start:
            self._run(["systemctl", "start", service], timeout=60)
            deadline = time.monotonic() + self.health_timeout
            while time.monotonic() < deadline:
                if self._is_active(service) and self._http_ok(HEALTH_URLS[service]):
                    break
                time.sleep(2)
            else:
                raise PlatformError(f"production service failed readiness: {service}")

    def _drop_in(self, service: str) -> Path:
        return Path("/run/systemd/system") / f"{service}.d" / DROP_IN_NAME

    def _run(
        self,
        command: list[str],
        *,
        timeout: int | None = None,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        completed = subprocess.run(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout or self.command_timeout,
            check=False,
        )
        if check and completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip() or "unknown error"
            raise PlatformError(f"command failed ({command[0]}): {detail[:500]}")
        return completed

    def _is_active(self, service: str) -> bool:
        return self._run(["systemctl", "is-active", "--quiet", service], check=False).returncode == 0

    def _active_state(self, service: str) -> str:
        return self._run(
            ["systemctl", "show", service, "-p", "ActiveState", "--value"],
            check=False,
        ).stdout.strip()

    def _wait_services_inactive(self, timeout_seconds: int) -> bool:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            if all(self._active_state(service) in {"inactive", "failed"} for service in SERVICES):
                return True
            time.sleep(1)
        return all(self._active_state(service) in {"inactive", "failed"} for service in SERVICES)

    @staticmethod
    def _http_ok(url: str) -> bool:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                return response.status == 200
        except (urllib.error.URLError, TimeoutError):
            return False


def locked_manager(
    state_path: Path = DEFAULT_STATE_PATH,
    lock_path: Path = DEFAULT_LOCK_PATH,
) -> tuple[object, LeaseManager]:
    try:
        import fcntl
    except ImportError as exc:  # pragma: no cover - production is Linux; core is tested cross-platform.
        raise PlatformError("lease file locking requires a POSIX host") from exc
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_handle = lock_path.open("a+", encoding="utf-8")
    os.chmod(lock_path, 0o600)
    fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
    return lock_handle, LeaseManager(state_path, SystemPlatform())


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    acquire = subparsers.add_parser("acquire")
    acquire.add_argument("--token", required=True)
    acquire.add_argument("--holder", required=True)
    acquire.add_argument("--ttl", required=True, type=int)
    renew = subparsers.add_parser("renew")
    renew.add_argument("--token", required=True)
    renew.add_argument("--ttl", required=True, type=int)
    release = subparsers.add_parser("release")
    release.add_argument("--token", required=True)
    subparsers.add_parser("status")
    subparsers.add_parser("recover-stale")
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    lock_handle, manager = locked_manager()
    try:
        if arguments.command == "acquire":
            state = manager.acquire(arguments.token, arguments.holder, arguments.ttl)
            result = {"ok": True, "action": "acquired", **manager.public_status()}
        elif arguments.command == "renew":
            state = manager.renew(arguments.token, arguments.ttl)
            result = {"ok": True, "action": "renewed", "expires_at": state.expires_at}
        elif arguments.command == "release":
            result = {"ok": True, "action": "released", "restored": manager.release(arguments.token)}
        elif arguments.command == "recover-stale":
            result = {"ok": True, "action": "recovered", "restored": manager.recover_stale()}
        else:
            result = {"ok": True, "action": "status", **manager.public_status()}
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except LeaseBusyError as exc:
        print(json.dumps({"ok": False, "code": "lease_busy", "message": str(exc)}), file=sys.stderr)
        return 30
    except LeaseAuthorizationError as exc:
        print(json.dumps({"ok": False, "code": "unauthorized", "message": str(exc)}), file=sys.stderr)
        return 31
    except LeaseError as exc:
        print(json.dumps({"ok": False, "code": "lease_failed", "message": str(exc)}), file=sys.stderr)
        return 32
    finally:
        lock_handle.close()


if __name__ == "__main__":
    raise SystemExit(main())
