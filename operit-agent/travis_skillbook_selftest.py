#!/usr/bin/env python3
"""Fast checks: advisory skill loading, evidence, grammar, no authority."""
from __future__ import annotations
import json
import tempfile
import unittest
from pathlib import Path
from travis_skillbook import SkillBook, EXPECTED_SCHEMA, DEFAULT_ROOT

class SkillBookTests(unittest.TestCase):
    def test_expected_index_and_ownership(self):
        book=SkillBook()
        status=book.status()
        self.assertTrue(status["loaded"], status["error"])
        self.assertEqual(status["schema"], EXPECTED_SCHEMA)
        self.assertEqual(status["count"],7)
        self.assertEqual(status["builtQuantum"],"10.73")
        self.assertEqual(status["driveCanonical"],"10.83 PARTIAL")
        self.assertTrue(all(row["authorityGranted"] is False for row in status["skills"]))

    def test_matching_without_imaginary_abilities(self):
        b=SkillBook()
        queries={
            "Travis, mostra um satélite no globo":"gods-eye-world",
            "Mostra uma câmara pública em Londres":"public-camera-selection",
            "Can you speak Portuguese?":"voice-vision-session",
            "Achas que tens consciência?":"neural-memory-learning",
            "Como melhorar o SEO da Pentehouse?":"microsites-operations",
            "O Quantum Unified Agent está ligado?":"quantum-governance",
            "Travis, mostra o trânsito real no Porto":"public-road-intelligence",
        }
        for question,expected in queries.items():
            found=[s["id"] for s in b.match(question,3)]
            self.assertIn(expected,found,(question,found))
            self.assertLessEqual(len(b.model_context(question)),620)
        self.assertEqual(b.match("Qual é o número 57?"),[])

    def test_untrusted_manifest_cannot_grant_authority(self):
        registry=json.loads((DEFAULT_ROOT/"registry.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory(prefix="travis-skill-test-") as dirname:
            root=Path(dirname)
            registry["skills"][0]["authority_granted"]=True
            (root/"registry.json").write_text(json.dumps(registry),encoding="utf-8")
            book=SkillBook(root)
            self.assertFalse(book.status()["loaded"])
            self.assertIn("authority",book.status()["error"])

    def test_missing_skills_fail_closed(self):
        with tempfile.TemporaryDirectory(prefix="travis-empty-skill-") as dirname:
            status=SkillBook(Path(dirname)).status()
            self.assertFalse(status["loaded"])
            self.assertEqual(status["skills"],[])

    def test_registry_does_not_execute_tools(self):
        book=SkillBook()
        for entry in book.status()["skills"]:
            self.assertIn(entry["state"],{"installed","unavailable","permission_required"})
            self.assertIsNone(entry["serviceChecked"])

if __name__=="__main__":
    unittest.main(verbosity=2)
