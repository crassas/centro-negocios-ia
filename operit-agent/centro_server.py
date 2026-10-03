#!/usr/bin/env python3
import json
import os
import secrets
import signal
import shutil
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
SUPERVISOR_PID_FILE = HOME / ".centro-station" / "supervisor.pid"
HISTORY_FILE = STATE_DIR / "history.jsonl"
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
            "system_info",
            "site_check",
            "git_status",
            "git_pull",
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
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read().decode("utf-8", errors="replace")
        return res.status, json.loads(raw) if raw else {}


def laya_request(state):
    questions = {
        "route": {
            "type": "choice",
            "instructions": "Qual é o especialista principal para tratar este pedido?",
            "criteria": {
                "fast_chat": "conversa simples, cumprimento, resposta curta ou esclarecimento imediato",
                "code": "programação, arquitectura, repositórios, debugging, implementação técnica",
                "audit": "verificação, riscos, segurança, bugs, pressupostos frágeis, qualidade",
                "seo": "SEO, GEO, AEO, pesquisa local, indexação, conteúdo para motores de busca",
                "ux": "interface, experiência do utilizador, conversão, percurso, mobile",
                "research": "pesquisa externa, comparação, recolha ou validação de informação",
                "openclaw": "execução local, ficheiros, terminal, ferramentas ou automação no dispositivo",
                "manus": "missão autónoma multi-etapa com pesquisa, browser, artefactos ou trabalho prolongado"
            }
        },
        "complexity": {
            "type": "score",
            "instructions": "Qual é a complexidade operacional do pedido?",
            "criteria": ["simples", "moderada", "complexa", "missão"]
        },
        "needs_tools": {
            "type": "noul",
            "instructions": "Este pedido precisa de ferramentas ou execução além de uma resposta textual?"
        },
        "needs_web": {
            "type": "noul",
            "instructions": "Este pedido precisa de informação externa ou navegação web?"
        }
    }
    payload = {
        "state": str(state),
        "questions": questions,
        "model": "multilingual",
        "min_confidence": 0.45
    }
    return http_json(LAYA_BASE + "/v1/systemone", method="POST", payload=payload, timeout=45)


def format_laya_result(data):
    answers = data.get("answers") or {}
    route = answers.get("route") or {}
    complexity = answers.get("complexity") or {}
    tools = answers.get("needs_tools") or {}
    web = answers.get("needs_web") or {}
    routing = data.get("routing") or {}
    lines = [
        "LAYA · SYSTEM 1",
        f"Rota: {route.get('choice', '-')}",
        f"Confiança rota: {float(route.get('answer_confidence') or 0):.3f}",
        f"Complexidade: {complexity.get('score', '-')}",
        f"Precisa ferramentas: {float(tools.get('noul') or 0):.3f}",
        f"Precisa web: {float(web.get('noul') or 0):.3f}",
        f"Checkpoint: {routing.get('model', 'multilingual')}",
    ]
    usage = data.get("usage") or {}
    if "input_tokens" in usage:
        lines.append(f"Tokens entrada: {usage.get('input_tokens')}")
    return "\n".join(lines)


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
        lines = [
            "ESTAÇÃO CENTRO",
            "Núcleo local-first",
            "Fallback pago automático: NÃO",
            "",
            f"Servidor: ACTIVO · PID {os.getpid()}",
            f"Agente: {'ACTIVO' if agent_active else 'PARADO'} · PID {agent_pid if agent_pid else '-'}",
            f"Supervisor: {'ACTIVO' if supervisor_active else 'PARADO'} · PID {supervisor_pid if supervisor_pid else '-'}",
            f"Capacidades: {len(capabilities()['actions'])}",
            f"Projectos autorizados: {len(REPOS)}",
            f"Sites monitorizados: {len(SITES)}",
        ]
        return {"exitCode": 0, "stdout": "\n".join(lines), "stderr": "", "durationMs": 0}

    if action == "station_doctor":
        agent_active, _ = pid_running(AGENT_PID_FILE)
        supervisor_active, _ = pid_running(SUPERVISOR_PID_FILE)
        claude = shutil.which("claude") or (str(HOME / ".local" / "bin" / "claude") if (HOME / ".local" / "bin" / "claude").exists() else "")
        checks = [
            ("Servidor privado", True),
            ("Centro Agent", agent_active),
            ("Supervisor", supervisor_active),
            ("Python 3", bool(shutil.which("python3"))),
            ("Node", bool(shutil.which("node"))),
            ("Claude Code", bool(claude)),
            ("OpenClaw CLI", bool(locate_openclaw())),
            ("OpenClaw Gateway", openclaw_http_health()[0]),
            ("Manus API key", MANUS_KEY_FILE.exists()),
            ("Token servidor", TOKEN_FILE.exists()),
            ("Token Operit", (HOME / ".centro-agent" / "token").exists()),
        ]
        lines = ["DIAGNÓSTICO CENTRO STATION"]
        for name, ok in checks:
            lines.append(f"{'OK' if ok else 'FALHA'} · {name}")
        overall = all(ok for _, ok in checks)
        return {
            "exitCode": 0 if overall else 1,
            "stdout": "\n".join(lines),
            "stderr": "" if overall else "Há componentes por corrigir.",
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
            timeout=OPENCLAW_TIMEOUT,
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
            cwd = locate_repo(target)
            if not cwd:
                return {
                    "exitCode": 3,
                    "stdout": "",
                    "stderr": f"Repositório {target} ainda não existe localmente.",
                    "durationMs": 0,
                }

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

        started = time.time()
        try:
            proc = subprocess.run(
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
                cwd=str(cwd),
                text=True,
                capture_output=True,
                timeout=CLAUDE_TIMEOUT,
                check=False,
                env=env,
            )
            return {
                "exitCode": proc.returncode,
                "stdout": proc.stdout[-12000:],
                "stderr": proc.stderr[-6000:],
                "durationMs": int((time.time() - started) * 1000),
            }
        except subprocess.TimeoutExpired:
            return {
                "exitCode": 124,
                "stdout": "",
                "stderr": "Tempo limite do Claude Code excedido.",
                "durationMs": int((time.time() - started) * 1000),
            }

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
            result = execute_action(task)
            append_history(task, result)
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
