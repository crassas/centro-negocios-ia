#!/usr/bin/env python3
"""Read-only deployment preflight for Travis Rust on Ubuntu aarch64.

Prints bounded diagnostics, never credentials, tokens, file contents, or private data.
Does not create databases, enable services, restart daemons or alter active code.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import sys
import urllib.request
from pathlib import Path

PINNED = "c88be1bd159cd6b2f55c07fc1d0b9fe1d8bf60a6"
HOME = Path.home()
STAGE = HOME / "travis-rust-stage"
RUST = STAGE / "rust/travis-memory/target/release/libtravis_memory.so"
BRIDGE = STAGE / "operit-agent"


def get_health(url):
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            data = json.load(response)
        if not isinstance(data, dict):
            return {"reachable": True, "valid": False}
        return {
            "reachable": True,
            "ok": data.get("ok") is True,
            "service": str(data.get("service", "unknown"))[:40],
            "busy": data.get("busy") is True,
        }
    except (OSError, ValueError, TimeoutError):
        return {"reachable": False}


def git_blob_sha(path):
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def main():
    print("TRAVIS_RUST_OPPO_PREFLIGHT=v1")
    arch = platform.machine().lower()
    print("ARCH=" + arch)
    print("STAGE_VERIFIED=" + str(
        (STAGE / ".verified-commit").exists() and
        (STAGE / ".verified-commit").read_text().strip() == PINNED))
    print("LIBRARY_PRESENT=" + str(RUST.is_file() and RUST.stat().st_size > 1000))
    try:
        sys.path.insert(0, str(BRIDGE))
        from travis_rust_memory import score_overlaps
        os.environ["TRAVIS_RUST_MEMORY_LIB"] = str(RUST)
        value = score_overlaps("memória Rust", [{
            "title": "Memória Rust", "body": "Código para o Travis"
        }])
        print("ARM64_RUST_CALL=" + ("PASS" if value == [4.0] else "FAIL"))
        rust_ok = value == [4.0]
    except (ImportError, OSError, RuntimeError, ValueError) as exc:
        print("ARM64_RUST_CALL=FAIL")
        print("RUST_ERROR_TYPE=" + type(exc).__name__)
        rust_ok = False

    for name, port in (("JARVIS", 8770), ("CENTRO", 8765)):
        checked = get_health(f"http://127.0.0.1:{port}/health")
        print(name + "_HEALTH=" + json.dumps(checked, separators=(",", ":")))

    installed = HOME / "jarvis_local.py"
    if installed.is_file():
        print("JARVIS_INSTALLED=yes")
        print("JARVIS_GIT_BLOB=" + git_blob_sha(installed))
        source = installed.read_text(encoding="utf-8", errors="replace")
        print("JARVIS_ALREADY_HAS_GITHUB_HOOK=" +
              str("travis_github_runtime" in source))
    else:
        print("JARVIS_INSTALLED=no")

    station = HOME / "centro_station.py"
    if station.is_file():
        source = station.read_text(encoding="utf-8", errors="replace")
        print("STATION_UPDATES_FROM_MAIN=" +
              str("MAIN_COMMIT_API" in source and "commits/main" in source))
        print("STATION_HAS_GITHUB_MODULES=" +
              str('"travis_github_runtime.py"' in source))
    else:
        print("STATION_INSTALLED=no")

    state = HOME / ".centro-station/status.json"
    if state.is_file():
        try:
            data = json.loads(state.read_text(encoding="utf-8"))
            autoupdate = data.get("autoupdate", {})
            if isinstance(autoupdate, dict):
                print("STATION_AUTOUPDATE_ENABLED=" +
                      str(autoupdate.get("enabled", "unknown")))
        except (OSError, ValueError):
            print("STATION_STATUS_READ=unavailable")

    marker = HOME / ".centro-jarvis/github-feed-enabled"
    print("GITHUB_FEED_MARKER=" + ("enabled" if marker.is_file() else "disabled"))
    can_review = arch in {"aarch64", "arm64"} and rust_ok and installed.is_file()
    print("RUST_OPPO_PREFLIGHT=" + ("READY_FOR_REVIEW" if can_review else "NEEDS_INSPECTION"))
    print("NO_ACTIVE_FILES_CHANGED=true")


if __name__ == "__main__":
    main()
