#!/usr/bin/env python3
"""Travis/OPPO targeted forensic diagnostics (read-only, privacy-preserving).

No file modifications, restarts, models started, secrets printed, or remote
requests. Outputs only exception *types* and code-file/line/function locations;
never prints raw logs, prompts, trace messages, or API keys.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import json
import os
import re
import time

HOME = Path.home()
ROOT = HOME / ".centro-jarvis"
SROOT = HOME / ".centro-station"
MODEL = HOME / ".centro-models"
FILE_LENGTH = 400_000
RECENT_TRACES = 12
TRACE_START = re.compile(r"(?m)^[^\S\r\n]*Traceback \(most recent call last\):[^\S\r\n]*$")
FRAMES = re.compile(r'(?m)^\s*File "([^"\n]{1,400})", line (\d+), in ([^\n]{1,160})')
TYPES = re.compile(r"(?m)^\s*(?:[a-zA-Z_]\w*[.])?([A-Za-z_]\w*(?:Error|Exception|Warning|Interrupt))(?::|$)")
SAFE_FILENAME = re.compile(r"[^a-zA-Z0-9_.-]")


def show(key, val):
    print(key + "=" + json.dumps(val, ensure_ascii=False, separators=(",", ":")))


def filename(value):
    return SAFE_FILENAME.sub("_", Path(value).name)[:75]


def details(path):
    if not path.is_file():
        return {"present": False}
    result = {"present": True}
    try:
        stat = path.stat()
        result["sizeKB"] = round(stat.st_size / 1024)
        result["lastModified"] = time.strftime("%Y-%m-%d %H:%M", time.localtime(stat.st_mtime))
        with path.open("rb") as fd:
            fd.seek(max(0, stat.st_size - FILE_LENGTH))
            raw = fd.read(FILE_LENGTH + 1).decode("utf-8", "replace")
        # If initial bytes cut an old traceback, skip the partial start.
        positions = [m.start() for m in TRACE_START.finditer(raw)]
        blocks = [raw[pos:positions[i+1] if i + 1 < len(positions) else len(raw)]
                  for i, pos in enumerate(positions)]
        fingerprints = []
        for block in blocks:
            types = TYPES.findall(block)
            frames = FRAMES.findall(block)
            if not types:
                continue
            last = frames[-1] if frames else None
            sig = {"type": types[-1][:55],
                   "file": filename(last[0]) if last else "unknown",
                   "line": int(last[1]) if last else None,
                   "function": SAFE_FILENAME.sub("_", last[2].strip())[:60] if last else "unknown"}
            fingerprints.append(sig)
        grouped = Counter((f["type"], f["file"], f["line"], f["function"]) for f in fingerprints)
        result["tracebacksInTail"] = len(positions)
        result["completeExceptionSignatures"] = len(fingerprints)
        result["mostFrequent"] = [
            {"type": a, "file": b, "line": c, "function": d, "count": n}
            for (a, b, c, d), n in grouped.most_common(8)]
        result["lastExceptions"] = fingerprints[-RECENT_TRACES:]
    except OSError:
        result["readError"] = "unavailable"
    return result


def model():
    llm_pid_path = ROOT / "llm.pid"
    is_running = False
    if llm_pid_path.is_file():
        try:
            pid = int(llm_pid_path.read_text().strip())
            is_running = b"llama-server" in (Path("/proc") / str(pid) / "cmdline").read_bytes()
        except (OSError, ValueError):
            pass
    mode = "unknown"
    try:
        config = (ROOT / "conversation-mode").read_text().strip().lower()
        mode = config if config in {"hybrid", "local", "offline", "auto"} else "custom"
    except OSError:
        mode = "not_configured"
    models = {}
    for name in ("main", "small", "fallback"):
        path = MODEL / "llm" / (name + ".gguf")
        models[name] = {"present": path.is_file(),
                        "megabytes": round(path.stat().st_size / (1024 * 1024))
                        if path.is_file() else 0}
    return {"conversationMode": mode, "llamaServerExecutable":
            (ROOT / "bin/llama-server").is_file(),
            "localModelProcessAlive": is_running, "models": models}


def knowledge():
    result = {"markerEnabled": (ROOT / "github-feed-enabled").is_file()}
    schedule = ROOT / "github-feed-schedule.json"
    if schedule.is_file():
        try:
            state = json.loads(schedule.read_text(encoding="utf-8"))
            if isinstance(state, dict):
                result["syncStates"] = {
                    name: {
                        "result": record.get("result") if record.get("result") in {
                            "updated", "unchanged", "error", "unknown"} else "other",
                        "lastAttempt": time.strftime("%Y-%m-%d %H:%M",
                                   time.localtime(record["lastAttempt"]))
                        if isinstance(record.get("lastAttempt"), (int, float)) else "unknown",
                    }
                    for name, record in state.items() if name in {"pilot", "native", "rust-book"} and isinstance(record, dict)}
        except (OSError, ValueError, OverflowError):
            result["syncStates"] = "unavailable"
    return result


def main():
    show("AUDIT", "TRAVIS_TARGETED_ERRORS_READ_ONLY")
    show("MODEL_STATUS", model())
    show("GITHUB_SYNC", knowledge())
    show("JARVIS_ROUTER_ERRORS", details(ROOT / "router.log"))
    show("JARVIS_LLM_ERRORS", details(ROOT / "llm.log"))
    show("STATION_ERRORS", details(SROOT / "supervisor.log"))
    show("END", "NO_FILES_OR_SERVICES_CHANGED")


if __name__ == "__main__":
    main()
