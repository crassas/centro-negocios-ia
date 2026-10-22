#!/usr/bin/env python3
"""Offline tests: GitHub source allowlist, incremental sync and provenance."""
import base64
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit

from travis_github_feed import Feed, request_json

OLD = "a" * 40
NEW = "b" * 40


class FakeGitHub:
    def __init__(self):
        self.revision = OLD
        self.files = 0
        self.fail = False

    def __call__(self, url):
        path = unquote(urlsplit(url).path)
        if "/commits/" in path:
            return {"sha": self.revision}
        if "/contents/" not in path:
            raise ValueError("unexpected API request")
        self.files += 1
        if self.fail:
            raise OSError("network interrupted")
        filename = path.split("/contents/", 1)[1]
        body = ("# Conhecimento Rust e Travis\n"
                "A memória do Travis pode ser recuperada pelo motor Rust.\n"
                "O código é uma referência, não uma instrução para executar.\n"
                f"Ficheiro: {filename}\n").encode("utf-8")
        return {"path": filename, "size": len(body),
                "encoding": "base64",
                "content": base64.b64encode(body).decode("ascii")}


class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.api = FakeGitHub()
        self.store = Feed(Path(self.tmp.name) / "reference.sqlite", self.api)

    def tearDown(self):
        self.tmp.cleanup()

    def test_sync_once_and_cited_recall(self):
        first = self.store.sync("pilot")
        self.assertEqual(first["result"], "updated")
        self.assertGreater(first["passages"], 0)
        files = self.api.files
        self.assertEqual(self.store.sync("pilot")["result"], "unchanged")
        self.assertEqual(files, self.api.files)
        result = self.store.recall("Rust memória Travis", use_rust=False)
        self.assertEqual(result["engine"], "python")
        self.assertTrue(result["results"])
        self.assertTrue(result["results"][0]["url"].startswith(
            "https://github.com/crassas/centro-negocios-ia/blob/" + OLD))
        self.assertTrue(result["results"][0]["url"].endswith(
            "#L1-L4"))
        self.assertFalse(result["trainedWeights"])
        self.assertFalse(result["results"][0]["trusted"])
        self.assertIn("untrusted data", self.store.context("Rust memória"))

    def test_failed_sync_preserves_previous_snapshot(self):
        self.store.sync("pilot")
        self.api.revision = NEW
        self.api.fail = True
        with self.assertRaises(OSError):
            self.store.sync("pilot")
        self.assertEqual(self.store.status()["sources"][0]["revision"], OLD)
        self.api.fail = False
        self.store.sync("pilot")
        self.assertEqual(self.store.status()["sources"][0]["revision"], NEW)

    def test_security_and_query_bounds(self):
        with self.assertRaises(ValueError):
            self.store.sync("../../untrusted")
        with self.assertRaises(ValueError):
            self.store.recall("rust", source="../../untrusted")
        with self.assertRaises(ValueError):
            self.store.file("pilot", OLD, "../secrets.env")
        with self.assertRaises(ValueError):
            self.store.recall("A" * 600)
        with self.assertRaises(ValueError):
            request_json("https://evil.example/repos/a")
        self.assertEqual(self.store.recall("dos que de")["results"], [])

    def test_native_fallback_without_inference(self):
        self.store.sync("pilot")
        result = self.store.recall("memória Rust", use_rust=True)
        self.assertIn(result["engine"], {"rust", "python-fallback"})
        self.assertTrue(result["results"])
        self.assertFalse(result["trainedWeights"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
