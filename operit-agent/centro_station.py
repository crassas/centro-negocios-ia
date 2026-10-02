#!/usr/bin/env python3
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
STATE_DIR = HOME / ".centro-station"
STATUS_FILE = STATE_DIR / "status.json"
SERVER_PID_FILE = HOME / ".centro-server" / "server.pid"
AGENT_PID_FILE = HOME / ".centro-agent" / "agent.pid"
SERVER_CTL = Path("/usr/local/bin/centroserver")
AGENT_CTL = Path("/usr/local/bin/centroctl")
OPENCLAW_CTL = Path("/usr/local/bin/openclawctl")
OPENCLAW_HEALTH = "http://127.0.0.1:18789/healthz"
INTERVAL = 3
OPENCLAW_RETRY_SECONDS = 30


def pid_running(path):
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
        os.kill(pid, 0)
        return True, pid
    except Exception:
        return False, None


def server_healthy():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8765/health", timeout=3) as res:
            data = json.loads(res.read().decode("utf-8"))
            return res.status == 200 and data.get("ok") is True
    except Exception:
        return False



def openclaw_healthy():
    try:
        with urllib.request.urlopen(OPENCLAW_HEALTH, timeout=3) as res:
            return 200 <= res.status < 500
    except Exception:
        return False



def run_ctl(path, command):
    if not path.exists():
        return False, f"Falta {path}"
    proc = subprocess.run(
        [str(path), command],
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )
    output = (proc.stdout or proc.stderr or "").strip()[-1200:]
    return proc.returncode == 0, output


def write_status(payload):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATUS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATUS_FILE)


def main():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    print("Centro Station supervisor activo. Ctrl+C para parar.", flush=True)
    last_openclaw_attempt = 0

    while True:
        now = int(time.time())
        actions = []

        server_active, server_pid = pid_running(SERVER_PID_FILE)
        healthy = server_active and server_healthy()
        if not healthy:
            ok, output = run_ctl(SERVER_CTL, "restart" if server_active else "start")
            actions.append({"service": "server", "ok": ok, "output": output})
            time.sleep(2)
            server_active, server_pid = pid_running(SERVER_PID_FILE)
            healthy = server_active and server_healthy()

        agent_active, agent_pid = pid_running(AGENT_PID_FILE)
        if not agent_active and healthy:
            ok, output = run_ctl(AGENT_CTL, "start")
            actions.append({"service": "agent", "ok": ok, "output": output})
            time.sleep(1)
            agent_active, agent_pid = pid_running(AGENT_PID_FILE)

        openclaw_ok = openclaw_healthy()
        if (
            not openclaw_ok
            and OPENCLAW_CTL.exists()
            and now - last_openclaw_attempt >= OPENCLAW_RETRY_SECONDS
        ):
            last_openclaw_attempt = now
            ok, output = run_ctl(OPENCLAW_CTL, "start")
            actions.append({"service": "openclaw", "ok": ok, "output": output})
            if ok:
                time.sleep(2)
                openclaw_ok = openclaw_healthy()

        write_status({
            "ok": bool(healthy and agent_active),
            "timestamp": now,
            "server": {
                "active": server_active,
                "healthy": healthy,
                "pid": server_pid,
            },
            "agent": {
                "active": agent_active,
                "pid": agent_pid,
            },
            "openclaw": {
                "healthy": openclaw_ok,
                "endpoint": "127.0.0.1:18789",
            },
            "actions": actions,
        })

        if actions:
            for action in actions:
                print(
                    f"[auto] {action['service']} · "
                    f"{'OK' if action['ok'] else 'FALHA'} · {action['output']}",
                    flush=True,
                )

        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Centro Station supervisor parado.", flush=True)
