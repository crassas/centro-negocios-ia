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

# Checkpoints contain bounded summaries, never raw tool payloads or vault contents.
import contextlib
import fcntl
import json
import os
import sqlite3
import threading
import uuid
from pathlib import Path


class DurableWorkflows:
    """Resume only requested, allowlisted read-only checks; never infer new permissions."""
    def __init__(self, path, clock=time.time):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.clock = clock
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread = None
        self.last_error = ''
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, created REAL NOT NULL, updated REAL NOT NULL, state TEXT NOT NULL, request TEXT NOT NULL, plan TEXT NOT NULL, results TEXT NOT NULL)')
        os.chmod(self.path, 0o600)

    @contextlib.contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def validate(steps):
        if not isinstance(steps, list) or not 2 <= len(steps) <= MAX_STEPS:
            raise ValueError('Workflow requires 2 to 5 approved read-only steps')
        for row in steps:
            if not isinstance(row, dict) or row.get('tool') not in SAFE_TOOLS or row.get('args') != {}:
                raise ValueError('Unapproved workflow capability or arguments')
            if not isinstance(row.get('title', row['tool']), str):
                raise ValueError('Invalid title')
        return [{'tool': row['tool'], 'args': {}, 'title': row.get('title', row['tool'])[:80]} for row in steps]

    def submit(self, request, steps):
        steps = self.validate(steps)
        ident = uuid.uuid4().hex
        now = self.clock()
        with self.db() as db:
            # A bounded queue and history avoid accumulating an endless task backlog.
            db.execute("DELETE FROM workflows WHERE state IN ('complete','expired') AND id NOT IN (SELECT id FROM workflows WHERE state IN ('complete','expired') ORDER BY updated DESC LIMIT 100)")
            if db.execute("SELECT COUNT(*) FROM workflows WHERE state IN ('queued','running')").fetchone()[0] >= 16:
                raise ValueError('Workflow queue is full')
            db.execute('INSERT INTO workflows VALUES(?,?,?,?,?,?,?)', (ident, now, now, 'queued', str(request)[:300], json.dumps(steps), '[]'))
        return ident

    def result(self, ident):
        with self.db() as db:
            row = db.execute('SELECT * FROM workflows WHERE id=?', (ident,)).fetchone()
        if row is None:
            raise ValueError('Unknown workflow')
        results = json.loads(row['results'])
        total = len(json.loads(row['plan']))
        completed = sum(x['status'] == 'returned' for x in results)
        return {'id': ident, 'scope': 'read_only', 'requested': row['request'], 'state': row['state'],
                'completed': completed, 'total': total, 'steps': results,
                'partial': completed != total, 'verified': False}

    def advance(self, ident, execute, should_yield=lambda: False):
        if not self.lock.acquire(blocking=False):
            return self.result(ident)
        try:
            with self.path.with_suffix('.lock').open('a') as lease:
                os.chmod(lease.name, 0o600)
                try:
                    fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    return self.result(ident)
                with self.db() as db:
                    row = db.execute('SELECT * FROM workflows WHERE id=?', (ident,)).fetchone()
                if row is None:
                    raise ValueError('Unknown workflow')
                if row['state'] not in ('queued', 'running'):
                    return self.result(ident)
                if self.clock() - row['created'] > 86400:
                    with self.db() as db:
                        db.execute("UPDATE workflows SET state='expired',updated=? WHERE id=?", (self.clock(), ident))
                    return self.result(ident)
                steps = self.validate(json.loads(row['plan']))
                results = json.loads(row['results'])
                for step in steps[len(results):]:
                    if self.stop_event.is_set() or should_yield():
                        with self.db() as db:
                            db.execute("UPDATE workflows SET state='queued',updated=? WHERE id=?", (self.clock(), ident))
                        return self.result(ident)
                    with self.db() as db:
                        db.execute("UPDATE workflows SET state='running',updated=? WHERE id=?", (self.clock(), ident))
                    start = time.monotonic()
                    try:
                        detail = summarize(step['tool'], execute(step['tool'], {}))[:300]
                        status = 'returned'
                    except Exception as exc:
                        # Do not persist exception messages containing private data or credentials.
                        detail, status = type(exc).__name__, 'failed'
                    results.append({**{k:step[k] for k in ('tool','title')}, 'status': status,
                                    'detail': detail, 'durationMs': int((time.monotonic()-start)*1000),
                                    'observedAt': self.clock()})
                    with self.db() as db:
                        db.execute('UPDATE workflows SET results=?,updated=? WHERE id=?', (json.dumps(results), self.clock(), ident))
                with self.db() as db:
                    db.execute("UPDATE workflows SET state='complete',updated=? WHERE id=?", (self.clock(), ident))
                return self.result(ident)
        finally:
            self.lock.release()

    def run(self, request, steps, execute):
        return self.advance(self.submit(request, steps), execute)

    def resume_one(self, execute, should_yield=lambda: False):
        if should_yield() or self.stop_event.is_set():
            return None
        with self.db() as db:
            row = db.execute("SELECT id FROM workflows WHERE state IN ('queued','running') ORDER BY created LIMIT 1").fetchone()
        return self.advance(row['id'], execute, should_yield) if row else None

    def status(self):
        with self.db() as db:
            counts = {row['state']:row['n'] for row in db.execute('SELECT state,COUNT(*) n FROM workflows GROUP BY state')}
        return {'policy': 'requested-read-only-checkpoints', 'states': counts,
                'runnerAlive': bool(self.thread and self.thread.is_alive()), 'lastError': self.last_error,
                'maxPending': 16, 'retainedCompleted': 101, 'expirySeconds': 86400,
                'automaticWriteReplay': False, 'requiresObsidianOpen': False}

    def start(self, execute, should_yield, interval=5):
        if self.thread and self.thread.is_alive():
            return
        self.stop_event.clear()
        def loop():
            while not self.stop_event.wait(interval):
                try:
                    self.resume_one(execute, should_yield)
                    self.last_error = ''
                except Exception as exc:
                    self.last_error = type(exc).__name__
        self.thread = threading.Thread(target=loop, name='travis-workflow-resume', daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=1)
