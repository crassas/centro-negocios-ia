#!/usr/bin/env python3
"""Unit tests for the optional Travis tool hub. No external CLI required."""
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import travis_toolhub as hub

class ToolHubTests(unittest.TestCase):
    def test_new_tools_phrase(self):
        self.assertEqual(hub.classify("Travis, mostra as ferramentas externas"),
                         ("toolhub_status", {}))

    def test_named_status(self):
        self.assertEqual(hub.classify("Travis, verifica o OpenResearch"),
                         ("toolhub_status", {"tool": "openresearch"}))

    def test_git_checkpoints(self):
        tool, args = hub.classify("Atlas, mostra os checkpoints da Pentehouse")
        self.assertEqual(tool, "toolhub_action")
        self.assertEqual(args, {"tool": "atlas", "operation": "history", "project": "pentehouse"})

    def test_explicit_readonly_commands(self):
        self.assertEqual(hub.classify("Mostra as sessões do Pi"),
                         ("toolhub_action", {"tool": "pi", "operation": "sessions"}))
        self.assertEqual(hub.classify("Quais os projetos OpenResearch?"),
                         ("toolhub_action", {"tool": "openresearch", "operation": "projects"}))

    def test_unrelated_request_not_intercepted(self):
        self.assertIsNone(hub.classify("Publica o site da engomadoria"))

    def test_atlas_never_reported_installed(self):
        atlas = hub.snapshot("atlas")["tools"][0]
        self.assertFalse(atlas["installed"])
        self.assertFalse(atlas["verified"])

    def test_no_paid_calls_or_simulations(self):
        with patch.object(hub, "_status", return_value={"id": "pi", "installed": False, "verified": False}):
            snap = hub.snapshot("pi")
        self.assertFalse(snap["paidCallsEnabled"])
        self.assertFalse(snap["automaticSimulationsEnabled"])

    def test_unsafe_operation_refused(self):
        with self.assertRaises(ValueError):
            hub.perform({"tool": "pi", "operation": "execute-arbitrary-shell"})

    def test_repo_path_restricted(self):
        with self.assertRaises(ValueError):
            hub.perform({"tool": "atlas", "operation": "history", "project": "../../etc"})

    def test_reply(self):
        out = hub.reply({"action": "toolhub_status", "tools": [
            {"id": "pi", "label": "Pi", "installed": True, "verified": True}
        ]}, "pt")
        self.assertIn("Pi: verificado", out)

if __name__ == "__main__":
    unittest.main()
