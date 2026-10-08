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

if __name__=='__main__':unittest.main(verbosity=2)
