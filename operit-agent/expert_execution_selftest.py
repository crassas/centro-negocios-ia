"""Exercise expert routing and local-only commits in a real, isolated Git fixture."""
import subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import centro_server as server

class ExpertExecutionTests(unittest.TestCase):
 def test_expert_executor_bypasses_phone_planner_and_never_pushes_local_only(self):
  with tempfile.TemporaryDirectory(prefix="travis-expert-policy-") as tmp:
   base=Path(tmp);repo=base/"repo";repo.mkdir();home=base/"home"
   flag=home/".centro-jarvis/planner_enabled";flag.parent.mkdir(parents=True);flag.touch()
   def git(*args):
    return subprocess.run(["git","-C",str(repo),*args],check=True,capture_output=True,text=True).stdout.strip()
   git("init","-q");git("config","user.name","Fixture");git("config","user.email","fixture@local")
   (repo/"README.md").write_text("Fixture\n");git("add","README.md");git("commit","-qm","fixture")
   git("update-ref","refs/remotes/origin/main","HEAD")
   calls=[]
   def network_command(args,**kwargs):
    calls.append(args)
    if "push" in args:raise AssertionError("localOnly attempted publication")
    if args[:2]==["git","fetch"]:return {"exitCode":0,"stdout":"","stderr":""}
    return server.run_cmd(args,**{k:v for k,v in kwargs.items() if k not in {"attempts","delay"}})
   def expert(worktree,prompt):
    self.assertTrue((worktree/".git").is_file(),"expert must use an isolated worktree")
    (worktree/"TRAVIS_TEST.md").write_text("Expert fixture passed\n")
    return "Expert executor fixture"
   with patch.object(server,"HOME",home),patch.object(server,"WORKTREE_ROOT",base/"worktrees"),patch.object(server,"ensure_repo",return_value=(repo,None)),patch.object(server,"repo_origin_ok",return_value=True),patch.object(server,"run_cmd_retry",side_effect=network_command),patch.object(server,"report_task_progress"),patch.object(server,"request_repo_change_plan",side_effect=AssertionError("phone planner called")),patch.object(server,"run_claude_repo_executor",side_effect=expert):
    result=server.action_repo_change({"id":"expert-fixture","action":"repo_change","target":"centro-negocios-ia","args":{"prompt":"Create fixture document","executor":"expert","localOnly":True,"allowedPaths":["TRAVIS_TEST.md"]}})
   self.assertEqual(result["exitCode"],0,result)
   self.assertIn("ALTERAÇÃO VALIDADA LOCALMENTE",result["stdout"])
   self.assertIn("Publicação: não solicitada",result["stdout"])
   self.assertFalse((repo/"TRAVIS_TEST.md").exists(),"operator checkout was modified")
   self.assertIn("centro/telegram-",git("branch","--list"))
   self.assertFalse(any("push" in args for args in calls))

if __name__=="__main__":unittest.main()
