import json,sqlite3,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import jarvis_local as j
import travis_core as t

class ProjectStatusTests(unittest.TestCase):
 def test_natural_language_routes(self):
  for text in ("Travis, tudo bem com os projetos?","Como estão os projectos?","Estado dos projetos","Tudo em ordem com os nossos projetos?"):
   self.assertEqual(t.classify_local_intent(text)[0],"projects_status",text)
  self.assertEqual(t.classify_local_intent("Como está a Beatriz?","beatriz"),("projects_status",{"target":"beatriz"}))
  for text in ("Corrige os projetos","Como criar projetos?","Tudo bem com os projetos? Apaga os ficheiros"):
   self.assertNotEqual(t.classify_local_intent(text)[0],"projects_status")
 def test_real_readonly_snapshot(self):
  with tempfile.TemporaryDirectory() as tmp:
   home=Path(tmp);db=home/".centro-server/negocio.db";db.parent.mkdir()
   with sqlite3.connect(db) as c:
    c.executescript("CREATE TABLE sites(id INTEGER,name TEXT,status TEXT,repo TEXT); CREATE TABLE tasks(site_id INTEGER,status TEXT);")
    c.execute("INSERT INTO sites VALUES(1,'Beatriz','Activo','https://github.com/crassas/engomadoria-beatriz')")
    c.execute("INSERT INTO tasks VALUES(1,'Bloqueada')")
   before=db.read_bytes()
   def cmd(args,cwd,timeout):
    if str(cwd).endswith("best-pizza-kebab"):raise RuntimeError("missing")
    return " M index.html\n" if str(cwd).endswith("engomadoria-beatriz") else ""
   with patch.object(Path,"home",return_value=home),patch.object(j,"command",side_effect=cmd),patch.object(j,"infer",side_effect=AssertionError("Status must not invoke LLM")),patch.object(j,"ROOT",home/"memory"),patch.object(j,"TRAVIS_STORE",t.RuntimeStore(home/"runtime.db")),patch.object(j,"TRAVIS_UTEF",t.UnifiedExecutionFramework(t.RuntimeStore(home/"runtime.db"))):
    result=j.route("Travis, tudo bem com os projetos?",{"large":"x"*9000})
    self.assertTrue(result["ok"])
    self.assertEqual(result["tool"],"projects_status")
    self.assertIn("repositório indisponível",result["reply"])
    self.assertIn("1 bloqueada",result["reply"])
    self.assertEqual(j.projects_status("beatriz")["business"]["tasks"],{"Bloqueada":1})
   self.assertEqual(before,db.read_bytes())
 def test_missing_db_not_invented(self):
  with tempfile.TemporaryDirectory() as tmp,patch.object(Path,"home",return_value=Path(tmp)),patch.object(j,"command",side_effect=RuntimeError("missing")):
   result=j.projects_status()
   self.assertFalse(result["business"]["available"])
   self.assertFalse((Path(tmp)/".centro-server").exists())
 def test_chat_budget(self):
  calls=[]
  def http(url,payload=None,timeout=5):
   calls.append((url,timeout))
   return {"choices":[{"message":{"content":"Olá."}}]} if payload else {"status":"ok"}
  with patch.object(j,"http",side_effect=http),patch.object(j,"event"):
   self.assertEqual(j.infer("Olá"),"Olá.")
  self.assertEqual(calls[-1][1],45)
if __name__=="__main__":unittest.main()
