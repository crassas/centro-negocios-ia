#!/usr/bin/env python3
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://centro-negocios-ai.travisthejarvis.workers.dev"
SERVER_BASE = "http://127.0.0.1:8765"
HOME = Path.home()
STATE_DIR = HOME / ".centro-agent"
TOKEN_FILE = STATE_DIR / "token"
OLLAMA_KEY_FILE = STATE_DIR / "ollama_api_key"
SERVER_TOKEN_FILE = HOME / ".centro-server" / "token"
POLL_SECONDS = 0.75
CMD_TIMEOUT = 120
CLAUDE_TIMEOUT = 300

REPOS = {
    "centro-negocios-ia": "https://github.com/crassas/centro-negocios-ia.git",
    "pente_houselanding": "https://github.com/crassas/pente_houselanding.git",
    "best-pizza-kebab": "https://github.com/crassas/best-pizza-kebab.git",
    "restaurante-2-irmaos": "https://github.com/crassas/restaurante-2-irmaos.git",
    "engomadoria-beatriz": "https://github.com/crassas/engomadoria-beatriz.git",
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


def run_cmd(args, cwd=None, timeout=CMD_TIMEOUT, env=None):
    started = time.time()
    try:
        proc = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
            env=env,
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

def action_claude_query(task):
    prompt = str((task.get("args") or {}).get("prompt") or "").strip()
    if not prompt:
        return 2, "", "Pedido para o Claude Code em falta.", 0
    if len(prompt) > 5000:
        return 2, "", "Pedido demasiado longo.", 0

    target = task.get("target", "local")
    cwd = HOME
    if target != "local":
        if target not in REPOS:
            return 2, "", "Projecto não permitido.", 0
        cwd = locate_repo(target)
        if not cwd:
            return 3, "", f"Repositório {target} ainda não existe localmente.", 0

    claude = shutil.which("claude")
    if not claude:
        candidates = [
            HOME / ".local" / "bin" / "claude",
            Path("/usr/local/bin/claude"),
            Path("/usr/bin/claude"),
        ]
        claude = next((str(p) for p in candidates if p.exists()), None)
    if not claude:
        return 127, "", "Claude Code não foi encontrado.", 0

    system_note = (
        "Estás a responder através do Centro de Negócios no Telegram. "
        "Responde em português de Portugal, de forma directa e curta. "
        "Esta chamada está em modo de análise: não alteres ficheiros nem executes acções destrutivas."
    )

    try:
        key = OLLAMA_KEY_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        key = ""
    if not key:
        return 78, "", "Falta a chave Ollama validada em ~/.centro-agent/ollama_api_key.", 0

    claude_env = os.environ.copy()
    claude_env["ANTHROPIC_BASE_URL"] = "https://ollama.com"
    claude_env["ANTHROPIC_AUTH_TOKEN"] = key
    claude_env["OLLAMA_API_KEY"] = key
    claude_env.pop("ANTHROPIC_API_KEY", None)

    return run_cmd(
        [
            claude,
            "--model",
            "gpt-oss:120b",
            "--permission-mode",
            "plan",
            "--append-system-prompt",
            system_note,
            "-p",
            prompt,
        ],
        cwd=cwd,
        timeout=CLAUDE_TIMEOUT,
        env=claude_env,
    )


ACTIONS = {
    "system_info": action_system_info,
    "site_check": action_site_check,
    "git_status": action_git_status,
    "git_pull": action_git_pull,
    "claude_query": action_claude_query,
}


def execute(task):
    if task.get("action") == "council_run":
        topic = str((task.get("args") or {}).get("topic") or "").strip()
        if not topic:
            return 2, "", "Tema da mesa em falta.", 0
        token = load_token()
        if not token:
            return 78, "", "Centro Agent sem token.", 0
        started = time.time()
        try:
            response = api(
                "/api/council/run",
                method="POST",
                payload={"topic": topic},
                token=token,
                timeout=CLAUDE_TIMEOUT + 120,
            )
            if not response.get("ok"):
                return 1, "", str(response.get("error") or "Falha na Sala de Conselho."), int((time.time()-started)*1000)
            return 0, "Sala de Conselho concluída.", "", int((time.time()-started)*1000)
        except Exception as exc:
            return 1, "", "Falha na Sala de Conselho: " + str(exc), int((time.time()-started)*1000)

    try:
        server_token = SERVER_TOKEN_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return 70, "", "Centro Server sem token. Arranca primeiro: centroserver start", 0

    if not server_token:
        return 70, "", "Token do Centro Server vazio.", 0

    payload = json.dumps(task).encode("utf-8")
    req = urllib.request.Request(
        SERVER_BASE + "/execute",
        data=payload,
        method="POST",
        headers={
            "Authorization": "Bearer " + server_token,
            "Content-Type": "application/json",
            "User-Agent": "Centro-Agent-Bridge/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=CLAUDE_TIMEOUT + 30) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, "", f"Centro Server HTTP {exc.code}", 0
    except Exception as exc:
        return 71, "", f"Centro Server indisponível: {exc}", 0

    result = data.get("result") if isinstance(data, dict) else None
    if not isinstance(result, dict):
        return 72, "", "Resposta inválida do Centro Server.", 0

    return (
        int(result.get("exitCode", 1)),
        str(result.get("stdout") or ""),
        str(result.get("stderr") or ""),
        int(result.get("durationMs") or 0),
    )


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
            time.sleep(2)
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"Ligação: {exc}", file=sys.stderr)
            time.sleep(2)
        except KeyboardInterrupt:
            print("\nCentro Agent parado.")
            return
        except Exception as exc:
            print(f"Erro: {exc}", file=sys.stderr)
            time.sleep(5)


if __name__ == "__main__":
    main()
