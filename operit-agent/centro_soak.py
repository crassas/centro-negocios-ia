#!/usr/bin/env python3
"""Bounded 24-hour operational observation; no paid inference or content writes."""
import fcntl
import importlib.util
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
ROOT = HOME / ".centro-station"
STATE = ROOT / "soak.json"
LOCK = ROOT / "soak.lock"

def save(state):
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    os.chmod(tmp, 0o600)
    tmp.replace(STATE)

def start(duration=86400):
    now = time.time()
    try:
        state = json.loads(STATE.read_text())
        if state.get("enabled") and state.get("deadline", 0) > now:
            return state
    except (OSError, ValueError):
        pass
    state = {"enabled": True, "startedAt": now, "deadline": now + duration,
             "phase": "observing", "samples": 0, "healthySamples": 0,
             "gaps": 0, "issues": 0, "probesPassed": 0, "probesFailed": 0,
             "lastSampleAt": 0, "nextProbeAt": now, "pendingProbe": None,
             "events": []}
    save(state)
    return state

def health(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status == 200
    except Exception:
        return False

def sample(state, now, checks):
    previous = state.get("lastSampleAt", 0)
    if previous and now - previous > 120:
        state["gaps"] += 1
        checks["continuousObservation"] = False
    state["lastSampleAt"] = now
    state["samples"] += 1
    state["lastChecks"] = checks
    if all(checks.values()):
        state["healthySamples"] += 1
    else:
        state["issues"] += 1
        state["events"] = (state.get("events", []) + [{"at": now, "failed": [k for k,v in checks.items() if not v]}])[-40:]
    if now >= state["deadline"]:
        state["enabled"] = False
        state["phase"] = "passed" if not state["issues"] and not state["gaps"] and state["probesPassed"] > 0 and not state["probesFailed"] and not state.get("pendingProbe") else "completed-with-issues"
    return state

def main():
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    if "--start" in sys.argv:
        print(json.dumps(start(), ensure_ascii=False))
        return
    lock = LOCK.open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return
    spec = importlib.util.spec_from_file_location("soak_agent", HOME / "centro_agent.py")
    agent = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(agent)
    token = agent.load_token()
    while True:
        state = json.loads(STATE.read_text())
        if not state.get("enabled"):
            return
        now = time.time()
        state["pid"] = os.getpid()
        save(state)
        checks = {"server": health("http://127.0.0.1:8765/health"),
                  "laya": health("http://127.0.0.1:18790/health")}
        try:
            station = json.loads((ROOT / "status.json").read_text())
            checks["supervisorFresh"] = now - station.get("timestamp", 0) < 90
            checks["agent"] = bool(station.get("agent", {}).get("active"))
            checks["remote"] = bool(station.get("remoteDesktop", {}).get("healthy"))
        except Exception:
            checks["supervisorFresh"] = False
        try:
            result = agent.api("/api/operit/status", token=token)
            checks["worker"] = bool(result.get("ok"))
            if state.get("pendingProbe"):
                executions = agent.api("/api/executions?limit=100", token=token).get("executions", [])
                task = next((t for t in executions if t.get("id") == state["pendingProbe"]["id"]), None)
                if task and task.get("status") == "completed":
                    key = "probesPassed" if task.get("exitCode") == 0 else "probesFailed"
                    state[key] += 1
                    state["lastProbe"] = {"id": task["id"], "exitCode": task.get("exitCode"), "at": now}
                    state["pendingProbe"] = None
                elif now - state["pendingProbe"]["at"] > 1500:
                    state["probesFailed"] += 1
                    state["pendingProbe"] = None
            if now < state["deadline"] and now >= state["nextProbeAt"] and not state.get("pendingProbe"):
                probe = agent.api("/api/operit/selftest", method="POST", token=token, payload={"quiet": True})
                state["pendingProbe"] = {"id": probe["id"], "at": now}
                state["nextProbeAt"] = now + 900
        except Exception as exc:
            checks["worker"] = False
            state["lastErrorType"] = type(exc).__name__
        sample(state, now, checks)
        save(state)
        if not state["enabled"]:
            return
        time.sleep(30)

if __name__ == "__main__":
    main()
