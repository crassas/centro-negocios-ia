#!/usr/bin/env python3
"""Live binary contract test against the exact Python-created SQLite schemas."""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from travis_core import RuntimeStore
from travis_brain import BrainRuntime


class NativeContractTests(unittest.TestCase):
    def setUp(self):
        self.binary = Path(os.environ["TRAVIS_RUST_BIN"]).resolve()
        self.assertTrue(self.binary.is_file(), "Compilação Rust não encontrada")
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = RuntimeStore(root / "memory.sqlite")
        self.brain = BrainRuntime(root / "brain.sqlite", self.store, cognitive=None)
        self.a = self.store.remember(
            "Pentehouse", "SENTINELA_PRIVADA_MEMORIA", "CONCEPT",
            project_id="pentehouse", source_type="explicit_user",
        )
        self.b = self.store.remember(
            "Porto", "Conhecimento geográfico testado", "FACT",
            project_id="pentehouse", source_type="explicit_user",
        )
        self.store.link_neurons(self.a, self.b, "EXTENDS", 0.7, 1.0)
        self.brain.mark("attention", "receiving", "SENTINELA_PRIVADA_EVENTO")

    def tearDown(self):
        self.brain.stop()
        self.temp.cleanup()

    def native(self, command, *flags, ok=True):
        process = subprocess.run(
            [str(self.binary), command, *map(str, flags)],
            capture_output=True, text=True, timeout=5, check=False,
        )
        self.assertEqual(process.returncode == 0, ok, process.stderr)
        return json.loads(process.stdout)

    def test_real_sqlite_graph_matches_python(self):
        native = self.native("graph", "--db", self.store.db_path, "--limit", 120)
        self.assertTrue(native["ok"])
        self.assertEqual(native["engine"], "rust")
        self.assertEqual({x["id"] for x in native["nodes"]}, {self.a, self.b})
        self.assertEqual(len(native["links"]), 1)
        self.assertNotIn("SENTINELA_PRIVADA_MEMORIA", str(native))
        with patch.dict(os.environ, {"TRAVIS_RUST_BIN": ""}):
            python_engine = self.brain.graph()
        self.assertEqual(python_engine["engine"], "python")
        self.assertEqual({x["id"] for x in python_engine["nodes"]},
                         {x["id"] for x in native["nodes"]})
        # Same data, no extra worker, no new memories created by the binary.
        with sqlite3.connect(self.store.db_path) as conn:
            self.assertEqual(conn.execute(
                "SELECT COUNT(*) FROM travis_neurons").fetchone()[0], 2)

    def test_real_events_status_and_backend_bridge(self):
        events = self.native("events", "--db", self.brain.path, "--limit", 80)
        self.assertEqual(events["events"][0]["region"], "attention")
        self.assertNotIn("SENTINELA_PRIVADA_EVENTO", str(events))
        with patch.dict(os.environ, {"TRAVIS_RUST_BIN": str(self.binary)}):
            self.assertEqual(self.brain.events()["engine"], "rust")
        with patch.dict(os.environ, {"TRAVIS_RUST_BIN": ""}):
            self.assertEqual(self.brain.events()["engine"], "python")
        status = self.native(
            "status", "--memory-db", self.store.db_path,
            "--brain-db", self.brain.path,
        )
        self.assertEqual(status["features"][0]["evidence"]["nodes"], 2)
        self.assertEqual(status["features"][0]["evidence"]["links"], 1)
        self.assertEqual(status["consciousness"], "not_established")
        with patch.dict(os.environ, {"TRAVIS_RUST_BIN": str(self.binary)}):
            self.assertEqual(self.brain.graph()["engine"], "rust")

    def test_does_not_create_missing_database(self):
        missing = Path(self.temp.name) / "missing.sqlite"
        failed = self.native("graph", "--db", missing, ok=False)
        self.assertFalse(failed["ok"])
        self.assertFalse(missing.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
