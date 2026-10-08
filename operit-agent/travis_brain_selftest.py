import tempfile,time,unittest,json
from pathlib import Path
from travis_brain import BrainRuntime
from travis_core import RuntimeStore
from travis_cognitive import CognitiveKernel

class BrainTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.now=[1800000000.]
  self.store=RuntimeStore(self.root/'memory.sqlite');self.cog=CognitiveKernel(self.root/'cognitive.sqlite')
  self.a=self.store.remember('Pentehouse serviço local','Cortes de cabelo no Porto','FACT',['porto','cabelo'],'pentehouse')
  self.b=self.store.remember('Pentehouse agenda','Agenda de cortes de cabelo Porto','FACT',['porto','cabelo'],'pentehouse')
  rid=self.cog.begin('Verificar Pentehouse cortes cabelo',{'tool':'site_check'})
  self.cog.add_step(rid,'site_check',{},'unknown');self.cog.finish(rid,False,False,'Resultado ainda por verificar',verification='unknown')
  self.brain=BrainRuntime(self.root/'brain.sqlite',self.store,self.cog,clock=lambda:self.now[0],resources=lambda:{'memoryMB':1500,'diskMB':500})
 def tearDown(self):self.brain.stop();self.tmp.cleanup()
 def idle(self):self.now[0]+=181
 def test_no_cycle_while_user_active(self):
  self.idle()
  with self.brain.request('Teste'):self.assertFalse(self.brain.cycle()['ran'])
 def test_automatic_cycle_keeps_hypotheses_separate(self):
  before=self.store.health();self.idle();result=self.brain.cycle();self.assertTrue(result['ran'])
  self.assertEqual(len(self.brain.status()['journal']),2);self.assertEqual(before['neurons'],self.store.health()['neurons'])
  self.assertEqual(before['synapses'],self.store.health()['synapses'])
  self.assertTrue(all(x['epistemic'] in {'hypothesis_not_memory','reflection_not_fact'} for x in self.brain.status()['journal']))
  self.assertEqual(result['associations'],1)
 def test_interval_prevents_repeat(self):
  self.idle();self.assertTrue(self.brain.cycle()['ran']);self.assertFalse(self.brain.cycle()['ran'])
 def test_pause_persists(self):
  self.brain.pause(True);self.idle();self.assertFalse(self.brain.cycle()['ran'])
  second=BrainRuntime(self.brain.path,self.store,self.cog,clock=lambda:self.now[0]);self.assertTrue(second.paused())
 def test_resource_guard(self):
  self.brain.resources=lambda:{'memoryMB':50,'diskMB':500};self.idle();self.assertFalse(self.brain.cycle()['ran'])
 def test_conversation_interrupts_imagination(self):
  def generate(prompt,cancelled):
   with self.brain.request('Voltei'):pass
   return 'Não publicar esta simulação interrompida'
  self.brain.generator=generate;self.idle();self.assertTrue(self.brain.cycle()['interrupted'])
  self.assertEqual(self.brain.status()['journal'],[])
 def test_unknown_outcome_not_promoted_by_recall(self):
  self.idle();self.brain.cycle();context=self.brain.recall_context('Pentehouse cortes cabelo')
  self.assertIn('"verified": false',context);self.assertNotIn('hypothesis_not_memory',context)
 def test_model_failure_does_not_stop_cycle(self):
  def failed(*args):raise TimeoutError()
  self.brain.generator=failed;self.idle();self.assertTrue(self.brain.cycle()['ran'])
  self.assertIn('modelNote',self.brain.status()['journal'][0]['body'])
 def test_scheduler_runs_without_request(self):
  self.idle();self.brain.start(tick_seconds=.02)
  deadline=time.monotonic()+2
  while time.monotonic()<deadline and not self.brain.status()['counts']['cycles']:time.sleep(.02)
  self.assertEqual(self.brain.status()['counts']['cycles'],1);self.assertTrue(self.brain.status()['automatic'])
 def test_daily_limit(self):
  self.brain.daily_limit=1;self.idle();self.brain.cycle();self.now[0]+=1801
  self.assertFalse(self.brain.cycle()['ran'])
 def test_generated_hypotheses_remain_only_in_journal(self):
  self.brain.generator=lambda *args:json.dumps({'dream':'Uma biblioteca flutuante resolve o pedido.', 'reflection':'Será a lembrança uma forma de prova?'})
  self.idle();self.assertTrue(self.brain.cycle()['ran'])
  entries=self.brain.status()['journal'];self.assertTrue(all(x['body']['generatedBy']=='local-model-draft' for x in entries))
  self.assertNotIn('biblioteca',self.brain.recall_context('Pentehouse cortes cabelo'))
  self.assertEqual(self.store.health()['neurons'],2)
 def test_philosophy_changes_across_cycles(self):
  self.idle();self.brain.cycle();first=self.brain.status()['journal'][0]['title'];self.now[0]+=1801
  self.brain.cycle();self.assertNotEqual(first,self.brain.status()['journal'][0]['title'])
 def test_control_type_validation(self):
  with self.assertRaises(ValueError):self.brain.pause('false')
 def episode(self,text='orbital calibration alpha',session='session-one',project='',verdict='unknown',used=()):
  rid=self.cog.begin(text,{'tool':'local_llm','session':session,'project':project})
  self.cog.finish(rid,verdict=='success',verdict=='success','observation',verification=verdict)
  self.brain.record_outcome(rid,{'verdict':verdict},used,session,project)
  return rid
 def test_learned_utility_changes_ranking_and_survives_restart(self):
  a=self.episode();b=self.episode('orbital calibration beta')
  self.brain.feedback(a,'session-one',False);self.brain.feedback(b,'session-one',True)
  rows=[json.loads(r) for r in self.brain.recall_context('orbital calibration',session='session-one').splitlines()]
  self.assertEqual(rows[0]['source'],b);self.assertEqual(rows[0]['utility'],0.6)
  second=BrainRuntime(self.brain.path,self.store,self.cog,clock=lambda:self.now[0])
  self.assertEqual(json.loads(second.recall_context('orbital calibration',1,session='session-one'))['source'],b)
 def test_unknown_is_stored_without_positive_reward(self):
  self.episode()
  self.assertEqual(self.brain.status()['learning']['feedbackEvents'],0)
  self.assertFalse(json.loads(self.brain.recall_context('orbital calibration',1,session='session-one'))['verified'])
 def test_duplicate_feedback_does_not_reinforce_twice(self):
  rid=self.episode();self.brain.feedback(rid,'session-one',False)
  self.assertTrue(self.brain.feedback(rid,'session-one',False)['duplicate'])
  with self.assertRaises(ValueError):self.brain.feedback(rid,'session-one',True)
  with self.brain.db() as c:self.assertEqual(c.execute('SELECT samples FROM brain_memory_utility WHERE id=?',(rid,)).fetchone()[0],1)
 def test_foreign_session_and_project_are_not_recalled_or_rewarded(self):
  rid=self.episode(project='pentehouse')
  self.assertEqual(self.brain.recall_context('orbital calibration',session='other',project='pentehouse'),'')
  self.assertEqual(self.brain.recall_context('orbital calibration',session='session-one',project='beatriz'),'')
  with self.assertRaises(ValueError):self.brain.feedback(rid,'other',True)
  second=self.episode(session='other',verdict='success',used=[rid])
  with self.brain.db() as c:self.assertEqual(c.execute('SELECT used_ids FROM brain_learning_usage WHERE run_id=?',(second,)).fetchone()[0],'[]')
 def test_verifier_feedback_credits_only_actual_sources(self):
  used=self.episode();unused=self.episode('orbital calibration beta')
  self.episode('orbital calibration repeated',verdict='failure',used=[used])
  with self.brain.db() as c:
   self.assertAlmostEqual(c.execute('SELECT q FROM brain_memory_utility WHERE id=?',(used,)).fetchone()[0],0.4)
   self.assertIsNone(c.execute('SELECT q FROM brain_memory_utility WHERE id=?',(unused,)).fetchone())
 def test_migration_backup_contains_previous_episodes(self):
  import sqlite3
  rid=self.episode()
  second=BrainRuntime(self.brain.path,self.store,self.cog,clock=lambda:self.now[0])
  backup=self.brain.path.with_suffix('.pre-learning-v1.sqlite')
  self.assertTrue(backup.exists())
  c=sqlite3.connect(backup)
  try:self.assertIsNotNone(c.execute('SELECT id FROM brain_episodes WHERE id=?',(rid,)).fetchone())
  finally:c.close()
 def test_consolidation_preserves_learned_utility(self):
  rid=self.episode();self.brain.feedback(rid,'session-one',False)
  self.idle();self.brain.cycle()
  row=json.loads(self.brain.recall_context('orbital calibration',1,session='session-one'))
  self.assertEqual(row['utility'],0.4)

if __name__=='__main__':unittest.main(verbosity=2)
