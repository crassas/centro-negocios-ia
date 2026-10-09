#!/usr/bin/env python3
"""Travis Science Lab: measurable local observations; no consciousness claims.

Read-only evaluation of local state. Reports contain aggregate metrics, not
private memory, text or credentials. This is not a general intelligence test.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
import sqlite3
import time
import unicodedata
import urllib.request
from contextlib import closing
from pathlib import Path

VERSION = 1
HEALTH_URLS = {
    "centro": "http://127.0.0.1:8765/health",
    "travis_router": "http://127.0.0.1:8770/health",
    "local_llm": "http://127.0.0.1:8771/health",
    "laya": "http://127.0.0.1:18790/health",
}
DB_TABLES = {
    "semantic_memory": ("memory.sqlite", "travis_neurons"),
    "episodic_memory": ("brain.sqlite", "brain_episodes"),
    "execution_history": ("cognitive.sqlite", "runs"),
}
STOP = set("para como sobre uma uns umas que dos das com sem the and for from with this that user travis project projecto repositorio".split())


def terms(value):
    normalized = "".join(c for c in unicodedata.normalize("NFD", str(value).lower())
                         if not unicodedata.combining(c))
    return set(re.findall(r"[a-z0-9]{3,}", normalized)) - STOP


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def fetch_health(url):
    # Only fixed local URLs; never fetch an untrusted user-supplied address.
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=0.8) as response:
        raw = response.read(4097)
    if len(raw) > 4096:
        raise ValueError("oversized_health_response")
    return json.loads(raw)


def read_only(path):
    return sqlite3.connect(Path(path).absolute().as_uri() + "?mode=ro", uri=True, timeout=1)


class TravisScienceLab:
    def __init__(self, state_dir, source_dir=None, fetch=None, clock=None):
        self.state_dir = Path(state_dir)
        self.source_dir = Path(source_dir or state_dir)
        self.fetch = fetch or fetch_health
        self.clock = clock or time.time
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.state_dir / "travis-science.sqlite"
        with self.db() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS science_reports(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created REAL NOT NULL, body TEXT NOT NULL,
                previous_hash TEXT NOT NULL, record_hash TEXT NOT NULL)""")
        self.db_path.chmod(0o600)

    def db(self):
        return sqlite3.connect(self.db_path, timeout=5)

    def service(self, name, url):
        started = time.monotonic()
        try:
            health = self.fetch(url)
            ok = isinstance(health, dict) and (
                health.get("ok") is True or health.get("status") == "ok")
            result = "pass" if ok else "fail"
            evidence = "health_json_ok" if ok else "health_not_ok"
        except (OSError, TimeoutError, ValueError, TypeError) as exc:
            result, evidence = "fail", "health_check_" + type(exc).__name__
        return {"id": name, "result": result, "evidence": evidence,
                "latencyMs": round((time.monotonic() - started) * 1000)}

    def database(self, name, filename, table):
        path = self.source_dir / filename
        if not path.is_file():
            return {"id": name, "result": "inconclusive", "evidence": "database_missing"}
        try:
            with closing(read_only(path)) as connection:
                integrity = connection.execute("PRAGMA quick_check").fetchone()[0]
                if integrity != "ok":
                    return {"id": name, "result": "fail", "evidence": "sqlite_integrity_failed"}
                count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            return {"id": name, "result": "pass",
                    "evidence": "sqlite_readonly_integrity_ok", "recordCount": int(count)}
        except sqlite3.Error as exc:
            return {"id": name, "result": "inconclusive",
                    "evidence": "sqlite_" + type(exc).__name__}

    def retrieval_comparison(self):
        """Temporal holdout vs recency; tool agreement is only a proxy."""
        path = self.source_dir / "brain.sqlite"
        if not path.is_file():
            return {"id": "episodic_retrieval_proxy", "result": "inconclusive",
                    "evidence": "brain_database_missing", "evaluated": 0}
        try:
            with closing(read_only(path)) as connection:
                connection.row_factory = sqlite3.Row
                records = [dict(row) for row in connection.execute("""
                    SELECT e.id,e.updated,e.task,e.tool,e.verified,
                        COALESCE(s.session,'') AS session,
                        COALESCE(s.project,'') AS project,
                        COALESCE(u.q,0.5) AS utility
                    FROM brain_episodes e
                    LEFT JOIN brain_episode_scopes s ON e.id=s.id
                    LEFT JOIN brain_memory_utility u ON e.id=u.id
                    ORDER BY e.updated DESC LIMIT 400
                """)]
        except sqlite3.Error as exc:
            return {"id": "episodic_retrieval_proxy", "result": "inconclusive",
                    "evidence": "sqlite_" + type(exc).__name__, "evaluated": 0}
        records.sort(key=lambda row: (float(row["updated"] or 0), row["id"]))
        previous = []
        samples = retrieval_hits = recency_hits = wins = losses = ties = 0
        for current in records:
            scope = current["session"], current["project"]
            candidates = [row for row in previous
                          if (row["session"], row["project"]) == scope and row["tool"]]
            previous.append(current)  # Prevents look-ahead and self-retrieval.
            if not current["verified"] or not current["tool"] or not candidates:
                continue
            wanted = terms(current["task"])
            if not wanted:
                continue
            ranked = []
            for candidate in candidates:
                have = terms(candidate["task"])
                overlap = len(wanted & have)
                if overlap < 2 or not have:
                    continue
                relevance = overlap / math.sqrt(len(wanted) * len(have))
                age = max(0, float(current["updated"]) - float(candidate["updated"]))
                freshness = math.exp(-age / (30 * 86400))
                score = 0.60 * relevance + 0.35 * float(candidate["utility"]) + 0.05 * freshness
                ranked.append((score, candidate))
            if not ranked:
                continue
            closest = max(ranked, key=lambda pair: pair[0])[1]
            latest = candidates[-1]
            a, b = closest["tool"] == current["tool"], latest["tool"] == current["tool"]
            samples += 1
            retrieval_hits += int(a)
            recency_hits += int(b)
            wins += int(a and not b)
            losses += int(b and not a)
            ties += int(a == b)
        return {"id": "episodic_retrieval_proxy",
                "result": "measured" if samples >= 20 else "inconclusive",
                "evidence": "temporal_holdout_prior_episode_tool_agreement",
                "evaluated": samples, "minSamples": 20,
                "retrievalTop1": round(retrieval_hits/samples, 4) if samples else None,
                "recencyTop1": round(recency_hits/samples, 4) if samples else None,
                "delta": round((retrieval_hits-recency_hits)/samples, 4) if samples else None,
                "wins": wins, "losses": losses, "ties": ties,
                "limitation": "tool_choice_proxy_not_task_accuracy"}

    def run(self, include_services=True):
        checks = []
        if include_services:
            checks.extend(self.service(k, url) for k, url in HEALTH_URLS.items())
        checks.extend(self.database(k, *v) for k, v in DB_TABLES.items())
        checks.append(self.retrieval_comparison())
        counts = {result: sum(x["result"] == result for x in checks)
                  for result in ("pass", "fail", "measured", "inconclusive")}
        report = {
            "version": VERSION,
            "observedAt": dt.datetime.fromtimestamp(self.clock(), dt.timezone.utc).isoformat(),
            "hypothesis": "Observed capabilities and retrieved experiences are empirically testable",
            "method": "localhost_health+sqlite_readonly+temporal_holdout",
            "checks": checks, "counts": counts,
            "limits": ["not_a_consciousness_test", "not_a_model_intelligence_benchmark",
                       "service_health_not_end_to_end", "retrieval_proxy_not_accuracy",
                       "no_private_content_in_report"],
        }
        self.append(report)
        return report

    def append(self, report):
        body = canonical(report)
        with self.db() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT record_hash FROM science_reports ORDER BY id DESC LIMIT 1").fetchone()
            previous = row[0] if row else "GENESIS"
            digest = hashlib.sha256((previous + "\n" + body).encode()).hexdigest()
            connection.execute(
                "INSERT INTO science_reports(created,body,previous_hash,record_hash) VALUES(?,?,?,?)",
                (self.clock(), body, previous, digest))

    def verify_history(self):
        with self.db() as connection:
            rows = connection.execute(
                "SELECT body,previous_hash,record_hash FROM science_reports ORDER BY id").fetchall()
        previous = "GENESIS"
        for index, (body, claimed_previous, claimed_hash) in enumerate(rows, 1):
            expected = hashlib.sha256((previous + "\n" + body).encode()).hexdigest()
            if claimed_previous != previous or claimed_hash != expected:
                return {"ok": False, "checked": index-1, "firstBadRecord": index}
            previous = expected
        return {"ok": True, "checked": len(rows),
                "limitation": "local_hash_chain_not_external_authentication"}


def main():
    parser = argparse.ArgumentParser(description="Travis Science Laboratory")
    parser.add_argument("action", choices=("run", "verify"))
    parser.add_argument("--state-dir", type=Path, default=Path.home()/".centro-jarvis")
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--no-services", action="store_true")
    args = parser.parse_args()
    lab = TravisScienceLab(args.state_dir, args.source_dir)
    output = lab.run(not args.no_services) if args.action == "run" else lab.verify_history()
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
