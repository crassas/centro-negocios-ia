#!/usr/bin/env python3
import json
import os
import platform
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://centro-negocios-ai.travisthejarvis.workers.dev"
HOME = Path.home()
STATE_DIR = HOME / ".centro-agent"
TOKEN_FILE = STATE_DIR / "token"
POLL_SECONDS = 4
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


def api(path, method="GET", payload=None, token=None, timeout=35):
    headers = {"User-Agent": "Centro-Operit-Agent/1.0"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def load_token():
    try:
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def save_token(token):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(token, encoding="utf-8")
    os.chmod(TOKEN_FILE, 0o600)


def pair():
    print("Pedido de emparelhamento enviado ao Telegram.", flush=True)
    result = api("/api/operit/pair", method="POST", payload={})
    pair_id = result["pairId"]
    print("Carrega em ✅ Autorizar no @furalife_bot.", flush=True)
    deadline = time.time() + 600
    while time.time() < deadline:
        time.sleep(2)
        status = api("/api/operit/pair-status?id=" + pair_id)
        state = status.get("status")
        if state == "approved" and status.get("token"):
            save_token(status["token"])
            print("Operit ligado ao Centro de Negócios.", flush=True)
            return status["token"]
        if state in {"rejected", "expired", "missing"}:
            raise RuntimeError("Emparelhamento: " + state)
    raise RuntimeError("Tempo de emparelhamento esgotado.")


def run_cmd(args, cwd=None):
    started = time.time()
    try:
        proc = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            text=True,
            capture_output=True,
            timeout=CMD_TIMEOUT,
            check=False,
        )
        return proc.returncode, proc.stdout[-12000:], proc.stderr[-6000:], int((time.time() - started) * 1000)
    except FileNotFoundError:
        return 127, "", f"Comando não encontrado: {args[0]}", int((time.time() - started) * 1000)
    except subprocess.TimeoutExpired:
        return 124, "", "Tempo limite excedido.", int((time.time() - started) * 1000)


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


def action_system_info(task):
    lines = [
        f"Host: {platform.node() or 'local'}",
        f"SO: {platform.platform()}",
        f"Python: {platform.python_version()}",
        f"Directório: {HOME}",
    ]
    code, out, err, ms = run_cmd(["node", "--version"])
    if code == 0:
        lines.append("Node: " + out.strip())
    return 0, "\n".join(lines), "", ms


def action_site_check(task):
    rows = []
    started = time.time()
    for name, url in SITES:
        t0 = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Centro-Operit-Agent/1.0"})
            with urllib.request.urlopen(req, timeout=15) as res:
                rows.append(f"{name}: HTTP {res.status} · {int((time.time()-t0)*1000)} ms")
        except Exception as exc:
            rows.append(f"{name}: FALHA · {exc}")
    return 0, "\n".join(rows), "", int((time.time() - started) * 1000)


def action_git_status(task):
    repo = task.get("target", "")
    if repo not in REPOS:
        return 2, "", "Projecto não permitido.", 0
    path = locate_repo(repo)
    if not path:
        return 3, "", f"Repositório {repo} ainda não existe localmente.", 0
    return run_cmd(["git", "status", "--short", "--branch"], cwd=path)


def action_git_pull(task):
    repo = task.get("target", "")
    if repo not in REPOS:
        return 2, "", "Projecto não permitido.", 0
    path = locate_repo(repo)
    if not path:
        return 3, "", f"Repositório {repo} ainda não existe localmente.", 0
    code, origin, err, _ = run_cmd(["git", "remote", "get-url", "origin"], cwd=path)
    expected = REPOS[repo].removesuffix(".git")
    actual = origin.strip().removesuffix(".git")
    if code != 0 or actual != expected:
        return 4, "", "Remote Git não corresponde ao repositório autorizado.", 0
    return run_cmd(["git", "pull", "--ff-only"], cwd=path)


ACTIONS = {
    "system_info": action_system_info,
    "site_check": action_site_check,
    "git_status": action_git_status,
    "git_pull": action_git_pull,
}


def execute(task):
    action = task.get("action", "")
    handler = ACTIONS.get(action)
    if not handler:
        return 126, "", f"Acção não permitida: {action}", 0
    return handler(task)


def work_once(token):
    response = api("/api/operit/pull", token=token)
    task = response.get("task")
    if not task:
        return False
    print(f"[{task['id']}] {task.get('label', task.get('action'))}", flush=True)
    exit_code, stdout, stderr, duration = execute(task)
    api(
        "/api/operit/result",
        method="POST",
        token=token,
        payload={
            "id": task["id"],
            "exitCode": exit_code,
            "stdout": stdout,
            "stderr": stderr,
            "durationMs": duration,
        },
    )
    print(f"Concluído · exit={exit_code}", flush=True)
    return True


def main():
    token = load_token()
    if not token:
        token = pair()

    if "--status" in sys.argv:
        print(json.dumps(api("/api/operit/status", token=token), indent=2, ensure_ascii=False))
        return

    if "--once" in sys.argv:
        work_once(token)
        return

    print("Centro Agent activo. Ctrl+C para parar.", flush=True)
    while True:
        try:
            if not work_once(token):
                time.sleep(POLL_SECONDS)
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                print("Autorização inválida. Apaga ~/.centro-agent/token e reinicia.", file=sys.stderr)
                return
            print(f"HTTP {exc.code}", file=sys.stderr)
            time.sleep(5)
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"Ligação: {exc}", file=sys.stderr)
            time.sleep(5)
        except KeyboardInterrupt:
            print("\nCentro Agent parado.")
            return
        except Exception as exc:
            print(f"Erro: {exc}", file=sys.stderr)
            time.sleep(5)


if __name__ == "__main__":
    main()
