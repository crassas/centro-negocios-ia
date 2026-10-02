#!/usr/bin/env python3
import json
import os
import secrets
import signal
import subprocess
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8765
HOME = Path.home()
STATE_DIR = HOME / ".centro-server"
TOKEN_FILE = STATE_DIR / "token"
AGENT_PID_FILE = HOME / ".centro-agent" / "agent.pid"
STARTED_AT = time.time()
CMD_TIMEOUT = 120

REPOS = {
    "centro-negocios-ia": "https://github.com/crassas/centro-negocios-ia.git",
    "pente_houselanding": "https://github.com/crassas/pente_houselanding.git",
    "best-pizza-kebab": "https://github.com/crassas/best-pizza-kebab.git",
    "restaurante-2-irmaos": "https://github.com/crassas/restaurante-2-irmaos.git",
}

SITES = [
    ("Pentehouse", "https://pentehouse.pt/"),
    ("Best Pizza & Kebab", "https://bestpizzaandkebab.pt/"),
    ("Restaurante 2 Irmãos", "https://restaurantedoisirmaos.pt/"),
]


def ensure_token():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if token:
            return token
    token = secrets.token_urlsafe(32)
    TOKEN_FILE.write_text(token, encoding="utf-8")
    os.chmod(TOKEN_FILE, 0o600)
    return token


TOKEN = ensure_token()


def pid_running(path):
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
        os.kill(pid, 0)
        return True, pid
    except Exception:
        return False, None


def run_cmd(args, cwd=None, timeout=CMD_TIMEOUT):
    started = time.time()
    try:
        proc = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        return {
            "exitCode": proc.returncode,
            "stdout": proc.stdout[-12000:],
            "stderr": proc.stderr[-6000:],
            "durationMs": int((time.time() - started) * 1000),
        }
    except FileNotFoundError:
        return {
            "exitCode": 127,
            "stdout": "",
            "stderr": f"Comando não encontrado: {args[0]}",
            "durationMs": int((time.time() - started) * 1000),
        }
    except subprocess.TimeoutExpired:
        return {
            "exitCode": 124,
            "stdout": "",
            "stderr": "Tempo limite excedido.",
            "durationMs": int((time.time() - started) * 1000),
        }


def locate_repo(name):
    candidates = [
        HOME / name,
        HOME / "projects" / name,
        HOME / "repos" / name,
        Path("/root") / name,
        Path("/root/projects") / name,
    ]
    for path in candidates:
        if (path / ".git").is_dir():
            return path
    return None


def execute_action(task):
    action = str(task.get("action") or "")
    target = str(task.get("target") or "")

    if action == "system_info":
        import platform
        result = run_cmd(["node", "--version"])
        node = result["stdout"].strip() if result["exitCode"] == 0 else "indisponível"
        return {
            "exitCode": 0,
            "stdout": "\n".join([
                f"Host: {platform.node() or 'local'}",
                f"SO: {platform.platform()}",
                f"Python: {platform.python_version()}",
                f"Directório: {HOME}",
                f"Node: {node}",
            ]),
            "stderr": "",
            "durationMs": result["durationMs"],
        }

    if action == "site_check":
        rows = []
        started = time.time()
        for name, url in SITES:
            t0 = time.time()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Centro-Server/1.0"})
                with urllib.request.urlopen(req, timeout=15) as res:
                    rows.append(f"{name}: HTTP {res.status} · {int((time.time()-t0)*1000)} ms")
            except Exception as exc:
                rows.append(f"{name}: FALHA · {exc}")
        return {
            "exitCode": 0,
            "stdout": "\n".join(rows),
            "stderr": "",
            "durationMs": int((time.time() - started) * 1000),
        }

    if action in {"git_status", "git_pull"}:
        if target not in REPOS:
            return {"exitCode": 2, "stdout": "", "stderr": "Projecto não permitido.", "durationMs": 0}
        path = locate_repo(target)
        if not path:
            return {
                "exitCode": 3,
                "stdout": "",
                "stderr": f"Repositório {target} ainda não existe localmente.",
                "durationMs": 0,
            }

        if action == "git_status":
            return run_cmd(["git", "status", "--short", "--branch"], cwd=path)

        origin = run_cmd(["git", "remote", "get-url", "origin"], cwd=path)
        expected = REPOS[target].removesuffix(".git")
        actual = origin["stdout"].strip().removesuffix(".git")
        if origin["exitCode"] != 0 or actual != expected:
            return {
                "exitCode": 4,
                "stdout": "",
                "stderr": "Remote Git não corresponde ao repositório autorizado.",
                "durationMs": origin["durationMs"],
            }
        return run_cmd(["git", "pull", "--ff-only"], cwd=path)

    return {
        "exitCode": 126,
        "stdout": "",
        "stderr": f"Acção não permitida pelo Centro Server: {action}",
        "durationMs": 0,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "CentroServer/1.0"

    def log_message(self, fmt, *args):
        print(
            time.strftime("%Y-%m-%d %H:%M:%S"),
            self.address_string(),
            fmt % args,
            flush=True,
        )

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def authorised(self):
        value = self.headers.get("authorization", "")
        return value == "Bearer " + TOKEN

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/health":
            self.send_json(
                200,
                {
                    "ok": True,
                    "service": "centro-server",
                    "host": HOST,
                    "port": PORT,
                    "private": True,
                    "uptimeSeconds": int(time.time() - STARTED_AT),
                },
            )
            return

        if not self.authorised():
            self.send_json(401, {"ok": False, "error": "Não autorizado."})
            return

        if path == "/status":
            agent_active, agent_pid = pid_running(AGENT_PID_FILE)
            self.send_json(
                200,
                {
                    "ok": True,
                    "server": {
                        "host": HOST,
                        "port": PORT,
                        "private": True,
                        "pid": os.getpid(),
                        "uptimeSeconds": int(time.time() - STARTED_AT),
                    },
                    "agent": {
                        "active": agent_active,
                        "pid": agent_pid,
                    },
                },
            )
            return

        self.send_json(404, {"ok": False, "error": "Rota não encontrada."})

    def do_POST(self):
        path = urlparse(self.path).path

        if not self.authorised():
            self.send_json(401, {"ok": False, "error": "Não autorizado."})
            return

        if path == "/execute":
            size = min(int(self.headers.get("content-length", "0") or 0), 65536)
            raw = self.rfile.read(size) if size else b""
            try:
                task = json.loads(raw.decode("utf-8")) if raw else {}
            except Exception:
                self.send_json(400, {"ok": False, "error": "JSON inválido."})
                return
            result = execute_action(task if isinstance(task, dict) else {})
            self.send_json(200, {"ok": True, "result": result})
            return

        if path == "/echo":
            size = min(int(self.headers.get("content-length", "0") or 0), 32768)
            raw = self.rfile.read(size) if size else b""
            try:
                payload = json.loads(raw.decode("utf-8")) if raw else {}
            except Exception:
                self.send_json(400, {"ok": False, "error": "JSON inválido."})
                return
            self.send_json(200, {"ok": True, "received": payload})
            return

        self.send_json(404, {"ok": False, "error": "Rota não encontrada."})


def main():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)

    def stop_server(signum, frame):
        print("A parar Centro Server...", flush=True)
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop_server)
    signal.signal(signal.SIGINT, stop_server)

    print(f"Centro Server privado activo em http://{HOST}:{PORT}", flush=True)
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        print("Centro Server parado.", flush=True)


if __name__ == "__main__":
    main()
