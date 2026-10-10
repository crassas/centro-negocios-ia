"""Optional God's Eye View keyless service recovery.

Called by the *existing* Travis World watcher; never touches Centro Station,
Centro Server, CCTV, Travis voice, or unknown processes. Disabled unless the
operator has created /root/.centro-extensions/travis-gev-keyless.enabled.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
FLAG = HOME / ".centro-extensions" / "travis-gev-keyless.enabled"
LAUNCHER = HOME / "travis-gev-keyless.sh"
CHECKOUT = HOME / "travis-gev-keyless" / "node_modules" / "vite" / "bin" / "vite.js"
STATE = HOME / ".local" / "state" / "travis-gev"
STATUS = STATE / "watch-status.json"
LOG = STATE / "watch.log"
URL = "http://127.0.0.1:4173/"
CHECK_EVERY = 25
RETRY_AFTER = 110
MIN_AVAILABLE_MIB = 1024

_last_check = -1e9
_last_start = -1e9
_last_healthy = False
_restarts = 0
_last_detail = ""


def _available_memory_mib() -> int:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    except (OSError, ValueError, IndexError):
        pass
    return -1


def _endpoint() -> tuple[bool, str]:
    try:
        with urllib.request.urlopen(URL, timeout=2) as response:
            if response.status != 200:
                return False, f"HTTP {response.status}"
            html = response.read(4096).decode("utf-8", "replace")
        return ("<title>God's Eye View</title>" in html), "HTTP 200"
    except Exception as exc:
        return False, type(exc).__name__


def _port_busy() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", 4173), timeout=0.8):
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False


def _report(healthy: bool, detail: str) -> None:
    global _last_detail
    if detail != _last_detail:
        print(f"[watch] travis-gev · {detail}", flush=True)
        _last_detail = detail
    try:
        STATE.mkdir(parents=True, exist_ok=True)
        snapshot = {
            "enabled": FLAG.is_file(),
            "healthy": healthy,
            "url": URL,
            "lastCheckEpoch": int(time.time()),
            "restartsRequested": _restarts,
            "availableMemoryMiB": _available_memory_mib(),
            "detail": detail,
        }
        temp = STATUS.with_name(STATUS.name + ".tmp")
        temp.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")
        temp.replace(STATUS)
    except OSError:
        # Write failures must never stop the existing CCTV watcher.
        pass


def ensure_keyless_sidecar(now: float | None = None) -> bool:
    """Ensure the opt-in standalone GEV is reachable; never kill a process."""
    global _last_check, _last_start, _last_healthy, _restarts
    if not FLAG.is_file():
        return False
    now = time.monotonic() if now is None else now
    if now - _last_check < CHECK_EVERY:
        return _last_healthy
    _last_check = now
    _last_healthy, detail = _endpoint()
    if _last_healthy:
        _report(True, "HTTP 200 · disponível")
        return True
    if not LAUNCHER.is_file() or not CHECKOUT.is_file():
        _report(False, "instalação incompleta; arranque não solicitado")
        return False
    if _port_busy():
        _report(False, "porta 4173 ocupada por outro serviço; nenhum processo alterado")
        return False
    memory = _available_memory_mib()
    if memory != -1 and memory < MIN_AVAILABLE_MIB:
        _report(False, f"memória disponível {memory} MiB; aguardar (mínimo {MIN_AVAILABLE_MIB} MiB)")
        return False
    if now - _last_start < RETRY_AFTER:
        _report(False, f"arranque recente; a aguardar ({detail})")
        return False
    _last_start = now
    try:
        STATE.mkdir(parents=True, exist_ok=True)
        with LOG.open("ab") as output:
            proc = subprocess.Popen(
                ["/bin/bash", str(LAUNCHER), "start"],
                cwd=HOME,
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                close_fds=True,
            )
        _restarts += 1
        _report(False, f"recuperação solicitada · PID {proc.pid}")
    except (OSError, ValueError) as exc:
        _report(False, f"não foi possível iniciar: {type(exc).__name__}")
    return False
