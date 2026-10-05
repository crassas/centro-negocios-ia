#!/usr/bin/env python3
import errno
import json
import os
import signal
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
STATE_DIR = HOME / ".centro-station"
STATUS_FILE = STATE_DIR / "status.json"
HEARTBEAT_FILE = STATE_DIR / "heartbeat"
SERVER_PID_FILE = HOME / ".centro-server" / "server.pid"
AGENT_PID_FILE = HOME / ".centro-agent" / "agent.pid"
SERVER_BUSY_FILE = HOME / ".centro-server" / "busy.json"
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
REMOTE_STATE_DIR = HOME / ".centro-remote"
REMOTE_PID_FILE = REMOTE_STATE_DIR / "remote.pid"
REMOTE_LOG_FILE = REMOTE_STATE_DIR / "remote.log"
REMOTE_MANAGED_FILE = REMOTE_STATE_DIR / "managed.json"
REMOTE_DEVICE_FILE = HOME / ".desktop-commander-device" / "device.json"
INTERVAL = 3
OPTIONAL_RETRY_SECONDS = 45
AUTOUPDATE_INTERVAL_SECONDS = max(
    120,
    int(os.environ.get("CENTRO_AUTOUPDATE_INTERVAL", "600") or "600"),
)
AUTOUPDATE_ENABLED = os.environ.get("CENTRO_AUTOUPDATE", "1").strip().lower() not in {"0", "false", "no", "off"}
OPENCLAW_AUTOSTART = os.environ.get("CENTRO_OPENCLAW_AUTOSTART", "1").strip().lower() not in {"0", "false", "no", "off"}
LAYA_AUTOSTART = os.environ.get("CENTRO_LAYA_AUTOSTART", "1").strip().lower() not in {"0", "false", "no", "off"}
REMOTE_DESKTOP_AUTOSTART = os.environ.get("CENTRO_REMOTE_DESKTOP_AUTOSTART", "1").strip().lower() not in {"0", "false", "no", "off"}
RAW_BASE = "https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent"
MAIN_COMMIT_API = "https://api.github.com/repos/crassas/centro-negocios-ia/commits/main"
RUNTIME_FILES = {
    "centro_server.py": HOME / "centro_server.py",
    "centro_agent.py": HOME / "centro_agent.py",
    "centro_station.py": SUPERVISOR_PATH,
    "centroctl.sh": AGENT_CTL,
    "serverctl.sh": SERVER_CTL,
    "stationctl.sh": locate_ctl("centrostation"),
    "openclawctl.sh": OPENCLAW_CTL,
    "layactl.sh": LAYA_CTL,
    "install_laya.sh": locate_ctl("layainstall"),
    "operit-workflows/centro-station-resilience.json": HOME / "centro-station-resilience.json",
}


def pid_running(path):
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
        os.kill(pid, 0)
        return True, pid
    except Exception:
        return False, None


def safe_mkdir(path):
    """Cria directórios tolerando o ENOSYS intermitente observado no PRoot."""
    try:
        path.mkdir(parents=True, exist_ok=True)
        return True
    except OSError as exc:
        if exc.errno == errno.ENOSYS and path.exists():
            return True
        raise


def server_busy():
    try:
        state = json.loads(SERVER_BUSY_FILE.read_text())
        return time.time()-float(state.get("startedAt") or 0) < 960 and process_alive(int(state.get("pid") or 0))
    except FileNotFoundError:
        return False
    except Exception:
        return SERVER_BUSY_FILE.exists()


def server_stale():
    try:
        state = json.loads(SERVER_BUSY_FILE.read_text())
        return time.time()-float(state.get("startedAt") or 0) > 960
    except Exception:
        return False


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


def process_alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except Exception:
        return False


def proc_cmdline(pid):
    try:
        raw = (Path("/proc") / str(int(pid)) / "cmdline").read_bytes().replace(b"\x00", b" ")
        return raw.decode("utf-8", errors="replace").strip()
    except Exception:
        return ""


def remote_command_pids():
    rows = []
    try:
        entries = list(Path("/proc").iterdir())
    except Exception:
        return rows
    for entry in entries:
        if not entry.name.isdigit():
            continue
        cmd = proc_cmdline(entry.name)
        low = cmd.lower()
        if "desktop-commander" in low and (" remote" in low or low.endswith(" remote")):
            rows.append(int(entry.name))
    return sorted(set(rows))


def remote_executor_pid():
    # O processo filho MCP recebe esta variável explicitamente do Remote Device.
    # É uma prova mais forte do que verificar apenas o processo npm/node pai.
    try:
        entries = list(Path("/proc").iterdir())
    except Exception:
        return None
    for entry in entries:
        if not entry.name.isdigit():
            continue
        try:
            env = (entry / "environ").read_bytes()
        except Exception:
            continue
        if b"DC_REMOTE_DEVICE=true" in env:
            return int(entry.name)
    return None


def remote_desktop_pid():
    try:
        pid = int(REMOTE_PID_FILE.read_text(encoding="utf-8").strip())
        if process_alive(pid):
            return pid
    except Exception:
        pass

    pids = remote_command_pids()
    if not pids:
        return None
    # Guarda o processo mais exterior; ao terminá-lo, npm/sh/node fecham a
    # árvore normalmente sem tocar no shell interactivo do utilizador.
    pid = pids[0]
    try:
        safe_mkdir(REMOTE_STATE_DIR)
        REMOTE_PID_FILE.write_text(str(pid), encoding="utf-8")
    except Exception:
        pass
    return pid


def remote_managed_state():
    try:
        data = json.loads(REMOTE_MANAGED_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def remote_log_health():
    if not REMOTE_LOG_FILE.exists():
        return None, "sem log gerido"
    try:
        with REMOTE_LOG_FILE.open("rb") as fh:
            size = fh.seek(0, 2)
            fh.seek(max(0, size - 48000))
            text = fh.read().decode("utf-8", errors="replace").lower()
    except Exception as exc:
        return None, "log ilegível: " + str(exc)[:120]

    success_markers = (
        "desktop commander remote is connected",
        "channel subscribed",
        "device ready:",
    )
    failure_markers = (
        "device registered, but not reachable",
        "realtime channel is not open",
        "increaseconnectionpool",
        "channel error",
        "remote channel subscription failed",
    )
    last_success = max([text.rfind(x) for x in success_markers] + [-1])
    last_failure = max([text.rfind(x) for x in failure_markers] + [-1])
    if last_failure > last_success:
        tail = text[max(0, last_failure - 180):last_failure + 420].replace("\n", " ")
        return False, tail[-600:]
    if last_success >= 0:
        return True, "canal remoto confirmado no log"
    return None, "canal ainda sem confirmação no log"


def remote_desktop_healthy():
    pid = remote_desktop_pid()
    executor = remote_executor_pid()
    log_ok, detail = remote_log_health()
    # O executor MCP é indispensável. Para processos antigos arrancados à mão
    # não existe log gerido; nesse caso o executor mantém o diagnóstico útil.
    ok = bool(pid and executor and log_ok is not False)
    return ok, pid, executor, detail


def stop_remote_desktop():
    pids = remote_command_pids()
    if not pids:
        REMOTE_PID_FILE.unlink(missing_ok=True)
        return True, "já parado"
    for pid in reversed(pids):
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    deadline = time.time() + 5
    while time.time() < deadline and any(process_alive(pid) for pid in pids):
        time.sleep(0.25)
    for pid in reversed(pids):
        if process_alive(pid):
            try:
                os.kill(pid, signal.SIGKILL)
            except Exception:
                pass
    REMOTE_PID_FILE.unlink(missing_ok=True)
    return True, "processo remoto reciclado"


def start_remote_desktop(force=False):
    if not REMOTE_DEVICE_FILE.exists():
        return False, "dispositivo ainda não emparelhado"

    current = remote_desktop_pid()
    if current and not force:
        return True, f"já activo · PID {current}"
    if current and force:
        stop_remote_desktop()
        time.sleep(1)

    binary = shutil.which("desktop-commander")
    if binary:
        command = [binary, "remote", "--debug"]
    else:
        npx = shutil.which("npx")
        if not npx:
            return False, "falta desktop-commander e npx"
        command = [npx, "-y", "@wonderwhy-er/desktop-commander@latest", "remote", "--debug"]

    try:
        safe_mkdir(REMOTE_STATE_DIR)
        # Cada arranque gerido começa um log limpo; assim uma falha antiga não
        # mascara uma recuperação actual.
        log = REMOTE_LOG_FILE.open("wb", buffering=0)
        proc = subprocess.Popen(
            command,
            cwd=str(HOME),
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        REMOTE_PID_FILE.write_text(str(proc.pid), encoding="utf-8")
        REMOTE_MANAGED_FILE.write_text(
            json.dumps({"pid": proc.pid, "startedAt": int(time.time())}),
            encoding="utf-8",
        )
        return True, f"arranque gerido solicitado · PID {proc.pid}"
    except Exception as exc:
        return False, str(exc)



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


def fetch_main_sha():
    req = urllib.request.Request(
        MAIN_COMMIT_API,
        headers={
            "User-Agent": "Centro-Station-Autoupdate/1.0",
            "Accept": "application/vnd.github+json",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read().decode("utf-8"))
        return str(data.get("sha") or "")[:40]


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


def atomic_write(path, text, mode=0o700):
    safe_mkdir(path.parent)
    tmp = path.with_name(path.name + ".centro-new")
    tmp.write_text(text, encoding="utf-8")
    os.chmod(tmp, mode)
    tmp.replace(path)


def validate_runtime_text(name, text, dest):
    if name.endswith(".py"):
        compile(text, str(dest), "exec")
        return
    if name.endswith(".json"):
        json.loads(text)
        return
    if name.endswith(".sh"):
        check = subprocess.run(
            ["sh", "-n"],
            input=text,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
        if check.returncode != 0:
            raise RuntimeError((check.stderr or check.stdout or "shell inválido")[-500:])


def sync_operit_workflow(local_path):
    copied = ""
    for storage_root in (Path("/sdcard"), Path("/storage/emulated/0")):
        download = storage_root / "Download"
        if not download.is_dir():
            continue
        dest_dir = download / "Operit" / "workflow"
        try:
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / "centro-station-resilience.json"
            dest.write_text(local_path.read_text(encoding="utf-8"), encoding="utf-8")
            copied = str(dest)
            break
        except Exception:
            continue
    return copied


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
            validate_runtime_text(name, remote, dest)
            current = dest.read_text(encoding="utf-8") if dest.exists() else ""
            if current == remote:
                continue
            mode = 0o600 if name.endswith(".json") else 0o700
            atomic_write(dest, remote, mode=mode)
            if name.endswith("centro-station-resilience.json"):
                sync_operit_workflow(dest)
            changed.append(name)
        except Exception as exc:
            errors.append(name + ": " + str(exc)[:300])
    return changed, errors


def write_heartbeat():
    """Sinal mínimo para o WorkManager distinguir processo vivo de PID fantasma."""
    try:
        safe_mkdir(STATE_DIR)
        tmp = HEARTBEAT_FILE.with_suffix(".tmp")
        tmp.write_text(str(int(time.time())), encoding="utf-8")
        tmp.replace(HEARTBEAT_FILE)
        return True
    except OSError as exc:
        print(f"[auto] heartbeat · FALHA TRANSITÓRIA · {exc}", flush=True)
        return False


def write_status(payload):
    # Estado é telemetria; uma falha transitória do PRoot nunca pode matar
    # o supervisor. Se nem o directório existente estiver utilizável, regista
    # no stdout e tenta novamente no ciclo seguinte.
    try:
        safe_mkdir(STATE_DIR)
        tmp = STATUS_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(STATUS_FILE)
        return True
    except OSError as exc:
        print(f"[auto] status · FALHA TRANSITÓRIA · {exc}", flush=True)
        return False


def main():
    safe_mkdir(STATE_DIR)
    print("Centro Station supervisor activo. Ctrl+C para parar.", flush=True)
    last_openclaw_attempt = 0
    last_laya_attempt = 0
    last_remote_attempt = 0
    last_update_attempt = 0
    last_update_ok = 0
    last_update_error = ""
    last_update_sha = ""
    last_busy_seen = 0
    pending_server_restart = False
    pending_agent_restart = False

    while True:
        now = int(time.time())
        write_heartbeat()
        actions = []
        reexec_station = False
        busy = server_busy()
        if busy:
            last_busy_seen = now

        if AUTOUPDATE_ENABLED and not (STATE_DIR / "maintenance").exists() and not busy and now - last_update_attempt >= AUTOUPDATE_INTERVAL_SECONDS:
            last_update_attempt = now
            try:
                candidate_sha = fetch_main_sha()
            except Exception:
                candidate_sha = ""
            changed, update_errors = sync_runtime()
            if changed:
                if "centro_server.py" in changed:
                    pending_server_restart = True
                    actions.append({"service": "autoupdate/server", "ok": True, "output": "actualização validada e preparada"})
                if "centro_agent.py" in changed:
                    pending_agent_restart = True
                    actions.append({"service": "autoupdate/agent", "ok": True, "output": "actualização validada e preparada"})
                if "centro_station.py" in changed:
                    actions.append({"service": "autoupdate/station", "ok": True, "output": "nova versão validada"})
                    reexec_station = True
            if update_errors:
                last_update_error = " | ".join(update_errors)[-1000:]
            else:
                last_update_ok = now
                last_update_error = ""
                if candidate_sha:
                    last_update_sha = candidate_sha

        # Nunca reinicia Server/Agent a meio de uma execução. Depois de o lock
        # desaparecer, dá alguns segundos ao Agent para publicar o resultado.
        busy = server_busy()
        if busy:
            last_busy_seen = now
        idle_after_task = (now - last_busy_seen) if last_busy_seen else 999999
        if not busy and idle_after_task >= 12:
            if pending_server_restart:
                ok, output = run_ctl(SERVER_CTL, "restart")
                actions.append({"service": "autoupdate/server-restart", "ok": ok, "output": output})
                if ok:
                    pending_server_restart = False
                    time.sleep(2)
            if pending_agent_restart:
                ok, output = run_ctl(AGENT_CTL, "restart")
                actions.append({"service": "autoupdate/agent-restart", "ok": ok, "output": output})
                if ok:
                    pending_agent_restart = False
                    time.sleep(1)

        server_active, server_pid = pid_running(SERVER_PID_FILE)
        healthy = server_active and server_healthy() and not server_stale()
        if not healthy:
            ok, output = run_ctl(SERVER_CTL, "restart" if server_active else "start")
            actions.append({"service": "server", "ok": ok, "output": output})
            time.sleep(2)
            server_active, server_pid = pid_running(SERVER_PID_FILE)
            healthy = server_active and server_healthy() and not server_stale()

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

        remote_ok, remote_pid, remote_executor, remote_detail = remote_desktop_healthy()
        remote_managed = remote_managed_state()
        if REMOTE_DESKTOP_AUTOSTART and REMOTE_DEVICE_FILE.exists() and not busy:
            # Se o utilizador arrancou manualmente um Remote que já está
            # saudável, adopta-o sem o matar. A versão anterior fazia um
            # "takeover" destrutivo: terminava exactamente o canal que acabara
            # de ficar ONLINE e só depois tentava criar outro em background.
            # Em Android/PRoot isso criava a sequência "connected -> Terminated".
            takeover = bool(remote_pid and not remote_managed)
            if takeover and remote_ok:
                try:
                    safe_mkdir(REMOTE_STATE_DIR)
                    REMOTE_PID_FILE.write_text(str(remote_pid), encoding="utf-8")
                    REMOTE_MANAGED_FILE.write_text(
                        json.dumps({
                            "pid": remote_pid,
                            "startedAt": now,
                            "adopted": True,
                        }),
                        encoding="utf-8",
                    )
                    remote_managed = remote_managed_state()
                    actions.append({
                        "service": "remote-desktop/adopção",
                        "ok": True,
                        "output": f"canal manual saudável adoptado sem reinício · PID {remote_pid}",
                    })
                except Exception as exc:
                    actions.append({
                        "service": "remote-desktop/adopção",
                        "ok": False,
                        "output": str(exc),
                    })

            managed_age = now - int(remote_managed.get("startedAt") or now)
            broken_managed = bool(
                remote_pid
                and remote_managed
                and managed_age >= 60
                and not remote_ok
            )
            missing = not remote_pid
            needs_takeover_repair = bool(takeover and not remote_ok)
            if (
                (needs_takeover_repair or broken_managed or missing)
                and now - last_remote_attempt >= OPTIONAL_RETRY_SECONDS
            ):
                last_remote_attempt = now
                ok, output = start_remote_desktop(force=bool(remote_pid))
                reason = (
                    "takeover-repair"
                    if needs_takeover_repair
                    else ("recuperação" if broken_managed else "arranque")
                )
                actions.append({
                    "service": "remote-desktop/" + reason,
                    "ok": ok,
                    "output": output + (" · " + remote_detail if remote_detail else ""),
                })
                if ok:
                    time.sleep(4)
                    remote_ok, remote_pid, remote_executor, remote_detail = remote_desktop_healthy()
                    remote_managed = remote_managed_state()

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
            "remoteDesktop": {
                "healthy": remote_ok,
                "autostart": REMOTE_DESKTOP_AUTOSTART,
                "configured": REMOTE_DEVICE_FILE.exists(),
                "managed": bool(remote_managed),
                "pid": remote_pid,
                "executorPid": remote_executor,
                "detail": remote_detail,
            },
            "autoupdate": {
                "enabled": AUTOUPDATE_ENABLED,
                "intervalSeconds": AUTOUPDATE_INTERVAL_SECONDS,
                "lastAttempt": last_update_attempt,
                "lastOk": last_update_ok,
                "lastError": last_update_error,
                "mainSha": last_update_sha,
                "serverBusy": busy,
                "pendingServerRestart": pending_server_restart,
                "pendingAgentRestart": pending_agent_restart,
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
