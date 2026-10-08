#!/usr/bin/env python3
"""Bounded read-only multi-tool workflows for Travis. Never delegates permissions to an LLM."""
import re
import time
import unicodedata

MAX_STEPS = 5
# Every candidate is an existing, explicitly registered, read-only host capability.
DEFINITIONS = (
    ("system_status", r"\b(?:servidor|sistema|estacao|centro server|ubuntu|server|system|station)\b", "Centro"),
    ("site_check", r"\b(?:sites?|paginas? publicadas|websites?)\b", "Published sites"),
    ("task_list", r"\b(?:tarefas?|tasks?|pendentes|to-do)\b", "Tasks"),
    ("agent_sessions", r"\b(?:agentes?|equipa|agents?|sessoes?)\b", "Agents"),
    ("repo_access", r"\b(?:repositorios?|repositories|github|codigo fonte)\b", "Repositories"),
    ("search_positions", r"\b(?:seo|search console|posicoes?|rankings?)\b", "Search visibility"),
    ("neural_status", r"\b(?:memoria|neuronios?|cerebro|memory|brain)\b", "Memory"),
    ("gmail_inbox", r"\b(?:gmail|emails?|inbox|correio)\b", "Gmail"),
)
SAFE_TOOLS = frozenset(x[0] for x in DEFINITIONS)
WORKFLOW_VERBS = r"\b(?:verifica|confirma|mostra|consulta|resume|faz|prepara|analisa|compara|inspeciona|check|show|review|summarise|summarize|compare|inspect|give|report)\b"
NEGATIONS = r"\b(?:nao|nunca|jamais|sem|dont|don't|do not|never|without)\b"
HYPOTHETICALS = r"^(?:como|e se|imagina|supondo|what if|how would|why|porque)\b"
WRITE_WORDS = r"\b(?:apaga|elimina|publica|edita|altera|instala|envia|manda|compra|delete|send|publish|deploy|modify|change|install)\b"

def plain(value):
    return "".join(ch for ch in unicodedata.normalize("NFD", str(value).lower()) if not unicodedata.combining(ch))

def plan(text):
    """Only a clear, affirmative request for 2+ independent read-only checks."""
    t = plain(re.sub(r"^(?:travis|jarvis)[,;:!?.\s]+", "", str(text), flags=re.I)).strip()
    if not t or len(t) > 1200 or re.search(HYPOTHETICALS, t):
        return []
    if re.search(NEGATIONS, t) or re.search(WRITE_WORDS, t) or not re.search(WORKFLOW_VERBS, t):
        return []
    generic = bool(re.search(r"\b(?:ponto de situacao geral|resumo geral|briefing geral|estado geral|general status|full status|overall status)\b", t))
    selected = []
    for tool, pattern, title in DEFINITIONS:
        if re.search(pattern, t):
            selected.append({"tool": tool, "args": {}, "title": title})
    if generic and len(selected) < 2:
        for tool, title in (("system_status", "Centro"), ("site_check", "Published sites"), ("task_list", "Tasks")):
            if tool not in {entry["tool"] for entry in selected}:
                selected.append({"tool": tool, "args": {}, "title": title})
    return selected[:MAX_STEPS] if len(selected) >= 2 else []

def summarize(tool, result):
    if tool == "system_status":
        online = bool(result.get("centro", {}).get("ok"))
        return "Centro online" if online else "Centro not verified as online"
    if tool == "site_check":
        successes = sum(v.get("online") is True for v in result.values())
        return f"{successes}/{len(result)} published sites confirmed online"
    if tool == "task_list":
        return f"{len(result.get('tasks', []))} tasks returned"
    if tool == "agent_sessions":
        return "Agent confirmed active" if result.get("agent") else "Agent not confirmed active"
    if tool == "repo_access":
        entries = result.get("projects", [])
        return f"{sum(bool(p.get('available')) for p in entries)}/{len(entries)} repositories accessible"
    if tool == "search_positions":
        if isinstance(result, dict):
            return str(result.get("reply") or "Search information returned")[:240]
        return "Search information returned; verify the source date"
    if tool == "neural_status":
        return f"{result.get('neurons', 0)} memory nodes"
    if tool == "gmail_inbox":
        return f"{len(result.get('messages', []))} message headers read"
    return "Result returned; independent verification pending"

def run(request, steps, execute):
    if not isinstance(steps, list) or not 2 <= len(steps) <= MAX_STEPS:
        raise ValueError("Workflow requires 2 to 5 approved read-only steps")
    results = []
    for row in steps:
        if not isinstance(row, dict) or row.get("tool") not in SAFE_TOOLS or row.get("args") != {}:
            raise ValueError("Unapproved workflow capability or arguments")
        tool = row["tool"]
        start = time.monotonic()
        try:
            payload = execute(tool, {})
            detail = summarize(tool, payload)
            results.append({"tool": tool, "title": row.get("title", tool)[:80], "status": "returned",
                            "detail": detail, "durationMs": int((time.monotonic()-start)*1000)})
        except Exception as exc:
            results.append({"tool": tool, "title": row.get("title", tool)[:80], "status": "failed",
                            "detail": type(exc).__name__ + ": " + str(exc)[:120],
                            "durationMs": int((time.monotonic()-start)*1000)})
    completed = sum(row["status"] == "returned" for row in results)
    return {"scope": "read_only", "requested": str(request)[:300], "completed": completed,
            "total": len(results), "steps": results,
            "partial": completed != len(results), "verified": False}
