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


# HTML entry bridge registration. The existing Travis UI synchronizer may replace
# index.html; reapply only the two additive references after its repair pass.
UI_DIR = HOME / ".centro-ui"
UI_INDEX = UI_DIR / "index.html"
BRIDGE_MODULE = UI_DIR / "travis-gev-bridge.mjs"
BRIDGE_INTENTS = UI_DIR / "travis-gev-intents.mjs"
BRIDGE_STYLE = UI_DIR / "travis-gev-bridge.css"
BRIDGE_JS_TAG = '<script type="module" src="./travis-gev-bridge.mjs?v=gev-17b"></script>'
BRIDGE_CSS_TAG = '<link rel="stylesheet" href="./travis-gev-bridge.css?v=gev-17b">'
BRIDGE_INDEX_BACKUP = HOME / ".centro-extensions" / "travis-gev-index-before-bridge.html"


def ensure_travis_bridge() -> bool:
    """Keep official globe controls in local Travis without changing its core."""
    if not FLAG.is_file():
        return False
    if not all(p.is_file() for p in (UI_INDEX, BRIDGE_MODULE, BRIDGE_INTENTS, BRIDGE_STYLE)):
        return False
    try:
        before = UI_INDEX.read_text(encoding="utf-8")
        after = before
        if BRIDGE_CSS_TAG not in after:
            import re
            anchors = re.findall(
                r'<link rel="stylesheet" href="\./travis-cctv-gods-eye\.css[^"]*">',
                after,
            )
            if len(anchors) != 1:
                _report(False, "bridge CSS anchor unavailable; Travis untouched")
                return False
            after = after.replace(anchors[0], anchors[0] + "\n  " + BRIDGE_CSS_TAG, 1)
        if BRIDGE_JS_TAG not in after:
            import re
            anchors = re.findall(
                r'<script type="module" src="\./travis-cctv-player\.mjs[^"]*"></script>',
                after,
            )
            if len(anchors) != 1:
                _report(False, "bridge JS anchor unavailable; Travis untouched")
                return False
            after = after.replace(anchors[0], anchors[0] + "\n  " + BRIDGE_JS_TAG, 1)
        if after == before:
            ensure_travis_render_pause()
            return True
        if not BRIDGE_INDEX_BACKUP.exists():
            BRIDGE_INDEX_BACKUP.write_text(before, encoding="utf-8")
        temp = UI_INDEX.with_name("index.html.travis-gev.tmp")
        temp.write_text(after, encoding="utf-8")
        os.chmod(temp, UI_INDEX.stat().st_mode & 0o777)
        temp.replace(UI_INDEX)
        print("[watch] travis-gev · official UI bridge linked to local Travis", flush=True)
        ensure_travis_render_pause()
        return True
    except OSError as error:
        print("[watch] travis-gev · UI bridge skipped:", type(error).__name__, flush=True)
        return False



TRAVIS_3D = UI_DIR / "travis-3d.mjs"
TRAVIS_3D_GUARD = "    if (hud.dataset.worldEngine==='official') {lastFrame=now;return;}"
TRAVIS_3D_BEFORE = (
    "    if (!renderer || !opened || webglLost || renderer.getContext().isContextLost()) "
    "{lastFrame=now;return;}"
)
TRAVIS_3D_BACKUP = HOME / ".centro-extensions" / "travis-3d-before-official-gev.mjs"


def ensure_travis_render_pause() -> bool:
    """Pause only the hidden 3D drawing loop while Cesium owns the viewport.

    The Travis microphone/ASR/LLM/TTS loops are outside animate(); they
    continue normally. The guard is a no-op when the official globe is closed.
    """
    if not FLAG.is_file():
        return False
    try:
        source = TRAVIS_3D.read_text(encoding="utf-8")
        if TRAVIS_3D_GUARD in source:
            return True
        if source.count(TRAVIS_3D_BEFORE) != 1:
            return False
        if not TRAVIS_3D_BACKUP.is_file():
            TRAVIS_3D_BACKUP.write_text(source, encoding="utf-8")
        updated = source.replace(
            TRAVIS_3D_BEFORE,
            TRAVIS_3D_BEFORE + "\n" + TRAVIS_3D_GUARD,
            1,
        )
        temp = TRAVIS_3D.with_name("travis-3d.mjs.travis-gev.tmp")
        temp.write_text(updated, encoding="utf-8")
        os.chmod(temp, TRAVIS_3D.stat().st_mode & 0o777)
        temp.replace(TRAVIS_3D)
        print("[watch] travis-gev · hidden Travis GPU loop paused in official mode", flush=True)
        return True
    except OSError as error:
        print("[watch] travis-gev · render guard skipped:", type(error).__name__, flush=True)
        return False
