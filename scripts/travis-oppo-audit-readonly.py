#!/usr/bin/env python3
"""Travis / OPPO diagnostic, READ ONLY.

No service restarts, patches, database writes, token reads, or full log export.
Only bounded system metadata and redacted error-category counts are printed.
"""
from __future__ import annotations

import ast
import collections
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
STATE = HOME / ".centro-jarvis"
UI = HOME / ".centro-ui"
STATION = HOME / ".centro-station"
BACKUPS = HOME / ".travis-backups"
GH_BASE = "https://github.com/crassas/centro-negocios-ia"
PATTERNS = {
    "Traceback": rb"Traceback \(most recent call last\)",
    "ImportError": rb"\b(?:ModuleNotFoundError|ImportError)\b",
    "SyntaxError": rb"\b(?:SyntaxError|IndentationError)\b",
    "AttributeError": rb"\bAttributeError\b",
    "TypeError": rb"\bTypeError\b",
    "RuntimeError": rb"\bRuntimeError\b",
    "ConnectionRefused": rb"\b(?:ConnectionRefusedError|ECONNREFUSED)\b",
    "HTTP_5xx": rb"\b(?:HTTP [5][0-9]{2}|HTTPError: 5[0-9]{2})\b",
    "PortOccupied": rb"(?:Address already in use|Errno 98)",
}
ROUTES = (
    "open_youtube", "search_youtube", "select_youtube", "pause_youtube",
    "resume_youtube", "close_youtube", "close_projection",
    "github_knowledge_search", "github_knowledge_status",
    "TRAVIS_GITHUB.start", "travis_github_runtime",
)


def emit(key, value):
    # All values are bounded, calculated locally. Never print raw request/log data.
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    print(f"{key}={str(value)[:1100]}", flush=True)


def safe_json_file(path, limit=140000):
    try:
        if not path.is_file() or path.stat().st_size > limit:
            return {}
        obj = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        return obj if isinstance(obj, dict) else {}
    except (OSError, ValueError):
        return {}


def http_health(port):
    try:
        request = urllib.request.Request(f"http://127.0.0.1:{port}/health")
        with urllib.request.urlopen(request, timeout=2) as response:
            obj = json.load(response)
        if not isinstance(obj, dict):
            return {"online": True, "valid": False}
        return {
            "online": True,
            "ok": obj.get("ok") is True or obj.get("status") == "ok",
            "service": str(obj.get("service", ""))[:30],
            "busy": obj.get("busy") is True,
            "pid": obj.get("pid") if isinstance(obj.get("pid"), int) else None,
        }
    except (OSError, ValueError, TimeoutError):
        return {"online": False}


def process_path(pid):
    try:
        if type(pid) is not int or pid <= 0:
            return ""
        raw = (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0")
        candidates = [Path(p.decode("utf-8", "replace")).resolve()
                      for p in raw if p.endswith(b"jarvis_local.py")]
        if len(candidates) != 1:
            return "unknown"
        path = candidates[0]
        return ("expected_home" if path == (HOME / "jarvis_local.py").resolve()
                else "different_installation")
    except OSError:
        return "unavailable"


def file_info(path):
    try:
        if not path.is_file():
            return {"present": False}
        item = path.stat()
        return {
            "present": True,
            "bytes": item.st_size,
            "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(item.st_mtime)),
            "sha256_12": hashlib.sha256(path.read_bytes()).hexdigest()[:12]
            if item.st_size < 350000 else "large_file",
        }
    except OSError:
        return {"present": False, "reason": "unreadable"}


def source_check(path):
    result = file_info(path)
    if not result["present"]:
        return result
    try:
        text = path.read_text(encoding="utf-8")
        ast.parse(text, filename=str(path))
        result["pythonSyntax"] = "OK"
        symbols = set(re.findall(r"[A-Za-z_][A-Za-z_0-9]*", text))
        result["capabilityHooks"] = {
            symbol: (symbol in symbols if re.fullmatch(r"[a-z_]+", symbol) else symbol in text)
            for symbol in ROUTES
        }
        result["approxLines"] = text.count("\n") + 1
        return result
    except (SyntaxError, ValueError, UnicodeError):
        result["pythonSyntax"] = "BROKEN"
        return result


def station_check():
    data = safe_json_file(STATION / "status.json")
    # Do not report raw errors: they might contain command arguments.
    auto = data.get("autoupdate")
    if not isinstance(auto, dict):
        auto = {}
    return {
        "maintenance": (STATION / "maintenance").is_file(),
        "updateEnabled": auto.get("enabled", "unknown"),
        "pendingJarvisRestart": auto.get("pendingJarvisRestart", "unknown"),
        "lastUpdateErrorPresent": bool(auto.get("lastError")),
        "jarvisHealthy": (data.get("jarvis") or {}).get("healthy", "unknown")
        if isinstance(data.get("jarvis"), dict) else "unknown",
        "stationStatusPresent": bool(data),
    }


def github_check():
    enabled = (STATE / "github-feed-enabled").is_file()
    activation = safe_json_file(STATE / "rust-github-activation.json")
    source = HOME / "jarvis_local.py"
    modules = {name: (HOME / name).is_file()
               for name in ("travis_github_feed.py", "travis_github_runtime.py",
                            "travis_rust_memory.py")}
    db = STATE / "github-feed.sqlite"
    indexed = {"present": db.is_file()}
    if db.is_file():
        # Query existing SQLite in read-only mode. Do not create any database.
        try:
            import sqlite3
            uri = db.resolve().as_uri() + "?mode=ro"
            with sqlite3.connect(uri, uri=True, timeout=1) as con:
                indexed["sources"] = con.execute(
                    "SELECT COUNT(*) FROM revisions").fetchone()[0]
                indexed["passages"] = con.execute(
                    "SELECT COUNT(*) FROM passages").fetchone()[0]
        except (OSError, sqlite3.Error):
            indexed["status"] = "unavailable"
    return {
        "enabled": enabled,
        "activationState": str(activation.get("state", "unknown"))[:40],
        "modules": modules,
        "rustLibrary": file_info(STATE / "bin/libtravis_memory.so"),
        "index": indexed,
    }


def recent_backups():
    result = []
    try:
        dirs = sorted(BACKUPS.glob("rust-github-*"), key=lambda p: p.stat().st_mtime,
                      reverse=True)[:3]
        for directory in dirs:
            if not directory.is_dir():
                continue
            manifest = safe_json_file(directory / "manifest.json")
            # Backup identifiers only. Never inspect original private contents.
            result.append({
                "id": directory.name[-15:],
                "manifest": manifest.get("schema") == 1,
                "originalFiles": sum(1 for e in manifest.get("files", [])
                                     if isinstance(e, dict) and e.get("existed")),
            })
    except (OSError, ValueError):
        pass
    return result


def log_categories(path):
    try:
        if not path.is_file():
            return {"present": False}
        with path.open("rb") as stream:
            stream.seek(0, os.SEEK_END)
            stream.seek(max(0, stream.tell() - 48000))
            tail = stream.read()
        return {"present": True, "errors": {
            label: len(re.findall(pattern, tail, flags=re.IGNORECASE))
            for label, pattern in PATTERNS.items()
            if re.search(pattern, tail, flags=re.IGNORECASE)
        }}
    except OSError:
        return {"present": False, "reason": "unreadable"}


def frontend_check():
    base = {name: file_info(UI / name)
            for name in ("index.html", "sw.js", "travis-3d.mjs",
                         "travis-voice.mjs", "travis-continuity.mjs")}
    modules = []
    try:
        modules = sorted(UI.glob("*.mjs"), key=lambda p: p.stat().st_mtime,
                         reverse=True)
    except OSError:
        pass
    result = {"files": base, "moduleCount": len(modules)}
    node = shutil.which("node")
    if not node:
        result["syntax"] = "node_unavailable"
        return result
    checked, broken = 0, []
    for path in modules[:12]:
        try:
            x = subprocess.run([node, "--check", str(path)], capture_output=True,
                               timeout=4, check=False)
            checked += 1
            if x.returncode != 0:
                broken.append(path.name)
        except (OSError, subprocess.TimeoutExpired):
            broken.append(path.name)
    result["syntaxChecked"] = checked
    result["syntaxFailedModules"] = broken[:12]
    return result


def main():
    emit("AUDIT_MODE", "READ_ONLY_NO_CHANGES")
    emit("DEVICE_ARCH", platform.machine())
    j = http_health(8770)
    c = http_health(8765)
    emit("JARVIS_HEALTH", j)
    emit("JARVIS_CODE_LOCATION", process_path(j.get("pid")))
    emit("CENTRO_HEALTH", c)
    emit("LAYA_HEALTH", http_health(18790))
    emit("LOCAL_MODEL_HEALTH", http_health(8771))
    emit("JARVIS_SOURCE", source_check(HOME / "jarvis_local.py"))
    emit("GITHUB_RUST", github_check())
    emit("STATION", station_check())
    emit("RUST_BACKUPS", recent_backups())
    emit("UI", frontend_check())
    emit("JARVIS_LOG", log_categories(STATE / "router.log"))
    emit("STATION_LOG", log_categories(STATION / "supervisor.log"))
    emit("AUDIT_END", "READ_ONLY_COMPLETE")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit("AUDIT_ERROR_TYPE", type(exc).__name__)
        emit("AUDIT_END", "INCOMPLETE_READ_ONLY")
        sys.exit(1)
