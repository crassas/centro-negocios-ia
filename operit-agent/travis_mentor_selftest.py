#!/usr/bin/env python3
"""Offline/fixture checks for Travis Mentor Transfer. No paid services."""
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

import travis_core
import travis_mentor as mentor


class MentorshipTests(unittest.TestCase):
    def test_manifest_is_versioned_and_detects_tampering(self):
        package = mentor.manifest()
        self.assertTrue(mentor.validate_manifest(package))
        self.assertGreaterEqual(len(package["lessons"]), 14)
        package["lessons"][0]["title"] = "forged"
        with self.assertRaises(ValueError):
            mentor.validate_manifest(package)

    def test_unique_lesson_ids_and_concrete_verification(self):
        ids = [row["id"] for row in mentor.LESSONS]
        self.assertEqual(len(ids),len(set(ids)))
        for row in mentor.LESSONS:
            self.assertTrue(row["objective"])
            self.assertGreaterEqual(len(row["procedure"]), 4)
            self.assertTrue(row["check"])
            self.assertTrue(row["failure"])

    def test_retrieval_is_relevant_and_bounded(self):
        context = mentor.mentor_context("Quero testar a veracidade de um experimento falsificável", 840)
        self.assertIn("Hipóteses",context)
        self.assertLessEqual(len(context),840)
        self.assertIn("NÃO memória autobiográfica",context)
        seo = mentor.mentor_context("O SEO local e a Search Console precisam de prova", 900)
        self.assertIn("SEO",seo)
        self.assertNotIn("qualquer ferramenta está ativa",seo)
        unrelated = mentor.mentor_context("uma pergunta sem qualquer palavra específica",300)
        self.assertLessEqual(len(unrelated),300)

    def test_read_only_registry_is_not_execution_authorization(self):
        reg = {"capabilities":[
            {"id":"read_status","action_type":"READ","mutation":False},
            {"id":"repo_change","action_type":"REPO_CHANGE","mutation":True},
        ]}
        self.assertEqual(mentor.decision_contract("O que fazer?","",reg)["gate"],"planning_only")
        self.assertEqual(mentor.decision_contract("Status","read_status",reg)["gate"],"requires_live_preflight")
        self.assertEqual(mentor.decision_contract("Mudar","repo_change",reg)["gate"],"requires_task_authorization")
        self.assertEqual(mentor.decision_contract("Mudar","repo_change",reg,authorized=True)["gate"],"requires_live_preflight")
        self.assertEqual(mentor.decision_contract("Mudar","unregistered",reg,authorized=True)["gate"],"blocked_unregistered")

    def test_seed_does_not_replace_preexisting_memory_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = travis_core.RuntimeStore(root/"memory.sqlite")
            original = store.remember("Cliente confirmou pedido", "Não apagar", "FACT",
                                      ["cliente"],"centro",3,"explicit_user",confidence=1)
            health = store.health()
            self.assertTrue(health["ok"])
            one = mentor.seed_runtime(store)
            self.assertEqual(one["inserted"],len(mentor.LESSONS))
            self.assertEqual(one["newLinks"],len(mentor.LESSONS))
            second = mentor.seed_runtime(store)
            self.assertEqual(second["inserted"],0)
            self.assertEqual(second["existing"],len(mentor.LESSONS))
            self.assertEqual(second["newLinks"],0)
            with sqlite3.connect(root/"memory.sqlite") as db:
                preserved = db.execute("SELECT summary,source_type FROM travis_neurons WHERE id=?",(original,)).fetchone()
                self.assertEqual(preserved,("Não apagar","explicit_user"))
                imported = db.execute("SELECT count(*) FROM travis_neurons WHERE title LIKE 'MENTOR / %'").fetchone()[0]
                self.assertEqual(imported,len(mentor.LESSONS)+1)
                self.assertEqual(db.execute("SELECT count(*) FROM travis_synapses WHERE active=1").fetchone()[0],len(mentor.LESSONS))
                types = {r[0] for r in db.execute("SELECT DISTINCT source_type FROM travis_neurons WHERE title LIKE 'MENTOR / %'")}
                self.assertEqual(types,{"system_config"})
            self.assertFalse(mentor.status(store)["internalGPTWeightsCopied"])
            self.assertFalse(mentor.status(store)["TravisExperienceForged"])

    def test_export_privacy_and_permissions(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp)/"mentor.json"
            out = mentor.export(dest)
            data = json.loads(dest.read_text(encoding="utf-8"))
            self.assertTrue(mentor.validate_manifest(data))
            self.assertEqual(out["sha256"],data["sha256"])
            self.assertEqual(dest.stat().st_mode&0o777,0o600)
            serialized = dest.read_text(encoding="utf-8").lower()
            self.assertNotIn("api_key", serialized)
            self.assertNotIn("bearer ", serialized)
            self.assertNotIn("diagnóstico clínico",serialized)
            self.assertNotIn("palavra-passe:",serialized)

    def test_no_false_claims_of_neural_transplant(self):
        self.assertIn("não é uma cópia",mentor.SOURCE_NOTE)
        self.assertEqual(mentor.ORIGIN,"assistant_authored_methodology")
        self.assertEqual(mentor.SCOPE,"technical_procedures_only")
        self.assertNotIn("consciente",mentor.mentor_context("Qual é o modelo usado?",250).lower().split("objetivo")[0])

    def test_ability_inventory_separates_history_from_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"capabilities-and-limits.json"
            path.write_text(json.dumps({"capabilities":[
                {"task_type":"read_status","last_verdict":"success",
                 "last_scope":"process_exit","successes":4,"failures":1,"unknowns":2}
            ]}),encoding="utf-8")
            catalog=mentor.capability_inventory({"capabilities":[
                {"id":"read_status","owner":"travis","action_type":"READ","mutation":False},
                {"id":"repo_change","owner":"travis","action_type":"REPO_CHANGE","mutation":True}
            ]},tmp)
            self.assertEqual(catalog["registered"],2)
            self.assertEqual(catalog["observedSuccessTools"],1)
            self.assertEqual(catalog["registeredOnly"],1)
            by_id={entry["id"]:entry for entry in catalog["capabilities"]}
            self.assertEqual(by_id["repo_change"]["lastObservedState"],"registered_only")
            self.assertEqual(by_id["read_status"]["lastObservedState"],"observed_tool_success")
            self.assertIn("not current authorization",catalog["warning"])

    def test_status_does_not_call_any_external_service(self):
        status = mentor.status(None,{"capabilities":[{"id":"x"}]})
        self.assertEqual(status["registeredTools"],1)
        self.assertEqual(status["abilityVerification"],"not_implied_by_registry")
        self.assertIsNone(status["storedMentorNodes"])

if __name__=="__main__":
    unittest.main(verbosity=2)
