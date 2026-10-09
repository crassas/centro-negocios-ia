#!/usr/bin/env python3
"""Deterministic, offline scientific-contract tests, with synthetic fixtures."""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from travis_science import TravisScienceLab


class Tests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.source = self.root / "fixtures"
        self.source.mkdir()

    def lab(self, fetch=None):
        return TravisScienceLab(self.root/"state", self.source,
                                fetch=fetch or (lambda _: {"ok": True}),
                                clock=lambda: 1800000000.0)

    def schema(self):
        with sqlite3.connect(self.source/"memory.sqlite") as c:
            c.execute("CREATE TABLE travis_neurons(id TEXT PRIMARY KEY)")
            c.execute("INSERT INTO travis_neurons VALUES('node1')")
        with sqlite3.connect(self.source/"cognitive.sqlite") as c:
            c.execute("CREATE TABLE runs(id TEXT PRIMARY KEY)")
            c.execute("INSERT INTO runs VALUES('run1')")
        with sqlite3.connect(self.source/"brain.sqlite") as c:
            c.execute("CREATE TABLE brain_episodes(id TEXT PRIMARY KEY,updated REAL,task TEXT,summary TEXT,status TEXT,verified INTEGER,tool TEXT)")
            c.execute("CREATE TABLE brain_episode_scopes(id TEXT PRIMARY KEY,session TEXT,project TEXT)")
            c.execute("CREATE TABLE brain_memory_utility(id TEXT PRIMARY KEY,q REAL,samples INTEGER,updated REAL)")

    def episode(self, c, name, at, task, tool, verified=True, session="s1"):
        c.execute("INSERT INTO brain_episodes VALUES(?,?,?,?,?,?,?)",
                  (name, at, task, "TEST BODY", "completed", int(verified), tool))
        c.execute("INSERT INTO brain_episode_scopes VALUES(?,?,?)",
                  (name, session, "project"))

    def seed(self, amount):
        with sqlite3.connect(self.source/"brain.sqlite") as c:
            self.episode(c, "seed", 10, "verificar azul verde restaurante", "check")
            for i in range(amount):
                self.episode(c, f"noise{i}", 12+2*i, "intruso completamente diferente", "other", False)
                self.episode(c, f"target{i}", 13+2*i, "verificar azul verde restaurante", "check")

    def test_missing_is_inconclusive_not_verified(self):
        report = self.lab().run(include_services=False)
        self.assertEqual(report["counts"]["pass"], 0)
        self.assertEqual(report["checks"][-1]["result"], "inconclusive")

    def test_invalid_health_never_passes(self):
        report = self.lab(lambda _: {"ok": False, "status": "no"}).run()
        self.assertTrue(all(row["result"] == "fail" for row in report["checks"][:4]))

    def test_sqlite_readonly_integrity_and_counts(self):
        self.schema()
        report = self.lab().run(include_services=False)
        self.assertEqual(report["counts"]["pass"], 3)
        observed = {row["id"]: row for row in report["checks"]}
        self.assertEqual(observed["semantic_memory"]["recordCount"], 1)

    def test_small_sample_cannot_prove_improvement(self):
        self.schema()
        self.seed(3)
        result = self.lab().run(include_services=False)["checks"][-1]
        self.assertEqual(result["evaluated"], 3)
        self.assertEqual(result["result"], "inconclusive")

    def test_temporal_holdout_against_recency(self):
        self.schema()
        self.seed(25)
        result = self.lab().run(include_services=False)["checks"][-1]
        self.assertEqual(result["evaluated"], 25)
        self.assertEqual(result["retrievalTop1"], 1.0)
        self.assertEqual(result["recencyTop1"], 0.0)
        self.assertEqual(result["wins"], 25)
        self.assertEqual(result["result"], "measured")
        self.assertEqual(result["limitation"], "tool_choice_proxy_not_task_accuracy")

    def test_no_future_or_cross_session_leakage(self):
        self.schema()
        with sqlite3.connect(self.source/"brain.sqlite") as c:
            self.episode(c,"first",1,"tema tecnologia adaptativa","check",session="a")
            self.episode(c,"next",2,"tema tecnologia adaptativa","check",session="b")
        result = self.lab().run(include_services=False)["checks"][-1]
        self.assertEqual(result["evaluated"], 0)

    def test_aggregate_report_does_not_export_private_text(self):
        self.schema()
        secret = "SECRET-FIXTURE-SHOULD-NOT-APPEAR"
        with sqlite3.connect(self.source/"brain.sqlite") as c:
            self.episode(c,"only",2,secret,"check")
        lab = self.lab()
        result = lab.run(include_services=False)
        self.assertNotIn(secret, json.dumps(result))
        with lab.db() as c:
            stored = c.execute("SELECT body FROM science_reports").fetchone()[0]
        self.assertNotIn(secret, stored)

    def test_chain_persists_and_detects_tampering(self):
        lab = self.lab()
        lab.run(include_services=False)
        lab.run(include_services=False)
        recovered = self.lab()
        self.assertEqual(recovered.verify_history()["checked"], 2)
        self.assertTrue(recovered.verify_history()["ok"])
        with recovered.db() as c:
            c.execute("UPDATE science_reports SET body='{}' WHERE id=1")
        self.assertEqual(recovered.verify_history()["firstBadRecord"], 1)

    def test_errors_are_redacted_to_type(self):
        def fail(_):
            raise TimeoutError("sensitive-credential")
        report = self.lab(fail).run()
        self.assertEqual(report["checks"][0]["result"], "fail")
        self.assertNotIn("sensitive-credential", json.dumps(report))


if __name__ == "__main__":
    unittest.main(verbosity=2)
