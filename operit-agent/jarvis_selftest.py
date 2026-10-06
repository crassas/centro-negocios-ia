#!/usr/bin/env python3
"""Regression tests for routing, secret protection and local memory."""
import importlib.util, json, tempfile, unittest, threading, http.client
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location("jarvis",Path(__file__).with_name("jarvis_local.py"))
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.old=j.ROOT;self.old_store=j.TRAVIS_STORE;self.old_utef=j.TRAVIS_UTEF;self.old_seed=j.NEURAL_SEEDED;j.ROOT=self.root
  j.TRAVIS_STORE=j.travis_core.RuntimeStore(self.root/"memory.sqlite");j.TRAVIS_UTEF=j.travis_core.UnifiedExecutionFramework(j.TRAVIS_STORE);j.NEURAL_SEEDED=False
 def tearDown(self):
  j.ROOT=self.old;j.TRAVIS_STORE=self.old_store;j.TRAVIS_UTEF=self.old_utef;j.NEURAL_SEEDED=self.old_seed;self.tmp.cleanup()
 def test_presence_without_llm(self):
  with patch.object(j,"infer",side_effect=AssertionError("LLM called")):
   for text in ["estás aí", "Travis, estás aí?", "Travis: olá", "Jarvis, estás aí?", "Olá"]:
    self.assertEqual(j.route(text)["tool"],"presence")
 def test_youtube_is_a_direct_action(self):
  with patch.object(j,"infer",side_effect=AssertionError("LLM called")):
   for text in ["consegues abrir o YouTube", "Travis, abre o YouTube", "podes abrir YouTube?"]:
    reply=j.route(text)
    self.assertEqual(reply["tool"],"open_youtube")
    self.assertEqual(reply["result"]["url"],"https://www.youtube.com/")
  self.assertEqual(j.classify("não abrir o YouTube")[0],"local_llm")
 def test_chat_timeout_does_not_restart_model(self):
  with patch.object(j,"http",side_effect=[{"status":"ok"},TimeoutError()]) as http,patch.object(j,"llm_start",side_effect=AssertionError("restart")):
   with self.assertRaisesRegex(RuntimeError,"prazo"):j.infer("pedido")
   self.assertEqual(http.call_args.kwargs["timeout"],20)
 def test_shared_context_for_reasoning(self):
  with patch.object(j,"infer",return_value="Resposta") as inference:
   j.route("Analisa o meu negócio",{"projects":[{"name":"Pentehouse"}]})
   self.assertIn("Pentehouse",inference.call_args.args[0])
 def test_repository_access_is_verified_without_inference(self):
  with patch.object(j,"infer",side_effect=AssertionError("LLM called")),patch.object(j,"command",return_value="true"):
   reply=j.route("Já tens acesso aos repositórios das páginas internas?")
   self.assertEqual(reply["tool"],"repo_access")
   self.assertIn("pentehouse",reply["reply"])
   self.assertIn("exige verificar",reply["reply"])
  with patch.object(j,"command",side_effect=OSError("missing")):
   self.assertIn("Não consegui confirmar nenhum",j.execute("repo_access",{}))
 def test_rules_avoid_inference(self):
  cases={"Jarvis, diz-me o estado da estação.":"system_status","O Best Pizza está online?":"site_check","Como está o Git da Pentehouse?":"git_status","Que tarefas tenho?":"task_list","Cria uma tarefa para amanhã":"create_task"}
  for text,tool in cases.items():self.assertEqual(j.classify(text)[0],tool)
  for text,tool in cases.items():self.assertEqual(j.classify("Travis, "+text)[0],tool)
  with patch.object(j,"infer",side_effect=AssertionError("LLM called")),patch.object(j,"doctor",return_value={"centro":{"ok":True},"ram_available_mb":1024}):
   self.assertEqual(j.route("Estado da estação")["tool"],"system_status")
 def test_neural_memory_assists_reasoning(self):
  saved=j.route("Travis, lembra-te que a Beatriz entrega em até 72 horas")
  self.assertEqual(saved["tool"],"note_fact");self.assertTrue(saved["result"]["neuronId"].startswith("neuron-"))
  status=j.route("Estado dos neurónios");self.assertGreaterEqual(status["result"]["neurons"],6)
  with patch.object(j,"infer",return_value="Resposta") as inference:
   j.route("Qual é o prazo de entrega da Beatriz?")
   prompt=inference.call_args.args[0]
   self.assertIn("Memória semântica local confirmada",prompt);self.assertIn("72 horas",prompt)
  recalled=j.route("Procura na memória sobre a Beatriz");self.assertEqual(recalled["tool"],"neural_recall");self.assertTrue(recalled["result"])
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
 def test_voice_worker_reuse_and_cleanup(self):
  binary=self.root/"bin"/"piper";binary.parent.mkdir()
  binary.write_text("#!/usr/bin/env python3\nimport json,sys,wave\nfor line in sys.stdin:\n d=json.loads(line)\n with wave.open(d['output_file'],'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050);w.writeframes(b'\\0'*440)\n print(d['output_file'],flush=True)\n")
  binary.chmod(0o755);worker=j.VoiceWorker("tts")
  try:
   with patch.object(j,"TTS_WORKER",worker):
    first=j.speak("Primeira resposta");pid=worker.process.pid
    second=j.speak("Segunda resposta")
    self.assertEqual(pid,worker.process.pid)
    self.assertTrue(first.startswith(b"RIFF"));self.assertTrue(second.startswith(b"RIFF"))
   process=worker.process;worker.stop();self.assertIsNotNone(process.poll())
  finally:worker.stop()
 def test_transcription_endpoint_returns_before_reasoning(self):
  server=j.ThreadingHTTPServer(("127.0.0.1",0),j.Handler)
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  connection=http.client.HTTPConnection("127.0.0.1",server.server_port,timeout=3)
  try:
   with patch.object(j,"transcribe",return_value="estás aí?") as transcription,patch.object(j,"route",side_effect=AssertionError("reasoning during transcription")):
    connection.request("POST","/transcribe",body=b"audio",headers={"Host":"127.0.0.1:8770","X-Jarvis-Key":j.KEY,"Content-Type":"audio/webm"})
    response=connection.getresponse();self.assertEqual(response.status,200)
    self.assertEqual(json.loads(response.read()),{"ok":True,"text":"estás aí?"});transcription.assert_called_once_with(b"audio")
  finally:connection.close();server.shutdown();server.server_close();thread.join()
 def test_unknown_tool(self):
  with self.assertRaises(ValueError):j.execute("shell",{"command":"rm -rf /"})
 def test_cloud_off(self):
  with patch.object(j,"http",side_effect=OSError("offline")):
   self.assertFalse(j.doctor()["cloud_fallback"])
if __name__=="__main__":unittest.main()
