#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
STATE_DIR = HOME / ".centro-station"
STATUS_FILE = STATE_DIR / "status.json"
SERVER_PID_FILE = HOME / ".centro-server" / "server.pid"
AGENT_PID_FILE = HOME / ".centro-agent" / "agent.pid"
SUPERVISOR_PATH = Path(__file__).resolve()


def locate_ctl(name):
    candidates = [
        Path("/usr/local/bin") / name,
        HOME / ".local" / "bin" / name,
    ]
    return next((p for p in candidates if p.exists()), candidates[0])


SERVER_CTL = locate_ctl("centroserver")
AGENT_CTL = locate_ctl("centroctl")
OPENCLAW_CTL = locate_ctl("openclawctl")
LAYA_CTL = locate_ctl("layactl")
OPENCLAW_HEALTH = "http://127.0.0.1:18789/healthz"
LAYA_HEALTH = "http://127.0.0.1:18790/health"
INTERVAL = 3
OPTIONAL_RETRY_SECONDS = 45
AUTOUPDATE_INTERVAL_SECONDS = max(
    120,
    int(os.environ.get("CENTRO_AUTOUPDATE_INTERVAL", "600") or "600"),
)
AUTOUPDATE_ENABLED = os.environ.get("CENTRO_AUTOUPDATE", "1").strip().lower() not in {"0", "false", "no", "off"}
OPENCLAW_AUTOSTART = os.environ.get("CENTRO_OPENCLAW_AUTOSTART", "1").strip().lower() not in {"0", "false", "no", "off"}
LAYA_AUTOSTART = os.environ.get("CENTRO_LAYA_AUTOSTART", "1").strip().lower() not in {"0", "false", "no", "off"}
RAW_BASE = "https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent"
RUNTIME_FILES = {
    "centro_server.py": HOME / "centro_server.py",
    "centro_agent.py": HOME / "centro_agent.py",
    "centro_station.py": SUPERVISOR_PATH,
}


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


def laya_healthy():
    try:
        with urllib.request.urlopen(LAYA_HEALTH, timeout=3) as res:
            return res.status == 200
    except Exception:
        return False


def run_ctl(path, command):
    if not path.exists():
        return False, f"Falta {path}"
    try:
        proc = subprocess.run(
            [str(path), command],
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
    except Exception as exc:
        return False, str(exc)
    output = (proc.stdout or proc.stderr or "").strip()[-1200:]
    return proc.returncode == 0, output


def download_runtime(name):
    req = urllib.request.Request(
        RAW_BASE + "/" + name + "?t=" + str(int(time.time())),
        headers={
            "User-Agent": "Centro-Station-Autoupdate/1.0",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        if res.status != 200:
            raise RuntimeError(f"HTTP {res.status}")
        return res.read().decode("utf-8")


def atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".centro-new")
    tmp.write_text(text, encoding="utf-8")
    os.chmod(tmp, 0o700)
    tmp.replace(path)


def sync_runtime():
    """
    Mantém Server/Agent/Supervisor alinhados com main.
    Só instala Python que compila; falhas de rede nunca derrubam a estação.
    """
    changed = []
    errors = []
    for name, dest in RUNTIME_FILES.items():
        try:
            remote = download_runtime(name)
            compile(remote, str(dest), "exec")
            current = dest.read_text(encoding="utf-8") if dest.exists() else ""
            if current == remote:
                continue
            atomic_write(dest, remote)
            changed.append(name)
        except Exception as exc:
            errors.append(name + ": " + str(exc)[:300])
    return changed, errors


def write_status(payload):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATUS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATUS_FILE)


def main():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    print("Centro Station supervisor activo. Ctrl+C para parar.", flush=True)
    last_openclaw_attempt = 0
    last_laya_attempt = 0
    last_update_attempt = 0
    last_update_ok = 0
    last_update_error = ""

    while True:
        now = int(time.time())
        actions = []
        reexec_station = False

        if AUTOUPDATE_ENABLED and now - last_update_attempt >= AUTOUPDATE_INTERVAL_SECONDS:
            last_update_attempt = now
            changed, update_errors = sync_runtime()
            if changed:
                if "centro_server.py" in changed:
                    ok, output = run_ctl(SERVER_CTL, "restart")
                    actions.append({"service": "autoupdate/server", "ok": ok, "output": output})
                if "centro_agent.py" in changed:
                    ok, output = run_ctl(AGENT_CTL, "restart")
                    actions.append({"service": "autoupdate/agent", "ok": ok, "output": output})
                if "centro_station.py" in changed:
                    actions.append({"service": "autoupdate/station", "ok": True, "output": "nova versão validada"})
                    reexec_station = True
            if update_errors:
                last_update_error = " | ".join(update_errors)[-1000:]
            else:
                last_update_ok = now
                last_update_error = ""

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
            OPENCLAW_AUTOSTART
            and not openclaw_ok
            and OPENCLAW_CTL.exists()
            and now - last_openclaw_attempt >= OPTIONAL_RETRY_SECONDS
        ):
            last_openclaw_attempt = now
            ok, output = run_ctl(OPENCLAW_CTL, "start")
            actions.append({"service": "openclaw", "ok": ok, "output": output})
            if ok:
                time.sleep(2)
                openclaw_ok = openclaw_healthy()

        laya_ok = laya_healthy()
        if (
            LAYA_AUTOSTART
            and not laya_ok
            and LAYA_CTL.exists()
            and now - last_laya_attempt >= OPTIONAL_RETRY_SECONDS
        ):
            last_laya_attempt = now
            try:
                subprocess.Popen(
                    [str(LAYA_CTL), "start"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                actions.append({"service": "laya", "ok": True, "output": "arranque solicitado"})
            except Exception as exc:
                actions.append({"service": "laya", "ok": False, "output": str(exc)})

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
                "autostart": OPENCLAW_AUTOSTART,
                "endpoint": "127.0.0.1:18789",
            },
            "laya": {
                "healthy": laya_ok,
                "autostart": LAYA_AUTOSTART,
                "endpoint": "127.0.0.1:18790",
            },
            "autoupdate": {
                "enabled": AUTOUPDATE_ENABLED,
                "intervalSeconds": AUTOUPDATE_INTERVAL_SECONDS,
                "lastAttempt": last_update_attempt,
                "lastOk": last_update_ok,
                "lastError": last_update_error,
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

        if reexec_station:
            print("[auto] station · REEXEC · supervisor actualizado", flush=True)
            os.execv(sys.executable, [sys.executable, str(SUPERVISOR_PATH)])

        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Centro Station supervisor parado.", flush=True)
