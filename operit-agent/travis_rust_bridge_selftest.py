#!/usr/bin/env python3
"""Contract tests for the optional Rust -> Python -> existing web UI bridge."""
import json
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from travis_core import RuntimeStore
from travis_brain import BrainRuntime
from travis_rust_bridge import graph_snapshot


VALID = {
    "ok": True, "source": "local-sqlite", "kind": "persisted-memory-graph",
    "engine": "rust", "nodes": [{"id": "n1", "title": "Memória"}],
    "links": [], "observedAt": 2000000000, "truncated": False,
}


class RustBridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.binary = Path(self.tmp.name) / "travis-core"
        self.binary.write_text("#!/bin/sh\nexit 0\n")
        self.binary.chmod(0o700)
        self.settings = patch.dict(os.environ, {"TRAVIS_RUST_BIN": str(self.binary)})
        self.settings.start()

    def tearDown(self):
        self.settings.stop()
        self.tmp.cleanup()

    def test_valid_snapshot(self):
        with patch("travis_rust_bridge.subprocess.run", return_value=SimpleNamespace(
            returncode=0, stdout=json.dumps(VALID))):
            self.assertEqual(graph_snapshot("memory.sqlite", 120), VALID)

    def test_reject_unpersisted_edge_and_private_summary(self):
        forged = {**VALID, "links": [{"source": "n1", "target": "missing", "provenance": "persisted-synapse"}]}
        with patch("travis_rust_bridge.subprocess.run", return_value=SimpleNamespace(
            returncode=0, stdout=json.dumps(forged))):
            self.assertIsNone(graph_snapshot("memory.sqlite"))
        leaked = {**VALID, "nodes": [{"id": "n1", "title": "Memória", "summary": "segredo"}]}
        with patch("travis_rust_bridge.subprocess.run", return_value=SimpleNamespace(
            returncode=0, stdout=json.dumps(leaked))):
            self.assertIsNone(graph_snapshot("memory.sqlite"))

    def test_timeout_does_not_trigger_second_mutation(self):
        with patch("travis_rust_bridge.subprocess.run", side_effect=__import__("subprocess").TimeoutExpired("rust", 1.5)):
            self.assertIsNone(graph_snapshot("memory.sqlite"))

    def test_existing_brain_uses_rust_or_falls_back(self):
        memory = RuntimeStore(Path(self.tmp.name) / "memory.sqlite")
        brain = BrainRuntime(Path(self.tmp.name) / "brain.sqlite", memory, cognitive=None)
        try:
            with patch("travis_rust_bridge.subprocess.run", return_value=SimpleNamespace(
                returncode=0, stdout=json.dumps(VALID))):
                self.assertEqual(brain.graph()["engine"], "rust")
            with patch("travis_rust_bridge.subprocess.run", return_value=SimpleNamespace(
                returncode=1, stdout="")):
                snapshot = brain.graph()
                self.assertEqual(snapshot["engine"], "python-fallback")
                self.assertEqual(snapshot["source"], "local-sqlite")
                self.assertEqual(snapshot["nodes"], [])
        finally:
            brain.stop()


if __name__ == "__main__":
    unittest.main(verbosity=2)
