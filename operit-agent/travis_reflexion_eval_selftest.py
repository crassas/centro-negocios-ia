import contextlib,io,json,tempfile,unittest
from pathlib import Path
from travis_reflexion_eval import metrics,run_experiment
class Tests(unittest.TestCase):
 def test_metrics_and_resume_with_controlled_fixture(self):
  # This oracle tests the evaluator, not a real model or improvement claim.
  def oracle(items,condition,kernel):
   rows=kernel.recall('fixture',items[0]['family']) if condition=='B' else []
   return {x['id']:{'a':x['expected'] if rows else None,'c':0.8} for x in items},'unit-fixture',0,[r['id'] for r in rows]
  with tempfile.TemporaryDirectory() as d,contextlib.redirect_stdout(io.StringIO()):
   root=Path(d);rows=[];s=run_experiment(root,1,rows,oracle)
   self.assertEqual(len(rows),210);self.assertEqual(s['A']['accuracy'],0)
   self.assertEqual(s['B']['second_success_after_failure'],1)
   self.assertEqual(s['B']['repeated_error_rate'],0)
   self.assertEqual(s['B-erased']['accuracy'],0)
   self.assertAlmostEqual(s['A']['brier'],0.64)
   self.assertAlmostEqual(s['B']['brier'],0.34)
   self.assertFalse(s['improvement_proven'])
   def unexpected(*args):raise AssertionError('Completed batch was repeated')
   loaded=json.loads((root/'results.json').read_text());again=run_experiment(root,1,loaded,unexpected)
   self.assertEqual(s,again)
 def test_unreported_confidence_is_not_fabricated(self):
  row={'rep':0,'id':'case','session':0,'correct':False,'confidence':None,'outside':True}
  m=metrics([row]);self.assertIsNone(m['brier']);self.assertEqual(m['confidence_coverage'],0)
if __name__=='__main__':unittest.main()
