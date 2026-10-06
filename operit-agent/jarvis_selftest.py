#!/usr/bin/env python3
"""Regression tests for routing, secret protection and local memory."""
import importlib.util, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location("jarvis",Path(__file__).with_name("jarvis_local.py"))
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.old=j.ROOT;j.ROOT=self.root
 def tearDown(self):j.ROOT=self.old;self.tmp.cleanup()
 def test_presence_without_llm(self):
  with patch.object(j,"infer",side_effect=AssertionError("LLM called")):
   for text in ["estás aí", "Jarvis, estás aí?", "Olá"]:
    self.assertEqual(j.route(text)["tool"],"presence")
 def test_shared_context_for_reasoning(self):
  with patch.object(j,"infer",return_value="Resposta") as inference:
   j.route("Analisa o meu negócio",{"projects":[{"name":"Pentehouse"}]})
   self.assertIn("Pentehouse",inference.call_args.args[0])
 def test_rules_avoid_inference(self):
  cases={"Jarvis, diz-me o estado da estação.":"system_status","O Best Pizza está online?":"site_check","Como está o Git da Pentehouse?":"git_status","Que tarefas tenho?":"task_list","Cria uma tarefa para amanhã":"create_task"}
  for text,tool in cases.items():self.assertEqual(j.classify(text)[0],tool)
  with patch.object(j,"infer",side_effect=AssertionError("LLM called")),patch.object(j,"doctor",return_value={"centro":{"ok":True},"ram_available_mb":1024}):
   self.assertEqual(j.route("Estado da estação")["tool"],"system_status")
 def test_memory_survives_connection(self):
  task=j.execute("create_task",{"title":"Rever a página amanhã"})
  self.assertEqual(j.execute("task_list",{})[0]["id"],task["id"])
  with j.database() as con:self.assertEqual(con.execute("PRAGMA integrity_check").fetchone()[0],"ok")
 def test_protected_and_symlink(self):
  for path in [".env","../../etc/passwd","/etc/passwd","keys/private.key","vault.json","sub/.git/config"]:
   with self.assertRaises(ValueError):j.safe_path("centro",path)
  with patch.object(j,"REPOS",self.root):
   repo=self.root/"centro-negocios-ia";repo.mkdir();(repo/"escape").symlink_to("/etc")
   with self.assertRaises(ValueError):j.safe_path("centro","escape/passwd")
 def test_redaction(self):
  for secret in ["Bearer abc123","token=abc123","sk-secretvalue","ghp_abc123"]:self.assertNotIn(secret,j.clean(secret))
 def test_sql_readonly(self):
  j.execute("create_task",{"title":"Teste"})
  self.assertEqual(j.execute("sqlite_query",{"query":"SELECT COUNT(*) AS n FROM tasks"})[0]["n"],1)
  for query in ["DELETE FROM tasks","DROP TABLE tasks","ATTACH DATABASE '/tmp/outside' AS other","SELECT load_extension('/tmp/x')"]:
   with self.assertRaises(Exception):j.execute("sqlite_query",{"query":query})
  self.assertEqual(len(j.execute("task_list",{})),1)
 def test_project_pause(self):
  j.execute("pause_project",{"target":"centro"})
  (j.ROOT/"planner_enabled").touch()
  with self.assertRaises(ValueError):j.execute("repo_change",{"target":"centro","prompt":"Corrige"})
 def test_unknown_tool(self):
  with self.assertRaises(ValueError):j.execute("shell",{"command":"rm -rf /"})
 def test_cloud_off(self):
  with patch.object(j,"http",side_effect=OSError("offline")):
   self.assertFalse(j.doctor()["cloud_fallback"])
if __name__=="__main__":unittest.main()
