#!/usr/bin/env python3
import tempfile,unittest
from pathlib import Path
import travis_core as t

class Tests(unittest.TestCase):
 def test_registry(self):
  s=t.registry_snapshot();self.assertTrue(s["localFirst"]);self.assertFalse(s["paidFallback"])
  required={"presence","stop","system_status","repo_access","site_check","git_status","git_diff","create_task","task_list","laya_status","laya_decide","local_llm","repo_change","server_status","station_status","station_doctor","agents_status","autonomy_selftest","fault_timeout","fault_laya_recovery","git_pull","git_access_matrix","jarvis_query","claude_query","manus_status","manus_query"}
  self.assertTrue(required.issubset(t.CAPABILITIES))
 def test_contracts(self):
  c=t.RuntimeContext.create(source="test",project_id="centro");e=t.EventEnvelope.create("TEST",c,priority="HIGH");self.assertEqual(e.correlation_id,c.correlation_id)
  a=t.ActionRequest.create(c,"READ",{"path":"README.md"});self.assertEqual(a.correlation_id,c.correlation_id)
  with self.assertRaises(ValueError):t.EventEnvelope.create("BAD",c,priority="INVALID")
  with self.assertRaises(ValueError):t.ActionRequest.create(c,"SHELL")
 def test_router(self):
  self.assertEqual(t.classify_local_intent("Travis, estás aí?")[0],"presence")
  self.assertEqual(t.classify_local_intent("Jarvis, para")[0],"stop")
  self.assertEqual(t.classify_local_intent("Como está o Git da Pentehouse?","pentehouse")[0],"git_status")
  self.assertEqual(t.classify_local_intent("A Pentehouse está online?","pentehouse")[0],"site_check")
  self.assertEqual(t.classify_local_intent("O Centro está online?","centro")[0],"local_llm")
  self.assertEqual(t.classify_local_intent("Corrige o hero","pentehouse")[0],"repo_change")
 def test_validation(self):
  t.validate_centro_task({"action":"server_status","target":"local","args":{}},["server_status","repo_change"],["centro-negocios-ia"])
  with self.assertRaises(ValueError):t.validate_centro_task({"action":"shell","args":{}},["server_status"],[])
  with self.assertRaises(ValueError):t.validate_centro_task({"action":"repo_change","target":"other","args":{}},["repo_change"],["centro-negocios-ia"])
 def test_graph_privacy_and_truth(self):
  with tempfile.TemporaryDirectory() as d:
   s=t.RuntimeStore(Path(d)/"runtime.sqlite");u=t.UnifiedExecutionFramework(s);c=t.RuntimeContext.create(source="test",project_id="centro")
   o=u.execute("local_llm",{"text":"texto privado token=abc123"},lambda:"ok",c);self.assertEqual(o["completionStatus"],"IMPLEMENTED_NOT_VERIFIED");self.assertTrue(s.health()["ok"])
   with s.connect() as con:rows="\n".join(r[0] for r in con.execute("SELECT data FROM travis_entities"))
   self.assertNotIn("texto privado",rows);self.assertNotIn("abc123",rows);self.assertIn("parameterKeys",rows)
   bad=u.execute("server_status",{},lambda:{"exitCode":67},t.RuntimeContext.create(source="test"));self.assertEqual(bad["completionStatus"],"PARTIALLY_IMPLEMENTED")
 def test_exception_event(self):
  with tempfile.TemporaryDirectory() as d:
   s=t.RuntimeStore(Path(d)/"runtime.sqlite");u=t.UnifiedExecutionFramework(s)
   with self.assertRaises(RuntimeError):u.execute("system_status",{},lambda:(_ for _ in ()).throw(RuntimeError("boom")),t.RuntimeContext.create(source="test"))
   with s.connect() as con:self.assertIn("TOOL_EXECUTION_FAILED",[r[0] for r in con.execute("SELECT event_type FROM travis_events")])
if __name__=="__main__":unittest.main()
