#!/usr/bin/env python3
"""Travis's opt-in GitHub knowledge runtime: one bounded background reader.

Remote source text is reference DATA, never instructions or executable code.
The authoritative Travis conversation, memory and tools remain unchanged.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import unicodedata
from pathlib import Path

from travis_github_feed import Feed, SOURCES

INTERVAL_SECONDS = 12 * 60 * 60
RETRY_SECONDS = 60 * 60
POLL_SECONDS = 25
TECH_TERMS = frozenset({
    "rust", "cargo", "pyo3", "wasm", "webassembly", "ownership",
    "borrow", "borrowing", "memory", "memoria", "concorrencia", "concurrency",
    "kernel", "github", "repositorio", "repository", "compilacao", "compilar",
    "native", "nativo", "ffi",
})


def _norm(value: str) -> str:
    value = "".join(ch for ch in unicodedata.normalize("NFD", str(value).lower())
                    if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", value).strip()


def classify(text: str):
    """Recognize only explicit GitHub reference requests (not repository edits)."""
    t = _norm(text)
    t = re.sub(r"^(?:(?:ola|oi|olha|travis|jarvis|por favor|please)[ ,:;.!?-]+)+", "", t)
    t = re.sub(r"^(?:podes|consegues|could you|can you)\s+", "", t)
    t = t.strip(" ?!.,;:")
    target = r"(?:github|git hub|fontes (?:do |de )?github|biblioteca (?:do |de )?github|conhecimento (?:do |de )?github)"
    if re.fullmatch(r"(?:estado|status|mostra(?: o)? estado|verifica(?: o)? estado)(?: (?:do|da|das|de))? " + target, t):
        return "github_knowledge_status", {}
    if re.fullmatch(r"(?:o que (?:ja )?aprendeste (?:com|no) (?:o )?github|what have you learned (?:from|on) github)", t):
        return "github_knowledge_status", {}
    if re.fullmatch(r"(?:sincroniza|atualiza|actualiza|refresh|sync|update)(?: (?:a|o|as|os|the|my))? " + target, t):
        return "github_knowledge_sync", {}
    match = re.fullmatch(
        r"(?:pesquisa|procura|consulta|search|find)(?: (?:no|na|on|em|in))? "
        r"(?:o )?(?:github|git hub)(?: (?:sobre|por|about|for))? (.{3,220})", t)
    if match:
        return "github_knowledge_search", {"query": match.group(1)}
    match = re.fullmatch(
        r"(?:o que (?:ja )?aprendeste (?:com|no) (?:o )?github sobre|"
        r"what have you learned (?:from|on) github about) (.{3,220})", t)
    if match:
        return "github_knowledge_search", {"query": match.group(1)}
    return None


class KnowledgeController:
    def __init__(self, root=None, *, store_factory=Feed, clock=time.time):
        self.root = Path(root or (Path.home() / ".centro-jarvis"))
        self.store_factory = store_factory
        self.clock = clock
        self._store = None
        self._lock = threading.RLock()
        self._worker = None
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._force = set()
        self._idle = lambda: True
        self._busy = False
        self._last_error = ""
        self._last_source = ""
        self._last_result = ""
        self._scheduling_file = self.root / "github-feed-schedule.json"
        self._checked = None

    def enabled(self):
        setting = os.environ.get("TRAVIS_GITHUB_FEED")
        if setting is not None:
            return setting.strip().lower() in {"1", "true", "on", "yes"}
        return (self.root / "github-feed-enabled").is_file()

    def _feed(self):
        if self._store is None:
            self._store = self.store_factory(self.root / "github-feed.sqlite")
        return self._store

    def _checked_state(self):
        if self._checked is None:
            try:
                saved = json.loads(self._scheduling_file.read_text(encoding="utf-8"))
                if not isinstance(saved, dict):
                    raise ValueError("invalid feed state")
                self._checked = {name: {"lastAttempt": max(0.0, float(v.get("lastAttempt", 0))),
                                        "result": str(v.get("result", ""))[:80]}
                                 for name, v in saved.items() if name in SOURCES and isinstance(v, dict)}
            except (OSError, ValueError, TypeError, OverflowError):
                self._checked = {}
        return self._checked

    def _save_checked(self):
        self.root.mkdir(parents=True, exist_ok=True)
        path = self._scheduling_file
        tmp = path.with_name(path.name + ".tmp")
        with tmp.open("w", encoding="utf-8") as output:
            json.dump(self._checked, output, ensure_ascii=False)
        tmp.chmod(0o600)
        tmp.replace(path)

    def status(self):
        # No network activity or database creation while disabled.
        if not self.enabled():
            return {"enabled": False, "running": False, "sources": [],
                    "trainedWeights": False, "readOnly": True}
        with self._lock:
            info = self._feed().status()
            return {"enabled": True, "running": bool(self._worker and self._worker.is_alive()),
                    "busy": self._busy, "lastSource": self._last_source,
                    "lastResult": self._last_result, "lastErrorType": self._last_error,
                    "checked": dict(self._checked_state()), "sources": info["sources"],
                    "trainedWeights": False, "readOnly": True}

    def start(self, idle=None):
        if not self.enabled():
            return False
        with self._lock:
            if idle is not None:
                self._idle = idle
            if self._worker and self._worker.is_alive():
                return True
            self._stop.clear()
            self._worker = threading.Thread(target=self._loop, name="travis-github-feed",
                                            daemon=True)
            self._worker.start()
            return True

    def stop(self):
        self._stop.set()
        self._wake.set()
        thread = self._worker
        if thread and thread.is_alive() and threading.current_thread() is not thread:
            thread.join(timeout=2)

    def request_sync(self):
        if not self.enabled():
            return {"accepted": False, "reason": "github-feed-disabled", "readOnly": True}
        if not self.start():
            return {"accepted": False, "reason": "github-feed-unavailable", "readOnly": True}
        with self._lock:
            self._force.update(SOURCES)
        self._wake.set()
        return {"accepted": True, "queuedSources": list(SOURCES), "readOnly": True,
                "notice": "Reading public approved GitHub files in the background"}

    def _loop(self):
        while not self._stop.is_set():
            if not self.enabled():
                self._wake.wait(timeout=POLL_SECONDS)
                self._wake.clear()
                continue
            idle = False
            try:
                idle = bool(self._idle())
            except Exception:
                idle = False
            if idle:
                with self._lock:
                    last = dict(self._checked_state())
                    forced = set(self._force)
                now = self.clock()
                due = next((name for name in SOURCES
                            if name in forced or now - float(last.get(name, {}).get("lastAttempt", 0)) >=
                            (RETRY_SECONDS if last.get(name, {}).get("result") == "error" else INTERVAL_SECONDS)), None)
                if due:
                    with self._lock:
                        self._force.discard(due)
                        self._busy = True
                        self._last_source = due
                    try:
                        response = self._feed().sync(due)
                        verdict = response.get("result", "unknown")
                        error_type = ""
                    except Exception as exc:
                        verdict = "error"
                        error_type = type(exc).__name__
                    with self._lock:
                        self._checked_state()[due] = {"lastAttempt": self.clock(), "result": verdict}
                        try:
                            self._save_checked()
                        except OSError:
                            pass
                        self._last_result = verdict
                        self._last_error = error_type
                        self._busy = False
            self._wake.wait(timeout=POLL_SECONDS)
            self._wake.clear()

    def recall(self, query: str, *, limit=4):
        if not self.enabled():
            return {"enabled": False, "engine": "none", "results": [],
                    "trainedWeights": False}
        result = self._feed().recall(query, limit=limit, use_rust=True)
        return {"enabled": True, **result}

    def context(self, query: str):
        """Local-only retrieval; never blocks a spoken reply on GitHub networking."""
        if not self.enabled() or len(query) > 500:
            return ""
        tokens = set(re.findall(r"[a-z0-9]+", _norm(query)))
        if not tokens.intersection(TECH_TERMS):
            return ""
        try:
            sources = self.recall(query, limit=2)["results"]
        except (OSError, ValueError, RuntimeError):
            return ""
        pieces = []
        for row in sources[:2]:
            excerpt = re.sub(r"[\x00-\x08\x0b-\x1f]", " ", row["excerpt"])[:260]
            pieces.append(json.dumps({
                "source": row["url"], "quote_untrusted": excerpt,
            }, ensure_ascii=False))
        return "\n".join(pieces)
