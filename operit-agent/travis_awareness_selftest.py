"""Operational awareness: observed capability report, not simulated consciousness."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import travis_awareness as awareness
import travis_dialogue


class AwarenessTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        root=Path(self.temp.name)
        self.ui=root/"ui";self.ui.mkdir()
        self.models=root/"models";self.models.mkdir()
        self.repos=root/"repos";self.repos.mkdir()
        self.registry={"capabilities":[{"id":"web_research"},{"id":"web_read"},{"id":"repo_change"}]}
        self.brain=SimpleNamespace(status=lambda:{
            "automatic":True,"phase":"resting","counts":{"episodes":7,"cycles":3},
            "learning":{"algorithm":"episodic-utility-v1","observedRuns":4,"feedbackEvents":2}
        })
        self.store=SimpleNamespace(health=lambda:{"ok":True,"neurons":6,"synapses":5})
        self.args=dict(registry=self.registry,brain=self.brain,store=self.store,
                       ui_root=self.ui,model_root=self.models,repo_root=self.repos,
                       projects={"centro":"centro-negocios-ia"},
                       gmail={"configured":False,"authorized":False},
                       quantum={"ok":False},check=lambda url:False,clock=lambda:2000000000)
    def tearDown(self):self.temp.cleanup()
    def test_missing_resources_never_claimed_online(self):
        result=awareness.build(**self.args)
        states={f["id"]:f["state"] for f in result["features"]}
        self.assertEqual(result["registeredTools"],3)
        self.assertEqual(result["consciousness"],"not_established")
        self.assertEqual(result["memory"]["synapses"],5)
        self.assertEqual(states["local_model"],"unavailable")
        self.assertEqual(states["particle_brain"],"unavailable")
        self.assertEqual(states["vision"],"unavailable")
        self.assertEqual(states["gmail"],"requires_configuration")
        self.assertEqual(states["web"],"registered")
        self.assertNotIn("private-secret",str(result))

    def test_present_source_is_only_installed_not_a_runtime_proof(self):
        for name,token in [
            ("travis-3d.mjs","createNeuralField createTravisVision"),
            ("travis-brain-view.mjs","createKnowledgeGraph uDissolve"),
            ("travis-knowledge-graph.mjs","local-sqlite"),
            ("travis-brain-panel.mjs","fetch('/brain/graph'"),
            ("travis-vision.mjs","mediaDevices"),
            ("travis-vision-policy.mjs","policy")]:
            (self.ui/name).write_text(token)
        (self.models/"tts").mkdir()
        (self.models/"stt").mkdir()
        for name in ["pt_PT-tugao-medium.onnx","en_GB-northern_english_male-medium.onnx"]:
            (self.models/"tts"/name).write_bytes(b"fixture")
        (self.models/"stt/ggml-base.bin").write_bytes(b"fixture")
        (self.repos/"centro-negocios-ia").mkdir()
        self.args.update(check=lambda _:True,gmail={"configured":True,"authorized":True},quantum={"ok":True})
        result=awareness.build(**self.args)
        states={f["id"]:f["state"] for f in result["features"]}
        self.assertEqual(states["particle_brain"],"installed_unverified")
        self.assertEqual(states["vision"],"permission_required")
        self.assertEqual(states["voice"],"installed_unverified")
        self.assertEqual(states["local_model"],"verified")
        self.assertEqual(states["gmail"],"authorization_saved")
        self.assertEqual(states["quantum"],"verified")
        pt=awareness.reply(result,"pt")
        en=awareness.reply(result,"en")
        # Stable factual invariants, independent of the dialogue wording.
        self.assertEqual(result["memory"]["neurons"],6)
        self.assertEqual(result["memory"]["synapses"],5)
        self.assertIn("6",pt)
        self.assertIn("5",pt)
        self.assertIn("6",en)
        self.assertIn("5",en)
        self.assertEqual(travis_dialogue.portuguese_reply("capabilities_status",result,""),pt)

    def test_awareness_prompt_is_limited_and_truthful(self):
        observed=awareness.build(**self.args)
        model=awareness.model_facts(observed)
        # Runtime data must be reflected without fabricating capabilities.
        self.assertEqual(observed["registeredTools"],3)
        self.assertEqual(observed["memory"]["neurons"],6)
        self.assertEqual(observed["memory"]["synapses"],5)
        self.assertEqual(observed["consciousness"],"not_established")
        self.assertIn("6",model)
        self.assertIn("5",model)
        self.assertIn("unavailable",model.lower())
        self.assertNotIn("Successfully deployed",model)

if __name__=="__main__":unittest.main(verbosity=2)
