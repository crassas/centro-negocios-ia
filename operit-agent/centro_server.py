#!/usr/bin/env python3
import json
import hashlib
import threading
import os
import secrets
import signal
import shutil
import subprocess
import time
import urllib.error
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
SUPERVISOR_PID_FILE = HOME / ".centro-station" / "supervisor.pid"
HISTORY_FILE = STATE_DIR / "history.jsonl"
BUSY_FILE = STATE_DIR / "busy.json"
EXECUTION_LOCK = threading.Lock()
EXECUTION_STATE = threading.local()
RESULT_DIR = STATE_DIR / "completed"
STARTED_AT = time.time()
CMD_TIMEOUT = 120
CLAUDE_TIMEOUT = 300
OPENCLAW_TIMEOUT = 300
OPENCLAW_PORT = 18789
OPENCLAW_HEALTH = f"http://127.0.0.1:{OPENCLAW_PORT}/healthz"
LAYA_BASE = "http://127.0.0.1:18790"
MANUS_BASE = "https://api.manus.ai"
MANUS_KEY_FILE = HOME / ".centro-agent" / "manus_api_key"
OLLAMA_KEY_FILE = HOME / ".centro-agent" / "ollama_api_key"
WORKTREE_ROOT = STATE_DIR / "worktrees"
CLOUD_BASE = "https://centro-negocios-ai.travisthejarvis.workers.dev"
AGENT_TOKEN_FILE = HOME / ".centro-agent" / "token"

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


def mark_busy(task):
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "pid": os.getpid(),
            "startedAt": int(time.time()),
            "action": str(task.get("action") or ""),
            "target": str(task.get("target") or ""),
            "id": str(task.get("id") or ""),
        }
        tmp = BUSY_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(BUSY_FILE)
    except Exception:
        pass


def clear_busy():
    try:
        BUSY_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def pid_running(path):
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
        os.kill(pid, 0)
        return True, pid
    except Exception:
        return False, None


def append_history(task, result):
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        row = {
            "timestamp": int(time.time()),
            "action": str(task.get("action") or ""),
            "target": str(task.get("target") or ""),
            "label": str(task.get("label") or ""),
            "exitCode": int(result.get("exitCode", 1)),
            "durationMs": int(result.get("durationMs", 0)),
            "error": (
                str(result.get("stderr") or "")[-1500:]
                if int(result.get("exitCode", 1)) != 0
                else ""
            ),
        }
        with HISTORY_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception:
        pass


def read_history(limit=20):
    try:
        rows = HISTORY_FILE.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return []
    out = []
    for line in rows[-max(1, min(int(limit), 100)):]:
        try:
            out.append(json.loads(line))
        except Exception:
            pass
    return out


def capabilities():
    return {
        "mode": "local-first",
        "paidApiFallback": False,
        "actions": [
            "server_status",
            "station_status",
            "station_doctor",
            "agents_status",
            "autonomy_selftest",
            "system_info",
            "site_check",
            "git_status",
            "git_pull",
            "git_access_matrix",
            "fault_timeout",
            "fault_openclaw_recovery",
            "repo_change",
            "claude_query",
            "openclaw_status",
            "openclaw_models",
            "openclaw_query",
            "laya_status",
            "laya_decide",
            "manus_status",
            "manus_query",
        ],
        "repos": list(REPOS.keys()),
        "sites": [name for name, _ in SITES],
    }


def run_cmd(args, cwd=None, timeout=CMD_TIMEOUT, env=None):
    started = time.time()
    # Nunca deixa operações Git automáticas presas à espera de username/password.
    # Credenciais já configuradas (credential helper, gh, token/SSH) continuam a
    # funcionar; se faltarem, Git falha imediatamente e o self-test mostra a causa.
    cmd_env = os.environ.copy() if env is None else env.copy()
    if args:
        command_name = Path(str(args[0])).name.lower()
        if command_name in {"git", "git.exe"}:
            cmd_env.setdefault("GIT_TERMINAL_PROMPT", "0")
            cmd_env.setdefault("GCM_INTERACTIVE", "Never")
    deadline = getattr(EXECUTION_STATE, "deadline", None)
    if deadline is not None:
        timeout = min(timeout, max(0.1, deadline - time.monotonic()))
    proc = None
    try:
        proc = subprocess.Popen(
            args, cwd=str(cwd) if cwd else None, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=cmd_env, start_new_session=True,
        )
        out, err = proc.communicate(timeout=timeout)
        return {"exitCode": proc.returncode, "stdout": out[-12000:],
                "stderr": err[-6000:], "durationMs": int((time.time()-started)*1000)}
    except FileNotFoundError:
        return {"exitCode": 127, "stdout": "", "stderr": f"Comando não encontrado: {args[0]}",
                "durationMs": int((time.time()-started)*1000)}
    except subprocess.TimeoutExpired:
        # Termina também os filhos criados pelo executor; nunca processos externos.
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            out, err = proc.communicate(timeout=2)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            out, err = proc.communicate(timeout=3)
        return {"exitCode": 124, "stdout": out[-12000:],
                "stderr": "Tempo limite excedido. Grupo do executor terminado.\n"+err[-5000:],
                "durationMs": int((time.time()-started)*1000)}


def transient_command_failure(result):
    code = int(result.get("exitCode", 1))
    text = ((result.get("stderr") or "") + "\n" + (result.get("stdout") or "")).lower()
    markers = (
        "temporary failure",
        "could not resolve host",
        "name or service not known",
        "connection reset",
        "connection refused",
        "network is unreachable",
        "timed out",
        "timeout",
        "remote end hung up",
        "early eof",
        "unexpected eof",
        "tls",
        "ssl",
        "http 500",
        "http 502",
        "http 503",
        "http 504",
    )
    return code == 124 or (code in {1, 128} and any(marker in text for marker in markers))


def run_cmd_retry(args, cwd=None, timeout=CMD_TIMEOUT, env=None, attempts=3, delay=2):
    last = None
    attempts = min(3, max(1, int(attempts)))
    for attempt in range(1, attempts + 1):
        if time.monotonic() >= getattr(EXECUTION_STATE, "deadline", float("inf")):
            break
        last = run_cmd(args, cwd=cwd, timeout=timeout, env=env)
        if last["exitCode"] == 0 or not transient_command_failure(last):
            return last
        if attempt < attempts:
            time.sleep(delay * attempt)
    return last or {
        "exitCode": 1,
        "stdout": "",
        "stderr": "Comando não executado.",
        "durationMs": 0,
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


def ensure_repo(name):
    if name not in REPOS:
        return None, {
            "exitCode": 2,
            "stdout": "",
            "stderr": "Projecto não permitido.",
            "durationMs": 0,
        }

    existing = locate_repo(name)
    if existing:
        return existing, None

    root = HOME / "repos"
    root.mkdir(parents=True, exist_ok=True)
    dest = root / name

    if dest.exists() and not (dest / ".git").is_dir():
        return None, {
            "exitCode": 3,
            "stdout": "",
            "stderr": f"Existe {dest}, mas não é um repositório Git.",
            "durationMs": 0,
        }

    clone = run_cmd_retry(
        ["git", "clone", "--depth", "1", REPOS[name], str(dest)],
        cwd=root,
        timeout=240,
        attempts=3,
        delay=3,
    )
    if clone["exitCode"] != 0:
        return None, {
            "exitCode": clone["exitCode"],
            "stdout": clone["stdout"],
            "stderr": (
                f"Repositório {name} não existia localmente e o clone automático falhou.\n"
                + clone["stderr"]
            ),
            "durationMs": clone["durationMs"],
        }

    return dest, None



def locate_openclaw():
    found = shutil.which("openclaw")
    if found:
        return found
    candidates = [
        HOME / ".local" / "bin" / "openclaw",
        Path("/usr/local/bin/openclaw"),
        Path("/usr/bin/openclaw"),
    ]
    return next((str(p) for p in candidates if p.exists()), None)


def openclaw_http_health():
    started = time.time()
    try:
        req = urllib.request.Request(
            OPENCLAW_HEALTH,
            headers={"User-Agent": "Centro-Server/1.0"},
        )
        with urllib.request.urlopen(req, timeout=4) as res:
            body = res.read(4096).decode("utf-8", errors="replace").strip()
            return True, res.status, body, int((time.time() - started) * 1000)
    except Exception as exc:
        return False, 0, str(exc), int((time.time() - started) * 1000)


def laya_http_health():
    started = time.time()
    try:
        req = urllib.request.Request(
            LAYA_BASE + "/health",
            headers={"User-Agent": "Centro-Server/1.0"},
        )
        with urllib.request.urlopen(req, timeout=4) as res:
            body = res.read(4096).decode("utf-8", errors="replace").strip()
            return res.status == 200, res.status, body, int((time.time() - started) * 1000)
    except Exception as exc:
        return False, 0, str(exc), int((time.time() - started) * 1000)


def extract_openclaw_reply(raw):
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        data = json.loads(text)
    except Exception:
        return text

    preferred = []

    def walk(value):
        if isinstance(value, dict):
            for key in ("text", "reply", "response", "message", "content", "output"):
                item = value.get(key)
                if isinstance(item, str) and item.strip():
                    preferred.append(item.strip())
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(data)
    if preferred:
        return max(preferred, key=len)
    return json.dumps(data, ensure_ascii=False, indent=2)




def http_json(url, method="GET", payload=None, headers=None, timeout=30):
    data = None
    req_headers = {"User-Agent": "Centro-Server/1.0"}
    if headers:
        req_headers.update(headers)
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    timeout = min(timeout, max(0.1, getattr(EXECUTION_STATE, "deadline", float("inf")) - time.monotonic()))
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read().decode("utf-8", errors="replace")
        return res.status, json.loads(raw) if raw else {}


def parse_json_object_text(raw):
    text = str(raw or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].lstrip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        value = json.loads(text)
        if isinstance(value, dict):
            return value
    except Exception:
        pass

    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            value, _ = decoder.raw_decode(text[index:])
            if isinstance(value, dict):
                return value
        except Exception:
            continue
    raise RuntimeError("Resposta não contém um objecto JSON válido.")


def request_openclaw_repo_change_plan(target, prompt, worktree, repair_note=""):
    binary = locate_openclaw()
    if not binary:
        raise RuntimeError("OpenClaw CLI não encontrado.")
    healthy, _, _, _ = openclaw_http_health()
    if not healthy:
        raise RuntimeError("Gateway OpenClaw offline.")

    context = build_local_repo_context(worktree, target, prompt)
    instruction = (
        "És o planeador de código de fallback do Centro de Negócios. "
        "NÃO alteres ficheiros e NÃO executes comandos: responde APENAS com JSON. "
        "Schema exacto: "
        '{"summary":"frase curta","edits":[{"path":"ficheiro relativo",'
        '"operation":"replace|write|append|delete","search":"texto exacto para replace",'
        '"content":"novo conteúdo"}]}. '
        "Para replace, search TEM de ser copiado literalmente do conteúdo real fornecido, "
        "ocorrer exactamente uma vez e ser curto. Usa apenas paths do repositório/contexto. "
        "Nunca toques em .env, .git, .github/workflows, secrets, credenciais, chaves ou tokens. "
        "Prefere alterações mínimas e coerentes.\n\n"
        "PEDIDO:\n" + prompt[:5000] + "\n\n"
    )
    if repair_note:
        instruction += (
            "PLANO ANTERIOR REJEITADO:\n" + repair_note[-1600:]
            + "\nCorrige especificamente este erro.\n\n"
        )
    instruction += (
        "REPOSITÓRIO REAL:\n"
        + json.dumps(context, ensure_ascii=False)[:28000]
    )

    params = {
        "message": instruction,
        "agentId": "main",
        "sessionKey": "agent:main:centro-planner",
        "thinking": "low",
        "deliver": False,
        "timeout": 180,
        "idempotencyKey": secrets.token_hex(16),
        "label": "Centro Planner Fallback",
        # Raw model run do OpenClaw: sem tools, sem workspace e sem políticas
        # de prompt da conversa. O único efeito permitido é produzir texto JSON.
        "modelRun": True,
        "promptMode": "none",
        "bootstrapContextMode": "lightweight",
        "suppressPromptPersistence": True,
        "sessionEffects": "internal",
    }
    result = run_cmd(
        [
            binary,
            "gateway",
            "call",
            "agent",
            "--params",
            json.dumps(params, ensure_ascii=False),
            "--expect-final",
            "--json",
            "--timeout",
            "190000",
        ],
        cwd=worktree,
        timeout=OPENCLAW_TIMEOUT,
    )
    if result["exitCode"] != 0:
        detail = (result["stderr"] or result["stdout"] or "falha sem detalhe")[-2200:]
        raise RuntimeError("OpenClaw planner falhou: " + detail)

    reply = extract_openclaw_reply(result["stdout"])
    plan = parse_json_object_text(reply)
    if not isinstance(plan.get("edits"), list):
        raise RuntimeError("OpenClaw devolveu plano sem edits.")
    return plan


def laya_request(state):
    questions = {
        "route": {
            "type": "choice",
            "instructions": "Escolhe o especialista principal para tratar este pedido.",
            "criteria": {
                "fast_chat": "conversa simples, resposta curta ou esclarecimento imediato",
                "code": "programação, arquitectura, repositórios, debugging ou implementação técnica",
                "audit": "verificação, riscos, segurança, bugs ou controlo de qualidade",
                "seo": "SEO, GEO, AEO, pesquisa local, indexação ou conteúdo para motores de busca",
                "ux": "interface, experiência do utilizador, conversão ou mobile",
                "research": "pesquisa externa, comparação ou validação de informação",
                "openclaw": "execução local, ficheiros, terminal, ferramentas ou automação no dispositivo",
                "manus": "missão autónoma multi-etapa com pesquisa, browser, artefactos ou trabalho prolongado"
            }
        }
    }
    payload = {
        "state": str(state),
        "questions": questions,
        "model": "multilingual"
    }
    return http_json(LAYA_BASE + "/v1/systemone", method="POST", payload=payload, timeout=120)



def format_laya_result(data):
    answers = data.get("answers") or {}
    route = answers.get("route") or {}
    routing = data.get("routing") or {}
    usage = data.get("usage") or {}
    return "\n".join([
        "LAYA · SYSTEM 1",
        f"Rota: {route.get('choice', '-')}",
        f"Confiança: {float(route.get('answer_confidence') or 0):.3f}",
        f"Checkpoint: {routing.get('model', 'multilingual')}",
        f"Tokens entrada: {usage.get('input_tokens', '-')}",
    ])



def read_secret(path):
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def manus_request(path, method="GET", payload=None, timeout=45):
    key = read_secret(MANUS_KEY_FILE)
    if not key:
        raise RuntimeError("MANUS_KEY_MISSING")
    headers = {"x-manus-api-key": key}
    return http_json(MANUS_BASE + path, method=method, payload=payload, headers=headers, timeout=timeout)


def manus_extract_latest(messages, since_ms):
    rows = messages if isinstance(messages, list) else []
    waiting = None
    for row in rows:
        if not isinstance(row, dict):
            continue
        ts = int(row.get("timestamp") or 0)
        if ts + 3000 < since_ms:
            continue
        typ = str(row.get("type") or "")
        if typ == "assistant_message":
            msg = row.get("assistant_message") or {}
            content = str(msg.get("content") or "").strip()
            if content:
                return "done", content
        if typ == "error_message":
            msg = row.get("error_message") or {}
            return "error", str(msg.get("content") or msg.get("error_type") or "Erro Manus")
        if typ == "status_update":
            status = row.get("status_update") or {}
            if status.get("agent_status") == "waiting":
                detail = status.get("status_detail") or {}
                waiting = str(
                    detail.get("waiting_description")
                    or status.get("description")
                    or status.get("brief")
                    or "Manus aguarda confirmação."
                )
    return ("waiting", waiting) if waiting else ("pending", "")



def find_claude():
    found = shutil.which("claude")
    if found:
        return found
    candidates = [
        HOME / ".local" / "bin" / "claude",
        Path("/usr/local/bin/claude"),
        Path("/usr/bin/claude"),
    ]
    return next((str(p) for p in candidates if p.exists()), None)


def canonical_github_repo(remote):
    value = str(remote or "").strip()
    if not value:
        return ""

    host = ""
    path = ""
    if value.startswith("git@github.com:"):
        host = "github.com"
        path = value.split(":", 1)[1]
    elif "://" in value:
        try:
            parsed = urlparse(value)
            host = (parsed.hostname or "").lower()
            path = parsed.path
        except Exception:
            return ""
    elif value.startswith("github.com/"):
        host = "github.com"
        path = value[len("github.com/"):]
    else:
        return ""

    if host != "github.com":
        return ""
    clean = path.strip("/")
    if clean.lower().endswith(".git"):
        clean = clean[:-4]
    parts = [part for part in clean.split("/") if part]
    if len(parts) != 2:
        return ""
    return (parts[0] + "/" + parts[1]).lower()


def repo_origin_ok(path, target):
    origin = run_cmd(["git", "remote", "get-url", "origin"], cwd=path)
    expected = canonical_github_repo(REPOS[target])
    actual = canonical_github_repo(origin["stdout"])
    return origin["exitCode"] == 0 and bool(expected) and actual == expected


def changed_paths(worktree):
    result = run_cmd(["git", "status", "--porcelain=v1"], cwd=worktree)
    if result["exitCode"] != 0:
        return [], result
    rows = []
    for raw in result["stdout"].splitlines():
        if len(raw) < 4:
            continue
        name = raw[3:].strip()
        if " -> " in name:
            name = name.split(" -> ", 1)[1].strip()
        rows.append(name)
    return rows, result


def validate_repo_change(worktree, paths):
    checks = []
    failures = []

    for rel in paths:
        p = worktree / rel
        if not p.exists() or p.is_dir():
            continue
        suffix = p.suffix.lower()
        if suffix in {".js", ".mjs", ".cjs"} and shutil.which("node"):
            row = run_cmd(["node", "--check", str(p)], cwd=worktree, timeout=60)
            checks.append(f"node --check {rel}: {row['exitCode']}")
            if row["exitCode"] != 0:
                failures.append(row["stderr"] or row["stdout"])
        elif suffix == ".py":
            row = run_cmd(["python3", "-m", "py_compile", str(p)], cwd=worktree, timeout=60)
            checks.append(f"py_compile {rel}: {row['exitCode']}")
            if row["exitCode"] != 0:
                failures.append(row["stderr"] or row["stdout"])
        elif suffix == ".json":
            try:
                json.loads(p.read_text(encoding="utf-8"))
                checks.append(f"json {rel}: 0")
            except Exception as exc:
                checks.append(f"json {rel}: 1")
                failures.append(f"{rel}: {exc}")

    package = worktree / "package.json"
    node_modules = worktree / "node_modules"
    if package.exists() and shutil.which("npm") and node_modules.exists():
        build = run_cmd(["npm", "run", "build", "--if-present"], cwd=worktree, timeout=300)
        checks.append(f"npm run build --if-present: {build['exitCode']}")
        if build["exitCode"] != 0:
            failures.append(build["stderr"] or build["stdout"])

    return checks, failures


def local_repo_terms(prompt):
    words = []
    seen = set()
    for raw in str(prompt or "").lower().replace("-", " ").replace("_", " ").split():
        word = "".join(ch for ch in raw if ch.isalnum())
        if len(word) < 4 or word in seen:
            continue
        seen.add(word)
        words.append(word)
    for word in ["hero", "mobile", "responsive", "title", "texto", "layout", "style", "css", "cta"]:
        if word not in seen:
            seen.add(word)
            words.append(word)
    return words[:24]


def local_file_excerpt(text, prompt, max_chars=9000):
    raw = str(text or "")
    if len(raw) <= max_chars:
        return raw
    low = raw.lower()
    chunks = []
    spans = []
    for term in local_repo_terms(prompt):
        start_at = 0
        for _ in range(2):
            idx = low.find(term.lower(), start_at)
            if idx < 0:
                break
            start_at = idx + len(term)
            start = max(0, idx - 1200)
            end = min(len(raw), idx + 1800)
            if any(max(a, start) < min(b, end) for a, b in spans):
                continue
            spans.append((start, end))
            chunks.append(raw[start:end])
            if sum(len(x) for x in chunks) >= max_chars:
                break
        if sum(len(x) for x in chunks) >= max_chars:
            break
    if not chunks:
        chunks = [raw[:4500], raw[-3500:]]
    return "\n\n/* ... EXCERTO LOCAL ... */\n\n".join(chunks)[:max_chars]


def build_local_repo_context(worktree, target, prompt):
    listing = run_cmd(["git", "ls-files"], cwd=worktree, timeout=30)
    if listing["exitCode"] != 0:
        raise RuntimeError("Não foi possível listar ficheiros locais: " + listing["stderr"])
    paths = [row.strip() for row in listing["stdout"].splitlines() if row.strip()]

    preferred_map = {
        "engomadoria-beatriz": [
            "CONTENT_TRUTH.md", "README.md", "package.json",
            "src/data.mjs", "src/beatriz.js", "src/beatriz.css",
        ],
        "pente_houselanding": [
            "README.md", "package.json", "index.html", "styles.css",
            "src/App.jsx", "src/App.tsx", "src/main.js", "src/main.ts",
        ],
        "best-pizza-kebab": [
            "README.md", "package.json", "index.html", "styles.css",
            "src/App.jsx", "src/App.tsx", "src/main.js", "src/main.ts",
        ],
        "restaurante-2-irmaos": [
            "README.md", "package.json", "index.html", "styles.css",
            "src/App.jsx", "src/App.tsx", "src/main.js", "src/main.ts",
        ],
        "centro-negocios-ia": [
            "README.md", "app.js", "index.html", "styles.css",
            "cloudflare-ai-worker/src/index.js",
            "operit-agent/centro_server.py",
            "operit-agent/centro_agent.py",
        ],
    }
    terms = local_repo_terms(prompt)
    preferred = preferred_map.get(target, ["README.md", "package.json", "index.html", "styles.css", "app.js"])

    scored = []
    for rel in paths:
        low = rel.lower()
        if not low.endswith((".html", ".htm", ".css", ".scss", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".json", ".md", ".py", ".toml", ".yaml", ".yml")):
            continue
        score = 100 if rel in preferred else 0
        for term in terms:
            if term in low:
                score += 15
        if any(token in low for token in ("src/", "app", "main", "index", "style", "data", "content", "readme")):
            score += 3
        scored.append((score, rel))
    scored.sort(key=lambda item: (-item[0], item[1]))

    selected = []
    for rel in preferred:
        if rel in paths and rel not in selected:
            selected.append(rel)
    for _, rel in scored:
        if rel not in selected:
            selected.append(rel)
        if len(selected) >= 7:
            break

    files = {}
    total = 0
    for rel in selected[:7]:
        path = worktree / rel
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        excerpt = local_file_excerpt(text, prompt, 8500)
        if total + len(excerpt) > 42000:
            excerpt = excerpt[:max(0, 42000 - total)]
        if not excerpt:
            break
        files[rel] = excerpt
        total += len(excerpt)
        if total >= 42000:
            break

    head = run_cmd(["git", "rev-parse", "HEAD"], cwd=worktree, timeout=20)["stdout"].strip()
    return {
        "repo": target,
        "branch": "main",
        "head": head,
        "paths": paths[:220],
        "files": files,
        "source": "centro-server-local",
    }


def request_repo_change_plan_with_context(target, prompt, context):
    token = read_secret(AGENT_TOKEN_FILE)
    if not token:
        raise RuntimeError("Centro Agent sem token para pedir plano de alteração.")
    payload = {"target": target, "prompt": prompt, "context": context}
    last_error = ""

    for attempt in range(3):
        if time.monotonic() >= getattr(EXECUTION_STATE, "deadline", float("inf")):
            break
        try:
            status, data = http_json(
                CLOUD_BASE + "/api/repo/change-plan",
                method="POST",
                payload=payload,
                headers={"Authorization": "Bearer " + token},
                timeout=150,
            )
            if status == 200 and isinstance(data, dict) and data.get("ok"):
                plan = data.get("plan")
                if not isinstance(plan, dict) or not isinstance(plan.get("edits"), list):
                    raise RuntimeError("Plano de alteração inválido.")
                return plan, str(data.get("plannerModel") or "")
            last_error = str((data or {}).get("error") or f"Planeador HTTP {status}")
        except urllib.error.HTTPError as exc:
            try:
                body = exc.read().decode("utf-8", errors="replace")
                parsed = json.loads(body) if body else {}
                last_error = str(parsed.get("error") or f"Planeador HTTP {exc.code}")
            except Exception:
                last_error = f"Planeador HTTP {exc.code}"
            if exc.code < 500:
                break
        except Exception as exc:
            last_error = str(exc)

        if attempt < 2:
            time.sleep(2 * (attempt + 1))

    raise RuntimeError(last_error or "Planeador automático indisponível.")


def request_repo_change_plan(target, prompt, worktree):
    context = build_local_repo_context(worktree, target, prompt)
    plan, _ = request_repo_change_plan_with_context(target, prompt, context)
    return plan


def protected_repo_path(rel):
    raw = str(rel or "").strip().replace("\\", "/")
    # Remove apenas prefixos relativos "./". str.lstrip("./") é proibido aqui:
    # transformaria ".env" em "env" e ".git" em "git", anulando a protecção.
    normalized = raw
    while normalized.startswith("./"):
        normalized = normalized[2:]
    low = normalized.lower()
    return (
        not low
        or raw.startswith("/")
        or low.startswith("/")
        or ".." in Path(low).parts
        or any(part == ".git" or part == ".env" or part.startswith(".env.") for part in Path(low).parts)
        or low == ".env"
        or low.startswith(".env.")
        or low == ".git"
        or low.startswith(".git/")
        or low == ".github/workflows"
        or low.startswith(".github/workflows/")
        or "secret" in low
        or "credential" in low
        or low.endswith(".pem")
        or low.endswith(".key")
    )


def apply_repo_change_plan(worktree, plan):
    """
    Valida o plano inteiro em memória antes de tocar no worktree.
    Um search errado deixa assim o worktree intacto e permite outro executor.
    """
    edits = plan.get("edits") if isinstance(plan, dict) else []
    if not isinstance(edits, list):
        raise RuntimeError("Plano sem lista de edições.")
    if len(edits) > 12:
        raise RuntimeError("Plano excede o limite de 12 edições.")

    root = worktree.resolve()
    buffers = {}
    created = set()
    applied = []

    for edit in edits:
        if not isinstance(edit, dict):
            raise RuntimeError("Edição inválida no plano.")

        rel = str(edit.get("path") or "").strip().replace("\\", "/")
        op = str(edit.get("operation") or "").strip().lower()
        search = str(edit.get("search") or "")
        content = str(edit.get("content") or "")

        if protected_repo_path(rel):
            raise RuntimeError("Plano tentou tocar em caminho protegido: " + rel)
        if op not in {"replace", "append", "create"}:
            raise RuntimeError("Operação não permitida: " + op)

        path = (worktree / rel).resolve()
        if root != path and root not in path.parents:
            raise RuntimeError("Path fora do worktree: " + rel)

        if op == "create":
            if path.exists() or path in buffers:
                raise RuntimeError("Plano tentou criar ficheiro já existente: " + rel)
            buffers[path] = content
            created.add(path)
            applied.append("create " + rel)
            continue

        if path not in buffers:
            if not path.exists() or not path.is_file():
                raise RuntimeError("Ficheiro do plano não existe: " + rel)
            buffers[path] = path.read_text(encoding="utf-8")

        original = buffers[path]

        if op == "append":
            if not content.strip():
                raise RuntimeError("Append vazio em " + rel)
            suffix = "" if original.endswith("\n") else "\n"
            buffers[path] = original + suffix + content.rstrip() + "\n"
            applied.append("append " + rel)
            continue

        if not search:
            raise RuntimeError("Replace sem texto de pesquisa em " + rel)
        count = original.count(search)
        if count != 1:
            raise RuntimeError(
                f"Replace inseguro em {rel}: bloco esperado ocorre {count} vez(es), deveria ocorrer exactamente 1."
            )
        buffers[path] = original.replace(search, content, 1)
        applied.append("replace " + rel)

    # Só chegamos aqui se todas as operações tiverem sido validadas.
    for path, text in buffers.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".centro-" + secrets.token_hex(4) + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)

    return applied

def readonly_cloud_fallback(prompt, reason):
    """Already-installed Workers AI route; no Anthropic/Manus paid fallback."""
    try:
        status, data = http_json(CLOUD_BASE+"/api/assist", method="POST",
                                payload={"question": prompt, "context": {}}, timeout=60)
        answer = str(data.get("answer") or "").strip()
        model = str(data.get("model") or "")
        if status != 200 or not data.get("ok") or not answer or model == "fallback-local":
            raise RuntimeError("Workers AI sem resposta de modelo")
        return {"exitCode": 0, "stdout": "FALLBACK WORKERS AI · "+model+"\n"+answer,
                "stderr": "", "durationMs": 0}
    except Exception as exc:
        return {"exitCode": 78, "stdout": "", "stderr": reason+"; fallback: "+str(exc)[:500], "durationMs": 0}


OLLAMA_AUTH_CACHE = {"at": 0, "ok": False, "detail": "", "keyHash": ""}
def ollama_auth_check(key):
    digest = hashlib.sha256(key.encode()).hexdigest()
    if OLLAMA_AUTH_CACHE["keyHash"] == digest and time.monotonic()-OLLAMA_AUTH_CACHE["at"] < 60:
        return OLLAMA_AUTH_CACHE["ok"], OLLAMA_AUTH_CACHE["detail"]
    try:
        status, data = http_json("https://ollama.com/api/chat", method="POST",
                                payload={"model": "gpt-oss:120b", "messages": [{"role": "user", "content": "OK"}], "stream": False, "options": {"num_predict": 1}},
                                headers={"Authorization": "Bearer "+key}, timeout=30)
        ok, detail = status == 200, "Ollama HTTP "+str(status)
    except urllib.error.HTTPError as exc:
        ok, detail = False, "Ollama HTTP "+str(exc.code)+"; credencial recusada"
    except Exception as exc:
        ok, detail = False, "Ollama indisponível: "+str(exc)[:300]
    OLLAMA_AUTH_CACHE.update(at=time.monotonic(), ok=ok, detail=detail, keyHash=digest)
    return ok, detail


def run_claude_repo_executor(worktree, prompt):
    """Fallback gratuito/local-first: Claude Code ligado ao Ollama, nunca Anthropic pago."""
    claude = find_claude()
    if not claude:
        raise RuntimeError("Claude Code não foi encontrado para fallback local.")

    key = read_secret(OLLAMA_KEY_FILE)
    if not key:
        raise RuntimeError("Fallback Claude/Ollama sem chave validada em ~/.centro-agent/ollama_api_key.")

    auth_ok, auth_detail = ollama_auth_check(key)
    if not auth_ok:
        raise RuntimeError(auth_detail)
    env = os.environ.copy()
    env["ANTHROPIC_BASE_URL"] = "https://ollama.com"
    env["ANTHROPIC_AUTH_TOKEN"] = key
    env["OLLAMA_API_KEY"] = key
    env.pop("ANTHROPIC_API_KEY", None)

    model = os.environ.get("CENTRO_CLAUDE_MODEL", "").strip() or "gpt-oss:120b"
    system_note = (
        "Estás a executar uma alteração pedida pelo dono através do Centro de Negócios. "
        "Trabalha APENAS dentro do repositório/worktree actual. Inspecciona os ficheiros relevantes "
        "e faz a alteração completa com o menor escopo possível. Podes editar ficheiros e executar "
        "verificações locais seguras. Não alteres .env, tokens, chaves, secrets, credenciais, .git "
        "ou .github/workflows. Não uses git reset --hard, force push, rm -rf, deploy externo nem "
        "alterações de contas. Não faças commit nem push; o Centro valida e publica depois."
    )
    result = run_cmd(
        [
            claude,
            "--model", model,
            # Auto mode depende de modelos suportados pelo classificador do
            # Claude Code. O fallback usa Ollama/gpt-oss, por isso usamos
            # acceptEdits e recusamos prompts sem host: edição não bloqueia e
            # comandos que pediriam autorização são negados em vez de ficar
            # pendurados numa execução unattended.
            "--permission-mode", "acceptEdits",
            "--permission-prompts", "none",
            "--append-system-prompt", system_note,
            "-p", prompt,
        ],
        cwd=worktree,
        timeout=max(CLAUDE_TIMEOUT, 600),
        env=env,
    )
    if result["exitCode"] != 0:
        detail = (result["stderr"] or result["stdout"] or "falha sem detalhe")[-3500:]
        raise RuntimeError("Fallback Claude/Ollama falhou: " + detail)

    return (
        "CLAUDE/OLLAMA · FALLBACK LOCAL APLICADO\n"
        + (result["stdout"] or "Executor concluiu sem mensagem.")[-4500:]
    )


def action_repo_change(task):
    prompt = str((task.get("args") or {}).get("prompt") or "").strip()
    target = str(task.get("target") or "")
    started = time.time()

    if target not in REPOS:
        return {"exitCode": 2, "stdout": "", "stderr": "Projecto não permitido.", "durationMs": 0}
    if not prompt:
        return {"exitCode": 2, "stdout": "", "stderr": "Alteração em falta.", "durationMs": 0}
    if len(prompt) > 5000:
        return {"exitCode": 2, "stdout": "", "stderr": "Pedido demasiado longo.", "durationMs": 0}

    source, repo_error = ensure_repo(target)
    if repo_error:
        return repo_error
    if not repo_origin_ok(source, target):
        return {
            "exitCode": 4,
            "stdout": "",
            "stderr": "Remote Git não corresponde ao repositório autorizado.",
            "durationMs": 0,
        }

    # Trabalha sempre num worktree isolado. Nunca toca em alterações não
    # committed que possam existir no checkout principal do utilizador.
    WORKTREE_ROOT.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    task_id = "".join(ch for ch in str(task.get("id") or "") if ch.isalnum())[-8:] or "task"
    branch = f"centro/telegram-{stamp}-{task_id}"
    worktree = WORKTREE_ROOT / f"{target}-{stamp}-{task_id}"

    fetch = run_cmd_retry(
        ["git", "fetch", "origin", "main"],
        cwd=source,
        timeout=180,
        attempts=3,
        delay=3,
    )
    if fetch["exitCode"] != 0:
        return {
            "exitCode": fetch["exitCode"],
            "stdout": fetch["stdout"],
            "stderr": "Falhou git fetch antes da alteração.\n" + fetch["stderr"],
            "durationMs": int((time.time() - started) * 1000),
        }

    add = run_cmd(
        ["git", "worktree", "add", "-b", branch, str(worktree), "origin/main"],
        cwd=source,
        timeout=120,
    )
    if add["exitCode"] != 0:
        return {
            "exitCode": add["exitCode"],
            "stdout": add["stdout"],
            "stderr": "Não foi possível criar worktree isolado.\n" + add["stderr"],
            "durationMs": int((time.time() - started) * 1000),
        }

    pushed = False
    remote_branch = ""
    try:
        plan = None
        planner_error = ""
        executor_output = ""
        repair_notes = []

        # O plano estruturado é a via principal. Se o modelo inventar um bloco
        # "search" que não existe exactamente no ficheiro, o validador rejeita-o
        # sem escrever nada e damos ao planeador até duas rondas de correcção.
        for plan_round in range(3):
            plan_prompt = prompt
            if repair_notes:
                plan_prompt += (
                    "\n\nCORRECÇÃO AUTOMÁTICA DO PLANO ANTERIOR:\n"
                    + repair_notes[-1][-1800:]
                    + "\nUsa apenas paths existentes. Em cada replace, copia search "
                    "LITERALMENTE do conteúdo real fornecido e garante que ocorre exactamente uma vez."
                )
            try:
                candidate = request_repo_change_plan(target, plan_prompt, worktree)
            except Exception as exc:
                planner_error = "Planeador indisponível: " + str(exc)
                repair_notes.append(planner_error)
                continue

            plan_summary = str(candidate.get("summary") or "").strip()
            edits = candidate.get("edits") if isinstance(candidate.get("edits"), list) else []
            if not edits:
                planner_error = "Planeador devolveu zero edições. " + plan_summary
                repair_notes.append(planner_error)
                continue

            try:
                applied = apply_repo_change_plan(worktree, candidate)
                plan = candidate
                executor_output = (
                    "WORKERS AI · PLANO APLICADO"
                    + f" · tentativa {plan_round + 1}/3\n"
                    + (plan_summary + "\n" if plan_summary else "")
                    + "\n".join(applied)
                )
                break
            except Exception as exc:
                planner_error = "Plano Workers AI rejeitado localmente: " + str(exc)
                repair_notes.append(planner_error)
                plan = None

        openclaw_error = ""
        if plan is None:
            # Segundo planeador independente. O OpenClaw só devolve JSON; quem
            # escreve continua a ser o executor atómico e protegido do Centro.
            for openclaw_round in range(2):
                try:
                    candidate = request_openclaw_repo_change_plan(
                        target,
                        prompt,
                        worktree,
                        repair_note=openclaw_error or planner_error,
                    )
                    edits = candidate.get("edits") if isinstance(candidate.get("edits"), list) else []
                    if not edits:
                        openclaw_error = "OpenClaw devolveu zero edições."
                        continue
                    applied = apply_repo_change_plan(worktree, candidate)
                    plan = candidate
                    executor_output = (
                        "OPENCLAW · PLANO FALLBACK APLICADO"
                        + f" · tentativa {openclaw_round + 1}/2\n"
                        + str(candidate.get("summary") or "").strip()
                        + ("\n" if candidate.get("summary") else "")
                        + "\n".join(applied)
                    )
                    break
                except Exception as exc:
                    openclaw_error = str(exc)

        if plan is None:
            try:
                executor_output = run_claude_repo_executor(worktree, prompt)
                reasons = "Workers AI: " + (planner_error or "sem plano válido")[-1200:]
                if openclaw_error:
                    reasons += "\nOpenClaw planner: " + openclaw_error[-1200:]
                executor_output += "\n\nFALLBACK ACTIVADO POR:\n" + reasons
            except Exception as fallback_exc:
                return {
                    "exitCode": 67,
                    "stdout": "",
                    "stderr": (
                        "Todos os executores automáticos falharam após reparação do plano. "
                        "Workers AI: " + (planner_error or "sem plano válido")[-1800:]
                        + "\nOpenClaw planner: " + (openclaw_error or "indisponível")[-1800:]
                        + "\nClaude/Ollama: " + str(fallback_exc)[-1800:]
                    ),
                    "durationMs": int((time.time() - started) * 1000),
                }

        paths, status = changed_paths(worktree)
        if status["exitCode"] != 0:
            return {
                "exitCode": status["exitCode"],
                "stdout": executor_output[-5000:],
                "stderr": status["stderr"],
                "durationMs": int((time.time() - started) * 1000),
            }
        if not paths:
            return {
                "exitCode": 0,
                "stdout": "Executor concluiu sem alterações no repositório.\n\n" + executor_output[-5000:],
                "stderr": "",
                "durationMs": int((time.time() - started) * 1000),
            }

        protected = [rel for rel in paths if protected_repo_path(rel)]
        if protected:
            return {
                "exitCode": 65,
                "stdout": executor_output[-4000:],
                "stderr": "Alteração bloqueada por tocar em caminhos protegidos: " + ", ".join(protected[:12]),
                "durationMs": int((time.time() - started) * 1000),
            }

        if len(paths) > 30:
            return {
                "exitCode": 65,
                "stdout": executor_output[-4000:],
                "stderr": f"Alteração bloqueada: {len(paths)} ficheiros modificados (limite automático: 30).",
                "durationMs": int((time.time() - started) * 1000),
            }

        checks, failures = validate_repo_change(worktree, paths)
        if failures:
            return {
                "exitCode": 66,
                "stdout": executor_output[-4000:] + "\n\nVERIFICAÇÕES:\n" + "\n".join(checks),
                "stderr": "Validação falhou; nada foi publicado.\n" + "\n".join(failures)[-5000:],
                "durationMs": int((time.time() - started) * 1000),
            }

        add_all = run_cmd(["git", "add", "-A"], cwd=worktree, timeout=60)
        if add_all["exitCode"] != 0:
            return {
                "exitCode": add_all["exitCode"],
                "stdout": executor_output[-4000:],
                "stderr": add_all["stderr"],
                "durationMs": int((time.time() - started) * 1000),
            }

        summary = prompt.replace("\n", " ").strip()
        if len(summary) > 72:
            summary = summary[:69].rstrip() + "..."
        commit = run_cmd(
            [
                "git",
                "-c", "user.name=Centro Agent",
                "-c", "user.email=centro-agent@local",
                "commit",
                "-m", "auto: " + summary,
            ],
            cwd=worktree,
            timeout=120,
        )
        if commit["exitCode"] != 0:
            return {
                "exitCode": commit["exitCode"],
                "stdout": executor_output[-4000:],
                "stderr": "Falhou commit automático.\n" + commit["stderr"],
                "durationMs": int((time.time() - started) * 1000),
            }

        sha = run_cmd(["git", "rev-parse", "HEAD"], cwd=worktree, timeout=30)["stdout"].strip()
        stat = run_cmd(["git", "show", "--stat", "--oneline", "--format=%h %s", "HEAD"], cwd=worktree, timeout=60)

        push_main = run_cmd_retry(
            ["git", "push", "origin", "HEAD:main"],
            cwd=worktree,
            timeout=180,
            attempts=3,
            delay=3,
        )
        if push_main["exitCode"] == 0:
            pushed = True
            remote_branch = "main"
        else:
            push_branch = run_cmd_retry(
                ["git", "push", "-u", "origin", branch],
                cwd=worktree,
                timeout=180,
                attempts=3,
                delay=3,
            )
            if push_branch["exitCode"] == 0:
                pushed = True
                remote_branch = branch
            else:
                return {
                    "exitCode": push_main["exitCode"] or push_branch["exitCode"],
                    "stdout": (
                        executor_output[-3000:]
                        + "\n\nCOMMIT LOCAL: " + sha
                        + "\n\n" + stat["stdout"][-3000:]
                    ),
                    "stderr": (
                        "Alteração validada e committed, mas o push falhou.\n"
                        + push_main["stderr"][-2500:]
                        + "\n"
                        + push_branch["stderr"][-2500:]
                    ),
                    "durationMs": int((time.time() - started) * 1000),
                }

        return {
            "exitCode": 0,
            "stdout": (
                "ALTERAÇÃO AUTOMÁTICA CONCLUÍDA\n"
                f"Projecto: {target}\n"
                f"Commit: {sha}\n"
                f"Publicado em: {remote_branch}\n"
                f"Ficheiros: {len(paths)}\n"
                + ("Verificações: " + "; ".join(checks) + "\n" if checks else "")
                + "\n"
                + stat["stdout"][-3500:]
                + "\n\nEXECUTOR:\n"
                + executor_output[-3500:]
            ),
            "stderr": "",
            "durationMs": int((time.time() - started) * 1000),
        }
    finally:
        # A cópia isolada deixa de consumir espaço. O commit já ficou remoto
        # quando pushed=True; se o push falhar, a branch local permanece no repo.
        run_cmd(["git", "worktree", "remove", "--force", str(worktree)], cwd=source, timeout=60)
        if pushed:
            run_cmd(["git", "branch", "-D", branch], cwd=source, timeout=30)


def action_git_access_matrix(task):
    """Prova leitura + escrita Git nos cinco repositórios sem tocar na main."""
    started = time.time()
    git_bin = shutil.which("git")
    if not git_bin:
        return {"exitCode": 127, "stdout": "", "stderr": "Git não encontrado.", "durationMs": 0}

    rows = []
    failures = []
    for name in REPOS:
        source, repo_error = ensure_repo(name)
        if repo_error:
            detail = str(repo_error.get("stderr") or repo_error.get("stdout") or "clone/acesso falhou")
            rows.append(f"FALHA · {name} · {detail[:500]}")
            failures.append(name)
            continue
        if not repo_origin_ok(source, name):
            rows.append(f"FALHA · {name} · origin não autorizado")
            failures.append(name)
            continue

        fetch = run_cmd_retry(
            [git_bin, "fetch", "origin", "main"],
            cwd=source, timeout=90, attempts=2, delay=2,
        )
        if fetch["exitCode"] != 0:
            detail = (fetch["stderr"] or fetch["stdout"] or f"exit {fetch['exitCode']}")[-500:]
            rows.append(f"FALHA · {name} · fetch · {detail}")
            failures.append(name)
            continue

        branch = "centro-access-probe-" + secrets.token_hex(5)
        ref = "refs/heads/" + branch
        push = run_cmd_retry(
            [git_bin, "push", "origin", "refs/remotes/origin/main:" + ref],
            cwd=source, timeout=120, attempts=2, delay=2,
        )
        if push["exitCode"] != 0:
            detail = (push["stderr"] or push["stdout"] or f"exit {push['exitCode']}")[-500:]
            rows.append(f"FALHA · {name} · push temporário · {detail}")
            failures.append(name)
            continue

        verify = run_cmd_retry(
            [git_bin, "ls-remote", "--heads", "origin", ref],
            cwd=source, timeout=45, attempts=2, delay=1,
        )
        verified = verify["exitCode"] == 0 and bool(verify["stdout"].strip())

        cleanup = run_cmd_retry(
            [git_bin, "push", "origin", "--delete", branch],
            cwd=source, timeout=120, attempts=2, delay=2,
        )
        cleaned = cleanup["exitCode"] == 0

        if verified and cleaned:
            rows.append(f"OK · {name} · leitura/escrita/remocao temporária")
        else:
            detail = []
            if not verified:
                detail.append("ref remoto não confirmado")
            if not cleaned:
                detail.append("cleanup remoto falhou")
            rows.append(f"FALHA · {name} · " + ", ".join(detail))
            failures.append(name)

    return {
        "exitCode": 0 if not failures else 1,
        "stdout": "GIT ACCESS MATRIX\n" + "\n".join(rows),
        "stderr": "" if not failures else "Sem acesso completo: " + ", ".join(failures),
        "durationMs": int((time.time() - started) * 1000),
    }


def action_fault_timeout(task):
    """Falha controlada: prova timeout, kill do grupo e retry da fila."""
    started = time.time()
    python = shutil.which("python3") or "python3"
    result = run_cmd([python, "-c", "import time; time.sleep(3)"], timeout=0.6)
    if result["exitCode"] == 124:
        return {
            "exitCode": 124,
            "stdout": "FAULT_INJECTION_OK · executor preso foi terminado dentro do limite.",
            "stderr": "BENCHMARK_TIMEOUT_INJECTED",
            "durationMs": int((time.time() - started) * 1000),
        }
    return {
        "exitCode": 1,
        "stdout": result.get("stdout", ""),
        "stderr": "A injecção de timeout não produziu exit 124. " + result.get("stderr", ""),
        "durationMs": int((time.time() - started) * 1000),
    }


def action_fault_openclaw_recovery(task):
    """Termina o OpenClaw gerido e prova que o supervisor o levanta sozinho."""
    started = time.time()
    ctl = next(
        (p for p in (Path("/usr/local/bin/openclawctl"), HOME / ".local/bin/openclawctl") if p.exists()),
        None,
    )
    if not ctl:
        return {"exitCode": 127, "stdout": "", "stderr": "openclawctl não encontrado.", "durationMs": 0}

    # Garante uma linha de base saudável antes de injectar a falha.
    if not openclaw_http_health()[0]:
        run_cmd([str(ctl), "start"], timeout=35)
        # Em Android/PRoot o OpenClaw pode precisar de mais de dois minutos
        # para inspeccionar/preparar a base SQLite antes de publicar o health.
        # Não declarar falha de base enquanto o gateway ainda está legitimamente
        # a arrancar.
        deadline = time.time() + 210
        while time.time() < deadline and not openclaw_http_health()[0]:
            time.sleep(2)
    if not openclaw_http_health()[0]:
        return {"exitCode": 1, "stdout": "", "stderr": "OpenClaw já estava offline antes do teste.", "durationMs": int((time.time()-started)*1000)}

    stopped = run_cmd([str(ctl), "stop"], timeout=35)
    if stopped["exitCode"] != 0:
        return {
            "exitCode": stopped["exitCode"],
            "stdout": stopped["stdout"],
            "stderr": "Não foi possível terminar o OpenClaw para o teste. " + stopped["stderr"],
            "durationMs": int((time.time()-started)*1000),
        }

    # O Centro Station verifica extras periodicamente e deve recuperar sem ajuda.
    deadline = time.time() + 300
    while time.time() < deadline:
        if openclaw_http_health()[0]:
            return {
                "exitCode": 0,
                "stdout": "FAULT_INJECTION_OK · OpenClaw terminou e o supervisor recuperou-o automaticamente.",
                "stderr": "",
                "durationMs": int((time.time() - started) * 1000),
            }
        time.sleep(2)

    # Nunca deixa o serviço deliberadamente em baixo se a prova falhar.
    run_cmd([str(ctl), "start"], timeout=35)
    return {
        "exitCode": 1,
        "stdout": "",
        "stderr": "Supervisor não recuperou o OpenClaw dentro de 300 s; arranque de segurança solicitado.",
        "durationMs": int((time.time() - started) * 1000),
    }



def execute_action(task):
    action = str(task.get("action") or "")
    target = str(task.get("target") or "")

    if action == "server_status":
        agent_active, agent_pid = pid_running(AGENT_PID_FILE)
        supervisor_active, supervisor_pid = pid_running(SUPERVISOR_PID_FILE)
        return {
            "exitCode": 0,
            "stdout": "\n".join([
                "Centro Server: ACTIVO",
                f"Endereço: http://{HOST}:{PORT}",
                "Privado: sim (127.0.0.1)",
                f"PID servidor: {os.getpid()}",
                f"Uptime: {int(time.time() - STARTED_AT)} s",
                f"Centro Agent: {'ACTIVO' if agent_active else 'PARADO'}",
                f"PID agente: {agent_pid if agent_pid else '-'}",
                f"Supervisor: {'ACTIVO' if supervisor_active else 'PARADO'}",
                f"PID supervisor: {supervisor_pid if supervisor_pid else '-'}",
            ]),
            "stderr": "",
            "durationMs": 0,
        }

    if action == "station_status":
        agent_active, agent_pid = pid_running(AGENT_PID_FILE)
        supervisor_active, supervisor_pid = pid_running(SUPERVISOR_PID_FILE)
        openclaw_ok, _, _, _ = openclaw_http_health()
        laya_ok, _, _, _ = laya_http_health()
        lines = [
            "ESTAÇÃO CENTRO",
            "Núcleo local-first",
            "Fallback pago automático: NÃO",
            "",
            f"Servidor: ACTIVO · PID {os.getpid()}",
            f"Agente: {'ACTIVO' if agent_active else 'PARADO'} · PID {agent_pid if agent_pid else '-'}",
            f"Supervisor: {'ACTIVO' if supervisor_active else 'PARADO'} · PID {supervisor_pid if supervisor_pid else '-'}",
            f"OpenClaw: {'ONLINE' if openclaw_ok else 'OFFLINE'}",
            f"Laya: {'ONLINE' if laya_ok else 'OFFLINE'}",
            f"Manus: {'CONFIGURADO' if MANUS_KEY_FILE.exists() else 'SEM CHAVE / OPCIONAL'}",
            f"Capacidades: {len(capabilities()['actions'])}",
            f"Projectos autorizados: {len(REPOS)}",
            f"Sites monitorizados: {len(SITES)}",
        ]
        return {"exitCode": 0, "stdout": "\n".join(lines), "stderr": "", "durationMs": 0}

    if action == "agents_status":
        started = time.time()
        agent_active, _ = pid_running(AGENT_PID_FILE)
        supervisor_active, _ = pid_running(SUPERVISOR_PID_FILE)
        claude = find_claude()
        ollama_key = bool(read_secret(OLLAMA_KEY_FILE))
        openclaw_ok, _, _, _ = openclaw_http_health()
        laya_ok, _, _, _ = laya_http_health()
        git_ok = bool(shutil.which("git"))
        python_ok = bool(shutil.which("python3"))
        worker_ok = False
        worker_build = ""
        worker_detail = "OFFLINE"
        try:
            status, data = http_json(CLOUD_BASE + "/health", timeout=8)
            worker_ok = status == 200 and data.get("ok") is True
            worker_build = str(data.get("buildSha") or "")
            worker_detail = (
                "ONLINE · fila " + ("OK" if data.get("operitQueue") else "FALHA")
                + " · Telegram " + ("OK" if data.get("telegramConfigured") else "OFF")
            )
        except Exception as exc:
            worker_detail = "OFFLINE · " + str(exc)[:180]

        station_state = {}
        autoupdate = {}
        remote_state = {}
        try:
            station_state = json.loads(
                (HOME / ".centro-station" / "status.json").read_text(encoding="utf-8")
            )
            autoupdate = station_state.get("autoupdate") or {}
            remote_state = station_state.get("remoteDesktop") or {}
        except Exception:
            pass

        core = [
            ("Cloudflare/Telegram", worker_ok),
            ("Centro Server", True),
            ("Centro Agent", agent_active),
            ("Supervisor", supervisor_active),
            ("Git", git_ok),
            ("Python", python_ok),
        ]
        executors = [
            ("Claude Code", bool(claude)),
            ("Ollama para Claude", ollama_key),
            ("OpenClaw", openclaw_ok),
            ("Laya", laya_ok),
        ]
        core_ready = sum(1 for _, ok in core if ok)
        executor_ready = sum(1 for _, ok in executors if ok)
        auto_enabled = bool(autoupdate.get("enabled"))

        lines = [
            "CENTRO · AGENTES / AUTONOMIA",
            "",
            "NÚCLEO",
        ]
        for name, ok in core:
            lines.append(f"{'OK' if ok else 'FALHA'} · {name}")
        lines += [
            "",
            "EXECUTORES / REDUNDÂNCIA",
        ]
        for name, ok in executors:
            lines.append(f"{'OK' if ok else 'OFF'} · {name}")
        lines += [
            f"{'OK' if MANUS_KEY_FILE.exists() else 'OFF'} · Manus (opcional)",
            "",
            "CONTROLO",
            "Worker: " + worker_detail,
            f"Auto-update: {'ON' if auto_enabled else 'SEM ESTADO / OFF'}",
            "Runtime main: " + (str(autoupdate.get("mainSha") or "")[:12] or "ainda sem SHA"),
            (
                "Remote Desktop: "
                + ("ONLINE" if remote_state.get("healthy") else "OFFLINE")
                + (" · emparelhado" if remote_state.get("configured") else " · não emparelhado")
            ),
            f"Execução ocupada: {'SIM' if BUSY_FILE.exists() else 'NÃO'}",
            "",
            f"Núcleo pronto: {core_ready}/{len(core)}",
            f"Executores prontos: {executor_ready}/{len(executors)}",
        ]

        # O comando é diagnóstico: componentes opcionais OFF não transformam
        # um núcleo funcional em erro.
        return {
            "exitCode": 0 if core_ready == len(core) else 1,
            "stdout": "\n".join(lines),
            "stderr": "" if core_ready == len(core) else "Há componentes essenciais por recuperar.",
            "durationMs": int((time.time() - started) * 1000),
        }

    if action == "autonomy_selftest":
        started = time.time()
        checks = []

        def add(name, ok, detail=""):
            checks.append((name, bool(ok), str(detail or "")[:300]))

        # Control plane
        try:
            status, data = http_json(CLOUD_BASE + "/health", timeout=8)
            add(
                "Worker + TASKS",
                status == 200 and data.get("ok") is True and data.get("operitQueue") is True,
                f"HTTP {status}",
            )
            worker_build = str(data.get("buildSha") or "")
            add("Worker build identificado", bool(worker_build), worker_build[:12] or "sem BUILD_SHA")
        except Exception as exc:
            add("Worker + TASKS", False, exc)
            add("Worker build identificado", False, exc)

        # Prova que o runtime local já sincronizou a main actual.
        local_main = ""
        try:
            station_state = json.loads(
                (HOME / ".centro-station" / "status.json").read_text(encoding="utf-8")
            )
            local_main = str((station_state.get("autoupdate") or {}).get("mainSha") or "")
        except Exception:
            pass
        remote_main = ""
        try:
            _, commit_data = http_json(
                "https://api.github.com/repos/crassas/centro-negocios-ia/commits/main",
                headers={"Accept": "application/vnd.github+json"},
                timeout=10,
            )
            remote_main = str(commit_data.get("sha") or "")
        except Exception as exc:
            remote_main = ""
        aligned = bool(local_main and remote_main and local_main == remote_main)
        add(
            "Runtime main alinhado",
            aligned,
            "local " + (local_main[:12] or "-") + " · main " + (remote_main[:12] or "-"),
        )

        agent_active, _ = pid_running(AGENT_PID_FILE)
        supervisor_active, _ = pid_running(SUPERVISOR_PID_FILE)
        add("Centro Agent", agent_active)
        add("Supervisor", supervisor_active)
        add("Token Server", TOKEN_FILE.exists())
        add("Token Operit", AGENT_TOKEN_FILE.exists())

        # Prova real do caminho que estava a devolver HTTP 500:
        # autenticação do Agent -> endpoint do planeador -> Workers AI -> JSON.
        planner_ok = False
        planner_detail = ""
        # Teste real do planeador + aplicação, sem tocar em nenhum repositório.
        # O ficheiro é sintético e o worktree temporário é sempre eliminado.
        planner_ok = False
        planner_detail = ""
        probe_dir = WORKTREE_ROOT / (".planner-selftest-" + secrets.token_hex(5))
        try:
            probe_dir.mkdir(parents=True, exist_ok=False)
            probe_file = probe_dir / "SELFTEST.md"
            original_probe = "# SELFTEST\\nALPHA\\n"
            probe_file.write_text(original_probe, encoding="utf-8")
            context = {
                "repo": "centro-negocios-ia",
                "branch": "main",
                "head": "selftest",
                "paths": ["SELFTEST.md"],
                "files": {"SELFTEST.md": original_probe},
                "source": "centro-selftest-dryrun",
            }
            repair = ""
            model_used = ""
            for round_no in range(3):
                probe_file.write_text(original_probe, encoding="utf-8")
                planner_prompt = (
                    "SELFTEST técnico sem publicação. No ficheiro SELFTEST.md, "
                    "substitui exactamente ALPHA por BETA. Faz a alteração mínima com operation=replace."
                )
                if repair:
                    planner_prompt += (
                        "\\n\\nO plano anterior foi rejeitado localmente: "
                        + repair[-800:]
                        + "\\nCorrige o plano e copia search literalmente do ficheiro fornecido."
                    )
                try:
                    plan, model_used = request_repo_change_plan_with_context(
                        "centro-negocios-ia", planner_prompt, context
                    )
                    edits = plan.get("edits") if isinstance(plan.get("edits"), list) else []
                    if not edits:
                        repair = "zero edições"
                        continue
                    apply_repo_change_plan(probe_dir, plan)
                    final = probe_file.read_text(encoding="utf-8")
                    extra = [
                        p for p in probe_dir.rglob("*")
                        if p.is_file() and p.name != "SELFTEST.md"
                    ]
                    if "BETA" in final and "ALPHA" not in final and not extra:
                        planner_ok = True
                        planner_detail = (
                            (model_used or "modelo não identificado")
                            + f" · dry-run aplicado na tentativa {round_no + 1}/3"
                        )
                        break
                    repair = "resultado não produziu apenas ALPHA → BETA"
                except Exception as exc:
                    repair = str(exc)
            if not planner_ok:
                planner_detail = (repair or "dry-run sem resultado")[:500]
        except Exception as exc:
            planner_detail = str(exc)[:500]
        finally:
            shutil.rmtree(probe_dir, ignore_errors=True)
        add("Workers AI planner + apply", planner_ok, planner_detail)

        # Ferramentas essenciais
        git_bin = shutil.which("git")
        add("Git", bool(git_bin), git_bin or "não encontrado")
        add("Python 3", bool(shutil.which("python3")))
        claude = find_claude()
        add("Claude Code", bool(claude), claude or "não encontrado")
        add("Ollama key", bool(read_secret(OLLAMA_KEY_FILE)))

        # Escrita local necessária para worktrees temporários.
        try:
            WORKTREE_ROOT.mkdir(parents=True, exist_ok=True)
            probe = WORKTREE_ROOT / (".selftest-" + secrets.token_hex(4))
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
            add("Workspace temporário", True)
        except Exception as exc:
            add("Workspace temporário", False, exc)

        # Acesso remoto real aos repositórios, sem clone nem escrita remota.
        if git_bin:
            for repo_name, remote in REPOS.items():
                result = run_cmd_retry(
                    [git_bin, "ls-remote", "--heads", remote, "refs/heads/main"],
                    timeout=25,
                    attempts=3,
                    delay=2,
                )
                ok = result["exitCode"] == 0 and bool(result["stdout"].strip())
                detail = (
                    "main acessível"
                    if ok
                    else (result["stderr"] or result["stdout"] or f"exit {result['exitCode']}")
                )
                add("Repo " + repo_name, ok, detail)

        # Agentes opcionais: medidos, mas não bloqueiam o núcleo.
        openclaw_ok, _, _, _ = openclaw_http_health()
        laya_ok, _, _, _ = laya_http_health()
        remote_ok = False
        try:
            remote_ok = bool(
                json.loads(
                    (HOME / ".centro-station" / "status.json").read_text(encoding="utf-8")
                ).get("remoteDesktop", {}).get("healthy")
            )
        except Exception:
            pass
        optional = [
            ("OpenClaw", openclaw_ok),
            ("Laya", laya_ok),
            ("Remote Desktop", remote_ok),
            ("Manus key", MANUS_KEY_FILE.exists()),
        ]

        essential_names = {
            "Worker + TASKS",
            "Worker build identificado",
            "Runtime main alinhado",
            "Centro Agent",
            "Supervisor",
            "Token Server",
            "Token Operit",
            "Git",
            "Python 3",
            "Workspace temporário",
            "Workers AI planner + apply",
        }
        essential = [(n, ok, d) for n, ok, d in checks if n in essential_names or n.startswith("Repo ")]
        failures = [(n, d) for n, ok, d in essential if not ok]

        lines = ["CENTRO · SELF-TEST AUTONOMIA", "", "CAMINHO ESSENCIAL"]
        for name, ok, detail in checks:
            lines.append(f"{'OK' if ok else 'FALHA'} · {name}" + (f" · {detail}" if detail else ""))
        lines += ["", "AGENTES OPCIONAIS"]
        for name, ok in optional:
            lines.append(f"{'OK' if ok else 'OFF'} · {name}")
        lines += [
            "",
            f"Essencial: {len(essential)-len(failures)}/{len(essential)}",
            "Resultado: " + ("PRONTO" if not failures else "CORRIGIR " + str(len(failures)) + " FALHA(S)"),
        ]
        return {
            "exitCode": 0 if not failures else 1,
            "stdout": "\n".join(lines),
            "stderr": "" if not failures else "\n".join(f"{n}: {d}" for n, d in failures),
            "durationMs": int((time.time() - started) * 1000),
        }

    if action == "station_doctor":
        agent_active, _ = pid_running(AGENT_PID_FILE)
        supervisor_active, _ = pid_running(SUPERVISOR_PID_FILE)
        claude = shutil.which("claude") or (str(HOME / ".local" / "bin" / "claude") if (HOME / ".local" / "bin" / "claude").exists() else "")
        laya_ok, _, _, _ = laya_http_health()
        core_checks = [
            ("Servidor privado", True),
            ("Centro Agent", agent_active),
            ("Supervisor", supervisor_active),
            ("Python 3", bool(shutil.which("python3"))),
            ("Node", bool(shutil.which("node"))),
            ("Token servidor", TOKEN_FILE.exists()),
            ("Token Operit", (HOME / ".centro-agent" / "token").exists()),
        ]
        optional = [
            ("OpenClaw CLI", bool(locate_openclaw())),
            ("OpenClaw Gateway", openclaw_http_health()[0]),
            ("Laya", laya_ok),
            ("Claude Code", bool(claude)),
            ("Manus API key", MANUS_KEY_FILE.exists()),
        ]
        lines = ["DIAGNÓSTICO CENTRO STATION", "", "NÚCLEO"]
        for name, ok in core_checks:
            lines.append(f"{'OK' if ok else 'FALHA'} · {name}")
        lines.append("")
        lines.append("EXTRAS")
        for name, ok in optional:
            lines.append(f"{'OK' if ok else 'OFF'} · {name}")
        overall = all(ok for _, ok in core_checks)
        return {
            "exitCode": 0 if overall else 1,
            "stdout": "\n".join(lines),
            "stderr": "" if overall else "O núcleo tem componentes por corrigir.",
            "durationMs": 0,
        }

    if action == "openclaw_status":
        started = time.time()
        binary = locate_openclaw()
        healthy, http_status, health_body, _ = openclaw_http_health()
        lines = [
            "OPENCLAW",
            f"CLI: {'OK' if binary else 'FALTA'}",
            f"Gateway: {'ONLINE' if healthy else 'OFFLINE'}",
            f"Endpoint: 127.0.0.1:{OPENCLAW_PORT}",
            f"Health HTTP: {http_status if http_status else '-'}",
            f"Health: {health_body[:500] if health_body else '-'}",
            "Modo Centro: leitura/análise",
        ]
        return {
            "exitCode": 0 if healthy else 1,
            "stdout": "\n".join(lines),
            "stderr": "" if healthy else "Gateway OpenClaw não responde em loopback.",
            "durationMs": int((time.time() - started) * 1000),
        }

    if action == "openclaw_models":
        binary = locate_openclaw()
        if not binary:
            return {"exitCode": 127, "stdout": "", "stderr": "OpenClaw não foi encontrado.", "durationMs": 0}
        started = time.time()
        result = run_cmd([binary, "models", "list", "--json"], timeout=60)
        result["durationMs"] = int((time.time() - started) * 1000)
        return result

    if action == "openclaw_query":
        prompt = str((task.get("args") or {}).get("prompt") or "").strip()
        if not prompt:
            return {"exitCode": 2, "stdout": "", "stderr": "Pedido OpenClaw em falta.", "durationMs": 0}
        if len(prompt) > 5000:
            return {"exitCode": 2, "stdout": "", "stderr": "Pedido OpenClaw demasiado longo.", "durationMs": 0}

        binary = locate_openclaw()
        if not binary:
            return {"exitCode": 127, "stdout": "", "stderr": "OpenClaw não foi encontrado.", "durationMs": 0}

        healthy, _, _, _ = openclaw_http_health()
        if not healthy:
            return {
                "exitCode": 69,
                "stdout": "",
                "stderr": "Gateway OpenClaw está offline em 127.0.0.1:18789.",
                "durationMs": 0,
            }

        safe_prompt = (
            "Pedido recebido através do Centro de Negócios. "
            "Responde em português de Portugal, de forma directa e curta. "
            "Nesta primeira integração estás em modo de análise: não alteres ficheiros, "
            "não faças deploy, não apagues dados e não executes acções destrutivas sem uma autorização separada.\n\n"
            + prompt
        )

        lower_prompt = prompt.lower()
        literal_fast = (
            len(prompt) <= 500
            and any(key in lower_prompt for key in (
                "responde apenas",
                "diz apenas",
                "apenas:",
                "somente",
                "só responde",
            ))
        )

        params = {
            "message": safe_prompt,
            "agentId": "main",
            "sessionKey": "agent:main:centro",
            "thinking": "low",
            "deliver": False,
            "timeout": 180,
            "idempotencyKey": secrets.token_hex(16),
            "label": "Centro de Negócios",
        }
        if literal_fast:
            params["promptMode"] = "minimal"
            params["bootstrapContextMode"] = "lightweight"

        started = time.time()
        result = run_cmd_retry(
            [
                binary,
                "gateway",
                "call",
                "agent",
                "--params",
                json.dumps(params, ensure_ascii=False),
                "--expect-final",
                "--json",
                "--timeout",
                "190000",
            ],
            timeout=OPENCLAW_TIMEOUT,
            attempts=2,
            delay=3,
        )
        if result["exitCode"] == 0:
            result["stdout"] = extract_openclaw_reply(result["stdout"])[-12000:]
        result["durationMs"] = int((time.time() - started) * 1000)
        return result

    if action == "laya_status":
        started = time.time()
        try:
            status, data = http_json(LAYA_BASE + "/health", timeout=5)
            loaded = data.get("loaded") or []
            return {
                "exitCode": 0,
                "stdout": "\n".join([
                    "LAYA",
                    "Estado: ONLINE",
                    f"Endpoint: 127.0.0.1:18790",
                    f"HTTP: {status}",
                    f"Modelos carregados: {', '.join(loaded) if loaded else 'nenhum / a carregar'}",
                    f"Dispositivo: {data.get('device', '-')}",
                    "Função no Centro: router System 1 / decisões tipadas",
                ]),
                "stderr": "",
                "durationMs": int((time.time() - started) * 1000),
            }
        except Exception as exc:
            return {
                "exitCode": 1,
                "stdout": "LAYA\nEstado: OFFLINE\nEndpoint: 127.0.0.1:18790",
                "stderr": str(exc),
                "durationMs": int((time.time() - started) * 1000),
            }

    if action == "laya_decide":
        prompt = str((task.get("args") or {}).get("prompt") or "").strip()
        if not prompt:
            return {"exitCode": 2, "stdout": "", "stderr": "Pedido Laya em falta.", "durationMs": 0}
        if len(prompt) > 12000:
            return {"exitCode": 2, "stdout": "", "stderr": "Pedido Laya demasiado longo.", "durationMs": 0}
        started = time.time()
        try:
            _, data = laya_request(prompt)
            return {
                "exitCode": 0,
                "stdout": format_laya_result(data),
                "stderr": "",
                "durationMs": int((time.time() - started) * 1000),
            }
        except Exception as exc:
            return {
                "exitCode": 1,
                "stdout": "",
                "stderr": "Laya indisponível: " + str(exc),
                "durationMs": int((time.time() - started) * 1000),
            }

    if action == "manus_status":
        started = time.time()
        key = read_secret(MANUS_KEY_FILE)
        if not key:
            return {
                "exitCode": 78,
                "stdout": "MANUS\nEstado: SEM CHAVE LOCAL",
                "stderr": "Guarda a API key em ~/.centro-agent/manus_api_key com permissão 600.",
                "durationMs": int((time.time() - started) * 1000),
            }
        try:
            status, data = manus_request("/v2/user.me", timeout=20)
            return {
                "exitCode": 0,
                "stdout": "\n".join([
                    "MANUS",
                    "API v2: ONLINE",
                    f"HTTP: {status}",
                    f"Conta: {str(data.get('email') or data.get('name') or data.get('user_id') or 'autenticada')}",
                    "Agente: agent-default",
                    "Task principal: agent-default-main_task",
                ]),
                "stderr": "",
                "durationMs": int((time.time() - started) * 1000),
            }
        except Exception as exc:
            return {
                "exitCode": 1,
                "stdout": "MANUS\nAPI v2: FALHA",
                "stderr": str(exc),
                "durationMs": int((time.time() - started) * 1000),
            }

    if action == "manus_query":
        prompt = str((task.get("args") or {}).get("prompt") or "").strip()
        if not prompt:
            return {"exitCode": 2, "stdout": "", "stderr": "Pedido Manus em falta.", "durationMs": 0}
        if len(prompt) > 12000:
            return {"exitCode": 2, "stdout": "", "stderr": "Pedido Manus demasiado longo.", "durationMs": 0}
        if not read_secret(MANUS_KEY_FILE):
            return {
                "exitCode": 78,
                "stdout": "",
                "stderr": "Falta ~/.centro-agent/manus_api_key.",
                "durationMs": 0,
            }

        safe_prompt = (
            "Pedido vindo do Centro de Negócios. Responde em português de Portugal. "
            "Nesta primeira integração trabalha em modo de análise: não compres, não publiques, "
            "não envies mensagens, não alteres contas e não executes acções externas irreversíveis. "
            "Se uma acção persistente for necessária, explica o que pretendes fazer e espera por autorização.\n\n"
            + prompt
        )
        started = time.time()
        since_ms = int(started * 1000)
        try:
            manus_request(
                "/v2/task.sendMessage",
                method="POST",
                payload={
                    "task_id": "agent-default-main_task",
                    "message": {"content": safe_prompt},
                },
                timeout=30,
            )
            deadline = time.time() + 240
            while time.time() < deadline:
                time.sleep(2)
                query = (
                    "/v2/task.listMessages?task_id=agent-default-main_task"
                    "&order=desc&limit=10"
                )
                _, data = manus_request(query, timeout=30)
                state, content = manus_extract_latest(data.get("messages"), since_ms)
                if state == "done":
                    return {
                        "exitCode": 0,
                        "stdout": content[-12000:],
                        "stderr": "",
                        "durationMs": int((time.time() - started) * 1000),
                    }
                if state == "error":
                    return {
                        "exitCode": 1,
                        "stdout": "",
                        "stderr": content,
                        "durationMs": int((time.time() - started) * 1000),
                    }
                if state == "waiting":
                    return {
                        "exitCode": 10,
                        "stdout": "MANUS AGUARDA CONFIRMAÇÃO\n\n" + content,
                        "stderr": "",
                        "durationMs": int((time.time() - started) * 1000),
                    }
            return {
                "exitCode": 124,
                "stdout": "",
                "stderr": "Tempo limite do Manus excedido.",
                "durationMs": int((time.time() - started) * 1000),
            }
        except Exception as exc:
            return {
                "exitCode": 1,
                "stdout": "",
                "stderr": "Falha Manus: " + str(exc),
                "durationMs": int((time.time() - started) * 1000),
            }

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

    if action == "repo_change":
        return action_repo_change(task)

    if action == "git_access_matrix":
        return action_git_access_matrix(task)

    if action == "fault_timeout":
        return action_fault_timeout(task)

    if action == "fault_openclaw_recovery":
        return action_fault_openclaw_recovery(task)

    if action in {"git_status", "git_pull"}:
        if target not in REPOS:
            return {"exitCode": 2, "stdout": "", "stderr": "Projecto não permitido.", "durationMs": 0}
        path, repo_error = ensure_repo(target)
        if repo_error:
            return repo_error

        if action == "git_status":
            return run_cmd(["git", "status", "--short", "--branch"], cwd=path)

        origin = run_cmd(["git", "remote", "get-url", "origin"], cwd=path)
        expected = canonical_github_repo(REPOS[target])
        actual = canonical_github_repo(origin["stdout"])
        if origin["exitCode"] != 0 or not expected or actual != expected:
            return {
                "exitCode": 4,
                "stdout": "",
                "stderr": "Remote Git não corresponde ao repositório autorizado.",
                "durationMs": origin["durationMs"],
            }
        return run_cmd(["git", "pull", "--ff-only"], cwd=path)

    if action == "claude_query":
        prompt = str((task.get("args") or {}).get("prompt") or "").strip()
        if not prompt:
            return {"exitCode": 2, "stdout": "", "stderr": "Pedido para o Claude Code em falta.", "durationMs": 0}
        if len(prompt) > 5000:
            return {"exitCode": 2, "stdout": "", "stderr": "Pedido demasiado longo.", "durationMs": 0}

        cwd = HOME
        if target != "local":
            if target not in REPOS:
                return {"exitCode": 2, "stdout": "", "stderr": "Projecto não permitido.", "durationMs": 0}
            cwd, repo_error = ensure_repo(target)
            if repo_error:
                return repo_error

        claude = shutil.which("claude")
        if not claude:
            candidates = [
                HOME / ".local" / "bin" / "claude",
                Path("/usr/local/bin/claude"),
                Path("/usr/bin/claude"),
            ]
            claude = next((str(p) for p in candidates if p.exists()), None)
        if not claude:
            return {"exitCode": 127, "stdout": "", "stderr": "Claude Code não foi encontrado.", "durationMs": 0}

        try:
            key = OLLAMA_KEY_FILE.read_text(encoding="utf-8").strip()
        except FileNotFoundError:
            key = ""
        if not key:
            return {
                "exitCode": 78,
                "stdout": "",
                "stderr": "Falta a chave Ollama em ~/.centro-agent/ollama_api_key.",
                "durationMs": 0,
            }

        auth_ok, auth_detail = ollama_auth_check(key)
        if not auth_ok:
            return readonly_cloud_fallback(prompt, auth_detail)
        env = os.environ.copy()
        env["ANTHROPIC_BASE_URL"] = "https://ollama.com"
        env["ANTHROPIC_AUTH_TOKEN"] = key
        env["OLLAMA_API_KEY"] = key
        env.pop("ANTHROPIC_API_KEY", None)

        system_note = (
            "Estás a responder através do Centro de Negócios no Telegram. "
            "Responde em português de Portugal, de forma directa e curta. "
            "Esta chamada está em modo de análise: não alteres ficheiros nem executes acções destrutivas."
        )

        result = run_cmd(
            [claude, "--model", "gpt-oss:120b", "--permission-mode", "plan",
             "--append-system-prompt", system_note, "-p", prompt],
            cwd=cwd, timeout=CLAUDE_TIMEOUT, env=env,
        )
        if result["exitCode"] != 0:
            return readonly_cloud_fallback(prompt, "Claude/Ollama exit="+str(result["exitCode"]))
        return result

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

        if path == "/capabilities":
            self.send_json(200, {"ok": True, "capabilities": capabilities()})
            return

        if path == "/history":
            self.send_json(200, {"ok": True, "history": read_history(30)})
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
            task = task if isinstance(task, dict) else {}
            if not EXECUTION_LOCK.acquire(blocking=False):
                self.send_json(503, {"ok": False, "error": "Executor ocupado; repetir mais tarde."})
                return
            try:
                task_id = str(task.get("id") or "")
                identity = json.dumps({k: task.get(k) for k in ("id","action","target","args")},
                                      sort_keys=True, ensure_ascii=False)
                cache = RESULT_DIR / (hashlib.sha256(identity.encode()).hexdigest()+".json")
                if task_id and cache.exists():
                    self.send_json(200, {"ok": True, "result": json.loads(cache.read_text())})
                    return
                mark_busy(task)
                # Termina antes da lease de 20 minutos da fila; deixa margem para entregar.
                EXECUTION_STATE.deadline = time.monotonic()+840
                try:
                    result = execute_action(task)
                except Exception as exc:
                    result = {"exitCode": 1, "stdout": "", "stderr": type(exc).__name__+": "+str(exc)[:1500], "durationMs": 0}
                append_history(task, result)
                if task_id and int(result.get("exitCode",1)) == 0:
                    RESULT_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
                    tmp = cache.with_suffix(".tmp")
                    tmp.write_text(json.dumps(result, ensure_ascii=False))
                    os.chmod(tmp, 0o600)
                    tmp.replace(cache)
                self.send_json(200, {"ok": True, "result": result})
            finally:
                EXECUTION_STATE.deadline = float("inf")
                clear_busy()
                EXECUTION_LOCK.release()
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
    # Um crash anterior pode deixar um lock órfão. O processo novo começa limpo.
    clear_busy()
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
