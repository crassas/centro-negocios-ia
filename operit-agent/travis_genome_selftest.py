#!/usr/bin/env python3
import tempfile,unittest
from pathlib import Path
import travis_genome as g

class Tests(unittest.TestCase):
 def test_default_snapshot_and_policy(self):
  with tempfile.TemporaryDirectory() as d:
   genome=g.BehaviorGenome(Path(d));snap=genome.snapshot()
   self.assertEqual(snap["activeProfile"],"evidence-fast-v1")
   self.assertEqual(snap["genes"]["hallucination_tolerance"],0.0)
   policy=genome.inference_policy()
   self.assertLessEqual(policy["max_tokens"],384);self.assertGreaterEqual(policy["max_tokens"],160)
   self.assertIn("do not invent data",policy["systemSuffix"])

 def test_activation_is_persistent_and_reversible(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);genome=g.BehaviorGenome(root)
   self.assertEqual(genome.activate("speed-v1")["activeProfile"],"speed-v1")
   self.assertEqual(g.BehaviorGenome(root).snapshot()["activeProfile"],"speed-v1")
   genome.activate("evidence-fast-v1")
   self.assertEqual(genome.snapshot()["activeProfile"],"evidence-fast-v1")

 def test_derive_validates_genes(self):
  with tempfile.TemporaryDirectory() as d:
   genome=g.BehaviorGenome(Path(d))
   self.assertEqual(genome.derive("experiment-a",{"verbosity":0.10})["genes"]["verbosity"],0.10)
   with self.assertRaises(ValueError):genome.derive("bad",{"unknown":0.3})
   with self.assertRaises(ValueError):genome.derive("unsafe",{"hallucination_tolerance":0.1})

 def test_observations_and_comparison_need_evidence(self):
  with tempfile.TemporaryDirectory() as d:
   genome=g.BehaviorGenome(Path(d))
   for _ in range(20):genome.observe("server_status",100,"VERIFIED",True,1)
   self.assertTrue(genome.metrics("evidence-fast-v1")["eligible"])
   genome.activate("speed-v1")
   for _ in range(5):genome.observe("local_llm",50,"IMPLEMENTED_NOT_VERIFIED",True,0)
   comparison=genome.compare()
   self.assertEqual(comparison["winner"],"evidence-fast-v1")
   self.assertFalse(comparison["automaticActivation"])

 def test_corrupt_state_fails_safe(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/"behavior-genome.json").write_text("{bad",encoding="utf-8")
   snap=g.BehaviorGenome(root).snapshot()
   self.assertEqual(snap["activeProfile"],"evidence-fast-v1")
   self.assertTrue((root/"behavior-genome.invalid.json").exists())

if __name__=="__main__":unittest.main()
