#!/usr/bin/env python3
"""OPPO Travis front-end/voice serving smoke test: strictly read-only GETs.

Does not send commands, load a model, restart anything or print private content.
Checks current file serving to distinguish historic JSON bytes errors from a
still-broken Jarvis static file route.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

ORIGIN = "http://127.0.0.1:8770"
ASSETS = (
    ("/", "text/html"),
    ("/voice", "text/html"),
    ("/sw.js", "javascript"),
    ("/travis-voice-input.mjs", "javascript"),
    ("/travis-voice-stream.mjs", "javascript"),
    ("/travis-3d.mjs", "javascript"),
)

def emit(key, obj):
    print(key + "=" + json.dumps(obj, ensure_ascii=False, separators=(",", ":")), flush=True)


def get(path, kind):
    start = time.monotonic()
    req = urllib.request.Request(
        ORIGIN + path, headers={"Accept": "*/*", "User-Agent": "Travis-OPPO-Static-Smoke/1"},
        method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            content_type = res.headers.get("Content-Type", "").split(";", 1)[0].lower()
            data = res.read(1000001)
            status = res.status
        mime_ok = kind in content_type or (
            kind == "javascript" and content_type in {"application/x-javascript", "text/plain"})
        if kind == "text/html":
            mime_ok = content_type == kind
        return {"pass": status == 200 and mime_ok and 40 < len(data) <= 1000000,
                "http": status, "bytes": len(data), "contentType": content_type[:55],
                "elapsedMs": int(1000 * (time.monotonic() - start))}
    except urllib.error.HTTPError as exc:
        return {"pass": False, "http": exc.code,
                "errorType": "HTTPError",
                "elapsedMs": int(1000 * (time.monotonic() - start))}
    except (OSError, ValueError) as exc:
        return {"pass": False, "errorType": type(exc).__name__,
                "elapsedMs": int(1000 * (time.monotonic() - start))}


def existing_pids():
    result = []
    try:
        for proc in Path("/proc").iterdir():
            if not proc.name.isdigit():
                continue
            try:
                argv = (proc / "cmdline").read_bytes().split(b"\0")
            except (OSError, PermissionError):
                continue
            # Do not display command lines or environment variables.
            if any(Path(arg.decode("utf-8", "replace")).name == "jarvis_local.py"
                   for arg in argv) and b"serve" in argv:
                result.append(int(proc.name))
    except OSError:
        pass
    return sorted(result)


def timestamps():
    items = {"routerLog": Path.home() / ".centro-jarvis/router.log",
             "stationLog": Path.home() / ".centro-station/supervisor.log",
             "jarvisLocal": Path.home() / "jarvis_local.py"}
    report = {}
    for label, path in items.items():
        try:
            st = path.stat()
            report[label] = {"exists": True, "lastModified":
                time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime)),
                "ageMinutes": round((time.time() - st.st_mtime) / 60)}
        except OSError:
            report[label] = {"exists": False}
    return report


def main():
    emit("CHECK_MODE", "HTTP_GET_READ_ONLY")
    pids = existing_pids()
    emit("JARVIS_PROCESSES", {"count": len(pids), "pids": pids})
    checks = {}
    for path, kind in ASSETS:
        result = get(path, kind)
        checks[path] = result
        emit("GET_" + path.replace("/", "_").replace(".", "_").strip("_").upper()
             if path != "/" else "GET_INDEX", result)
    emit("SERVER_STATIC_ASSETS",
         {"tested": len(ASSETS), "passed": sum(bool(x["pass"]) for x in checks.values())})
    emit("LOG_TIMESTAMPS", timestamps())
    emit("AUDIT_END", "NO_FILES_OR_SERVICES_CHANGED")


if __name__ == "__main__":
    main()
