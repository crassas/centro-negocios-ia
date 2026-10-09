#!/usr/bin/env python3
"""Optional read-only tool bridge for the Travis agent.

No paid inference, APK inspection, simulations, package installs, or code writes
are triggered automatically. A tool is marked verified only after a CLI probe.
Atlas itself is not supported on headless Linux; Git history is a fallback,
never reported as an Atlas installation.
"""
from __future__ import annotations
import os
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

HOME = Path.home()
REPOS = HOME / "repos"
TOOLS = {
    "pi": {
        "label": "Pi",
        "executable": HOME / ".travis-tools/pi/node_modules/.bin/pi",
        "probe": ["--version"],
        "purpose": "Agentes de código e sessões",
    },
    "openresearch": {
        "label": "OpenResearch",
        "executable": HOME / ".travis-tools/orx/orx",
        "probe": ["--version"],
        "purpose": "Investigação e registo de experiências",
    },
    "mirofish": {
        "label": "MiroFish",
        "executable": HOME / ".local/bin/mirofish",
        "probe": ["--help"],
        "purpose": "Simulações multiagente (alto consumo de recursos)",
    },
    "asc": {
        "label": "ASC / Droid ASC",
        "executable": HOME / ".travis-tools/asc-pip-venv/bin/droidasc",
        "probe": ["--help"],
        "purpose": "Inspecção local de ficheiros Android APK/DEX",
    },
}
REPOSITORIES = {
    "centro": "centro-negocios-ia",
    "pentehouse": "pente_houselanding",
    "best-pizza": "best-pizza-kebab",
    "2-irmaos": "restaurante-2-irmaos",
    "beatriz": "engomadoria-beatriz",
}
MAX_STDOUT = 3500
MAX_TIME = 14

def _norm(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value).lower())
    return "".join(x for x in value if not unicodedata.combining(x))

def _call(command, *, cwd=None, timeout=MAX_TIME):
    try:
        completed = subprocess.run(
            [str(x) for x in command], cwd=cwd, capture_output=True,
            text=True, errors="replace", timeout=timeout,
            stdin=subprocess.DEVNULL, env={**os.environ, "NO_COLOR": "1"}
        )
        raw = (completed.stdout or completed.stderr or "").strip()
        return {"ok": completed.returncode == 0, "exitCode": completed.returncode,
                "output": raw[:MAX_STDOUT]}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "errorType": type(exc).__name__, "output": ""}

def _status(name):
    if name == "atlas":
        return {
            "id": "atlas", "label": "Atlas", "installed": False,
            "verified": False, "alternativeReady": shutil.which("git") is not None,
            "purpose": "Sessões e checkpoints de agentes",
            "detail": "Atlas GUI não suportado neste Ubuntu Android. Alternativa: histórico Git local; não é o Atlas.",
        }
    spec = TOOLS[name]
    path = spec["executable"]
    installed = path.is_file() and os.access(path, os.X_OK)
    check = _call([path, *spec["probe"]], timeout=7) if installed else {"ok": False}
    return {
        "id": name, "label": spec["label"], "installed": installed,
        "verified": bool(installed and check["ok"]), "purpose": spec["purpose"],
        "detail": (check.get("output") or check.get("errorType") or "")[:160] if installed
                  else "Executável ainda não disponível ou não instalado.",
    }

def snapshot(name=None):
    """Statuses are observed on the current machine, not inferred from screenshots."""
    if name is not None and name not in {*TOOLS, "atlas"}:
        raise ValueError("Ferramenta desconhecida")
    wanted = [name] if name else ["atlas", "pi", "openresearch", "mirofish", "asc"]
    return {"ok": True, "action": "toolhub_status", "tools": [_status(x) for x in wanted],
            "paidCallsEnabled": False, "automaticSimulationsEnabled": False}

def perform(args):
    """Explicit diagnostic and read-only commands only, never shell strings."""
    name = str(args.get("tool") or "")
    operation = str(args.get("operation") or "")
    if name == "atlas":
        if operation != "history":
            raise ValueError("Operação Atlas não autorizada")
        target = str(args.get("project") or "centro")
        if target not in REPOSITORIES:
            raise ValueError("Repositório não autorizado")
        directory = (REPOS / REPOSITORIES[target]).resolve()
        if not directory.is_dir() or not (directory / ".git").exists():
            return {"ok": False, "tool": name, "output": "Repositório local indisponível"}
        result = _call(["git", "-C", directory, "log", "-n", "5",
                        "--format=%h %ad %s", "--date=short"])
        return {**result, "tool": name, "operation": operation,
                "note": "Histórico Git local, não Atlas"}
    if name not in TOOLS:
        raise ValueError("Ferramenta desconhecida")
    spec = TOOLS[name]
    options = {
        ("pi", "sessions"): ["sessions", "list"],
        ("openresearch", "projects"): ["projects"],
        ("mirofish", "runs"): ["runs", "list", "--json"],
        ("asc", "help"): ["--help"],
    }
    extra = options.get((name, operation))
    if extra is None:
        raise ValueError("Comando não autorizado. A execução de agentes, simulações e alterações exige autorização explícita e configuração.")
    if not spec["executable"].is_file():
        return {"ok": False, "tool": name, "operation": operation,
                "output": "Não está instalada ou o executável não foi encontrado."}
    result = _call([spec["executable"], *extra], cwd=HOME)
    return {**result, "tool": name, "operation": operation}

def classify(text):
    """Conservative natural-language intents; unrelated requests pass through."""
    t = _norm(text)
    terms = {
        "atlas": r"\batlas\b",
        "pi": r"\bpi\b",
        "openresearch": r"\bopenresearch\b|\bopen research\b",
        "mirofish": r"\bmirofish\b|\bmiro fish\b",
        "asc": r"\bdroidasc\b|\bdroid asc\b|\basc\b",
    }
    selected = next((key for key, pattern in terms.items()
                     if re.search(pattern, t)), None)
    if re.search(r"\b(?:ferramentas novas|ferramentas externas|toolhub|tool hub|cinco ferramentas|5 ferramentas)\b", t):
        return "toolhub_status", {}
    if not selected:
        return None
    if selected == "atlas" and re.search(r"\b(?:historico|commits?|checkpoints?|log)\b", t):
        project = next((key for key in REPOSITORIES if key in t), "centro")
        return "toolhub_action", {"tool": "atlas", "operation": "history", "project": project}
    if selected == "pi" and re.search(r"\b(?:sessoes|sessions)\b", t):
        return "toolhub_action", {"tool": "pi", "operation": "sessions"}
    if selected == "openresearch" and re.search(r"\b(?:projetos|projectos|projects)\b", t):
        return "toolhub_action", {"tool": "openresearch", "operation": "projects"}
    if selected == "mirofish" and re.search(r"\b(?:execucoes|runs|simulacoes anteriores)\b", t):
        return "toolhub_action", {"tool": "mirofish", "operation": "runs"}
    if selected == "asc" and re.search(r"\b(?:ajuda|help|comandos)\b", t):
        return "toolhub_action", {"tool": "asc", "operation": "help"}
    return "toolhub_status", {"tool": selected}

def reply(result, language="pt"):
    if result.get("action") == "toolhub_status":
        entries = []
        for tool in result.get("tools", []):
            state = ("verificado" if tool["verified"] else
                     "instalado mas não verificado" if tool["installed"] else
                     "alternativa Git disponível, Atlas não instalado" if tool["id"] == "atlas" and tool.get("alternativeReady") else
                     "não instalado")
            if language != "pt":
                state = ("verified" if tool["verified"] else
                         "installed, not verified" if tool["installed"] else "not installed")
            entries.append(tool["label"] + ": " + state)
        return "; ".join(entries) + ". "
    result_ok = bool(result.get("ok"))
    output = result.get("output") or result.get("errorType") or "Sem resultados."
    if not result_ok:
        return ("A consulta falhou: " if language == "pt" else "Query failed: ") + output[:700]
    return output[:1400] or ("Consulta concluída sem resultados." if language == "pt" else "Query completed with no results.")
