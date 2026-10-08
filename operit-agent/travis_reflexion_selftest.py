import tempfile,unittest
from pathlib import Path
from travis_reflexion import Reflexion,verify
from travis_cognitive import CognitiveKernel
class Tests(unittest.TestCase):
 def test_external_only(self):
  self.assertEqual(verify('local_llm',{'answer':'Done','confidence':1,'sources':[{'url':'https://example.org'}]})['verdict'],'unknown')
  self.assertEqual(verify('local_llm',{'exitCode':0})['verdict'],'unknown')
  self.assertEqual(verify('command',{'exitCode':7})['verdict'],'failure')
  self.assertEqual(verify('gmail',{'requiresConnection':True})['verdict'],'failure')
 def test_restart_dedup_relevance_and_ablation(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'cognitive.sqlite';k=Reflexion(p)
   for _ in range(2):k.observe('read customer report','web_read',verify('web_read',error=TimeoutError()))
   k=Reflexion(p);rows=k.recall('read customer report again','web_read');self.assertEqual(len(rows),1);self.assertEqual(rows[0]['occurrences'],2)
   self.assertEqual(k.recall('compute orbit','math'),[]);self.assertTrue(k.start_session()['recentLessons'])
   self.assertTrue((Path(d)/'capabilities-and-limits.json').is_file())
   with k.db() as c:c.execute('DELETE FROM failure_lessons')
   self.assertEqual(k.recall('read customer report','web_read'),[])
 def test_no_false_success_learning(self):
  with tempfile.TemporaryDirectory() as d:
   k=CognitiveKernel(Path(d)/'cognitive.sqlite');r=k.begin('check source');k.add_step(r,'web_read',{},'ok',10,1,'some source')
   k.finish(r,False,False,verification='unknown');self.assertEqual(k.run(r)['status'],'unverified');self.assertFalse(k.recall('check source'))
 def test_max_three_and_confidence(self):
  with tempfile.TemporaryDirectory() as d:
   k=Reflexion(Path(d)/'c.sqlite')
   for i in range(5):k.observe('task','tool',{'verdict':'failure','scope':'unit','code':str(i),'cause':'Error','correction':'Check input'})
   self.assertEqual(len(k.recall('task','tool',50)),3)
   with self.assertRaises(ValueError):k.observe('task','tool',verify('tool'),confidence=2)
if __name__=='__main__':unittest.main()
