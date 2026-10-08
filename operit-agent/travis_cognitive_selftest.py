#!/usr/bin/env python3
import tempfile,unittest
from pathlib import Path
import travis_cognitive as c

class Tests(unittest.TestCase):
 def test_successful_run_becomes_reusable_lesson(self):
  with tempfile.TemporaryDirectory() as d:
   k=c.CognitiveKernel(Path(d)/"cognitive.sqlite")
   run=k.begin("research latest Puppeteer version")
   k.add_step(run,"web_research",{"query":"Puppeteer latest version"},"verified",420,2,"Version found")
   result=k.finish(run,True,True,"25.12.0")
   self.assertTrue(result["success"]);self.assertTrue(result["verified"])
   lessons=k.recall("find current Puppeteer version",5)
   self.assertTrue(lessons);self.assertIn("web_research",lessons[0]["strategy"])
   self.assertTrue(lessons[0]["verified"])

 def test_failure_penalises_matching_strategy(self):
  with tempfile.TemporaryDirectory() as d:
   k=c.CognitiveKernel(Path(d)/"cognitive.sqlite")
   good=k.begin("check example site")
   k.add_step(good,"web_read",{"url":"https://example.com"},"ok",100,0,"ok")
   k.finish(good,True,False,"done")
   before=k.recall("check example site",1)[0]["score"]
   bad=k.begin("check example site")
   k.add_step(bad,"web_read",{},"failed",50,0,"Timeout")
   k.finish(bad,False,False,failure="Timeout")
   after=k.recall("check example site",1)[0]["score"]
   self.assertLess(after,before)

 def test_context_contains_only_relevant_lessons(self):
  with tempfile.TemporaryDirectory() as d:
   k=c.CognitiveKernel(Path(d)/"cognitive.sqlite")
   run=k.begin("research barber SEO ranking")
   k.add_step(run,"search_positions",{"target":"pentehouse"},"verified",80,1,"observed")
   k.finish(run,True,True,"done")
   self.assertIn("search_positions",k.planning_context("barber SEO ranking"))
   self.assertEqual(k.planning_context("unrelated astronomy"),"")

 def test_health_and_consolidation(self):
  with tempfile.TemporaryDirectory() as d:
   k=c.CognitiveKernel(Path(d)/"cognitive.sqlite")
   self.assertTrue(k.health()["ok"])
   self.assertEqual(k.consolidate()["after"],0)

if __name__=="__main__":unittest.main()
