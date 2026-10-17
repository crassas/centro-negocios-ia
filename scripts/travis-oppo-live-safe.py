#!/usr/bin/env python3
"""OPPO/Travis live functional diagnostic — bounded, privacy-preserving.

Uses only the Jarvis local /health and three deterministic, read-only tool
intents. These may create ordinary local execution/telemetry events, but never
run an LLM, change code, edit repos, enable flags or restart any service.
Logs are inspected without printing messages, prompts, tokens or paths.
"""
from __future__ import annotations

import collections
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

HOME = Path.home()
ROOT = HOME / ".centro-jarvis"
ROUTER_URL = "http://127.0.0.1:8770"
STATION = HOME / ".centro-station"
MAX_TAIL = 220_000
FRAME = re.compile(r'(?m)^\s*File "([^"\r\n]{1,400})", line (\d+), in ([A-Za-z_][\w<>]{0,75})')
TYPE = re.compile(r"(?m)^\s*((?:\w+\.)*[A-Za-z_]\w*(?:Error|Exception))(?::|$)")
OBJECT_TYPE = re.compile(r"Object of type ([A-Za-z_][A-Za-z0-9_]{0,40}) is not JSON serializable")
TRACE = re.compile(r"(?m)^\s*Traceback \(most recent call last\):")


def output(label, obj):
    print(label + "=" + json.dumps(obj, separators=(",", ":"), ensure_ascii=False), flush=True)


def read_json(url, payload=None, timeout=8):
    headers = {"Origin": ROUTER_URL, "Accept": "application/json"}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise ValueError("HTTP response unavailable")
        raw = response.read(180001)
    if len(raw) > 180000:
        raise ValueError("Response too long")
    result = json.loads(raw)
    if not isinstance(result, dict):
        raise ValueError("Invalid response")
    return result


def log_report(path):
    try:
        if not path.is_file():
            return {"present": False}
        stat = path.stat()
        with path.open("rb") as file:
            file.seek(max(0, stat.st_size - MAX_TAIL))
            data = file.read(MAX_TAIL).decode("utf-8", "replace")
        positions = [m.start() for m in TRACE.finditer(data)]
        signatures = []
        for i, start in enumerate(positions):
            block = data[start:positions[i + 1]] if i + 1 < len(positions) else data[start:]
            t = TYPE.findall(block)
            frames = FRAME.findall(block)
            if not t:
                continue
            python_frames = [
                {"file": Path(name).name, "line": int(line), "function": fn}
                for name, line, fn in frames
                if Path(name).name in {
                    "jarvis_local.py", "travis_core.py", "travis_brain.py",
                    "travis_stream.py", "travis_github_runtime.py",
                    "travis_github_feed.py", "travis_cognitive.py",
                    "centro_station.py", "jarvis_sherpa.py",
                }
            ]
            typ = t[-1].split(".")[-1]
            record = {"exception": typ[:40],
                      "ownFrames": python_frames[-3:],
                      "lastFrame": (
                          {"file": Path(frames[-1][0]).name,
                           "line": int(frames[-1][1]),
                           "function": frames[-1][2]}
                          if frames else None)}
            if typ == "TypeError":
                matches = OBJECT_TYPE.findall(block)
                record["jsonObjectType"] = matches[-1] if matches else "unknown"
            signatures.append(record)
        wanted = {"TypeError", "RuntimeError", "TimeoutError", "BlockingIOError",
                  "BrokenPipeError", "ImportError", "AttributeError", "OSError"}
        selected = [row for row in signatures if row["exception"] in wanted]
        counts = collections.Counter(x["exception"] for x in selected)
        return {"present": True,
                "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(stat.st_mtime)),
                "tracebacksInTail": len(positions),
                "counts": dict(counts),
                "typeErrorExamples": [row for row in selected
                                      if row["exception"] == "TypeError"][-3:],
                "runtimeExamples": [row for row in selected
                                    if row["exception"] == "RuntimeError"][-3:],
                "singletonExamples": [row for row in selected
                                      if row["exception"] == "BlockingIOError"][-2:]}
    except OSError:
        return {"present": False, "reason": "unavailable"}


def verify():
    output("DIAGNOSTIC", "TRAVIS_LIVE_FUNCTIONAL_SAFE")
    health = {}
    try:
        health = read_json(ROUTER_URL + "/health", timeout=3)
        output("HEALTH", {
            "online": health.get("ok") is True,
            "service": str(health.get("service") or "")[:30],
            "busy": health.get("busy") is True,
            "voiceProtocol": str(health.get("voiceProtocol") or "")[:32],
            "liveStt": health.get("liveStt") is True,
        })
    except (OSError, ValueError, TimeoutError) as exc:
        output("HEALTH", {"online": False, "errorType": type(exc).__name__})
    if health.get("ok") is not True or health.get("service") != "jarvis":
        output("SMOKE_TESTS", "SKIPPED_OFFLINE")
    elif health.get("busy") is True:
        output("SMOKE_TESTS", "SKIPPED_BUSY")
    else:
        # Known explicit deterministic actions, not language-model questions.
        checks = (
            ("presence", "Travis, estás aí?", "presence"),
            ("github_status", "Travis, estado do GitHub", "github_knowledge_status"),
            ("github_read", "Travis, pesquisa no GitHub sobre Rust", "github_knowledge_search"),
        )
        for name, prompt, expected in checks:
            now = time.monotonic()
            try:
                result = read_json(ROUTER_URL + "/jarvis",
                                   {"text": prompt, "language": "pt"}, timeout=15)
                body = result.get("result")
                if not isinstance(body, dict):
                    body = {}
                records = body.get("results", [])
                if not isinstance(records, list):
                    records = []
                output("CHECK_" + name.upper(), {
                    "ok": result.get("ok") is True,
                    "tool": str(result.get("tool") or "")[:60],
                    "expected": expected,
                    "pass": result.get("ok") is True and result.get("tool") == expected,
                    "replyPresent": bool(result.get("reply")),
                    "retrievalEngine": str(body.get("engine") or "")[:20],
                    "referenceCount": len(records),
                    "feedWorkerRunning": body.get("running") is True if name == "github_status" else None,
                    "feedBusy": body.get("busy") is True if name == "github_status" else None,
                    "indexedSources": len(body.get("sources", [])) if name == "github_status" and isinstance(body.get("sources"), list) else None,
                    "lastSyncResult": str(body.get("lastResult") or "")[:30] if name == "github_status" else None,
                    "elapsedMs": round((time.monotonic() - now) * 1000),
                })
            except (OSError, ValueError, TimeoutError) as exc:
                output("CHECK_" + name.upper(), {
                    "pass": False, "errorType": type(exc).__name__,
                    "elapsedMs": round((time.monotonic() - now) * 1000),
                })

    output("GITHUB_RUST_STATE", {
        "enabled": (ROOT / "github-feed-enabled").is_file(),
        "libraryPresent": (ROOT / "bin/libtravis_memory.so").is_file(),
        "stationMaintenance": (STATION / "maintenance").is_file(),
    })
    output("JARVIS_LOG", log_report(ROOT / "router.log"))
    output("STATION_LOG", log_report(STATION / "supervisor.log"))
    output("DONE", "NO_CODE_CHANGES_NO_RESTARTS")


if __name__ == "__main__":
    verify()
