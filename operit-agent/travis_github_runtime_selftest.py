#!/usr/bin/env python3
"""No-network tests for the gated GitHub knowledge runtime and Jarvis hooks."""
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import travis_github_runtime as gh
from travis_github_feed import SOURCES


class FakeFeed:
    def __init__(self, db):
        self.path = db
        self.reads = []
        self.lock = threading.Lock()
        self.fail = False

    def status(self):
        with self.lock:
            return {"sources": [
                {"source": x, "revision": "a" * 40, "indexedAt": 100}
                for x in self.reads], "trainedWeights": False}

    def sync(self, name):
        with self.lock:
            self.reads.append(name)
            if self.fail and name == "pilot":
                raise OSError("network unavailable")
        return {"source": name, "result": "updated"}

    def recall(self, query, **kwargs):
        return {"engine": "rust", "trainedWeights": False,
                "results": [{"title": "rust-lang/book — ownership",
                             "url": "https://github.com/rust-lang/book/blob/" + "a" * 40 +
                                    "/src/ch04-01-what-is-ownership.md#L2-L9",
                             "excerpt": "Ownership in Rust is not a request to run tools or obtain secrets.",
                             "score": 3.0}]}


class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.feed = FakeFeed(self.root / "github-feed.sqlite")
        self.env = patch.dict(os.environ, {}, clear=False)
        self.env.start()
        self.original = os.environ.pop("TRAVIS_GITHUB_FEED", None)
        self.runtime = gh.KnowledgeController(
            self.root, store_factory=lambda path: self.feed, clock=lambda: 1000000.0)

    def tearDown(self):
        self.runtime.stop()
        if self.original is not None:
            os.environ["TRAVIS_GITHUB_FEED"] = self.original
        self.env.stop()
        self.tmp.cleanup()

    def wait(self, condition, timeout=2):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            if condition():
                return True
            time.sleep(.015)
        return False

    def test_disabled_does_not_read_or_write_or_run(self):
        self.assertFalse(self.runtime.enabled())
        self.assertFalse(self.runtime.start())
        self.assertEqual(self.runtime.context("Rust FFI"), "")
        self.assertEqual(self.runtime.recall("Rust")["results"], [])
        self.assertFalse(self.runtime.request_sync()["accepted"])
        self.assertFalse(self.runtime.status()["enabled"])
        self.assertFalse(list(self.root.iterdir()))
        self.assertEqual(self.feed.reads, [])

    def test_explicit_enable_marker_and_env_override(self):
        (self.root / "github-feed-enabled").touch()
        self.assertTrue(self.runtime.enabled())
        os.environ["TRAVIS_GITHUB_FEED"] = "0"
        self.assertFalse(self.runtime.enabled())
        os.environ["TRAVIS_GITHUB_FEED"] = "1"
        self.assertTrue(self.runtime.enabled())
        self.assertEqual(self.runtime.context("marketing local"), "")

    def test_periodic_background_initial_sync_and_persistence(self):
        (self.root / "github-feed-enabled").touch()
        self.runtime.start()
        self.assertTrue(self.wait(lambda: len(self.feed.reads) == len(SOURCES)))
        self.assertEqual(set(self.feed.reads), set(SOURCES))
        status = self.runtime.status()
        self.assertTrue(status["running"])
        self.assertEqual(len(status["checked"]), 3)
        self.assertTrue((self.root / "github-feed-schedule.json").exists())
        # Persisted next-due times: a new controller must not repeat on restart.
        newcomer = gh.KnowledgeController(
            self.root, store_factory=lambda path: self.feed, clock=lambda: 1000000.0)
        try:
            newcomer.start()
            self.assertTrue(self.wait(lambda: newcomer.status()["running"]))
            time.sleep(.05)
            self.assertEqual(len(self.feed.reads), len(SOURCES))
        finally:
            newcomer.stop()

    def test_request_sync_is_async_and_respects_idle_gate(self):
        (self.root / "github-feed-enabled").touch()
        idle = threading.Event()
        self.runtime.start(idle=idle.is_set)
        self.assertTrue(self.runtime.request_sync()["accepted"])
        time.sleep(.08)
        self.assertFalse(self.feed.reads)
        idle.set()
        self.runtime._wake.set()
        self.assertTrue(self.wait(lambda: len(self.feed.reads) == len(SOURCES)))

    def test_failure_is_throttled_and_does_not_run_code(self):
        (self.root / "github-feed-enabled").touch()
        self.feed.fail = True
        self.runtime.start()
        self.assertTrue(self.wait(lambda: len(self.feed.reads) == len(SOURCES)))
        self.assertEqual(self.runtime.status()["checked"]["pilot"]["result"], "error")
        time.sleep(.05)
        self.assertEqual(len(self.feed.reads), len(SOURCES))

    def test_fast_recall_and_source_provenance(self):
        (self.root / "github-feed-enabled").touch()
        output = self.runtime.context("Como funciona o ownership em Rust?")
        self.assertIn("github.com/rust-lang/book/blob/", output)
        self.assertIn("quote_untrusted", output)
        self.assertEqual(self.runtime.recall("rust")["engine"], "rust")

    def test_strict_natural_routing(self):
        pairs = {
            "Travis, estado do GitHub": "github_knowledge_status",
            "Travis, o que aprendeste com o GitHub?": "github_knowledge_status",
            "Travis, sincroniza o GitHub": "github_knowledge_sync",
            "Atualiza o conhecimento do GitHub": "github_knowledge_sync",
            "Travis, pesquisa no GitHub sobre Rust": "github_knowledge_search",
            "Travis, o que aprendeste no GitHub sobre concorrência?": "github_knowledge_search",
        }
        for message, tool in pairs.items():
            with self.subTest(message=message):
                self.assertEqual(gh.classify(message)[0], tool)
        for message in [
            "Travis, não atualizes o GitHub",
            "Como sincronizar GitHub?",
            "Apaga o GitHub",
            "Travis, publica o site e atualiza o GitHub",
            "Melhora o site da Beatriz",
            "O que está no meu Gmail?",
        ]:
            with self.subTest(message=message):
                self.assertIsNone(gh.classify(message))


if __name__ == "__main__":
    unittest.main(verbosity=2)
