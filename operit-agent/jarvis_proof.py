#!/usr/bin/env python3
"""Real local model + protected executor fixture. External HTTP forbidden here."""
import json,sys,tempfile,time,subprocess
from pathlib import Path
import jarvis_local as j
import centro_server as server
original=j.http
def local_http(url,*args,**kwargs):
 if not url.startswith(("http://127.0.0.1:","http://localhost:")):raise RuntimeError("External HTTP blocked in proof")
 return original(url,*args,**kwargs)
j.http=local_http
proof={"external_http":"blocked","started_at":time.time()}
proof["inference"]=j.infer("Responde apenas LOCAL_OK")
with tempfile.TemporaryDirectory(prefix="jarvis-code-proof-") as tmp:
 root=Path(tmp)/"repo";root.mkdir()
 subprocess.run(["git","init","-q",str(root)],check=True)
 subprocess.run(["git","-C",str(root),"-c","user.name=Jarvis Test","-c","user.email=test@localhost","commit","--allow-empty","-qm","fixture"],check=True)
 worktree=Path(tmp)/"worktree"
 subprocess.run(["git","-C",str(root),"worktree","add","-qb","proof",str(worktree)],check=True)
 plan=j.plan_change("fixture","Cria note.txt com exactamente LOCAL_CODE_OK. Só uma edição create.",{"files":{},"paths":["note.txt"],"allowedPaths":["note.txt"]})
 server.apply_repo_change_plan(worktree,plan)
 assert (worktree/"note.txt").read_text().strip()=="LOCAL_CODE_OK"
 proof["code"]={"passed":True,"plan":plan,"worktree":True}
proof["voice"]=json.loads((j.ROOT/"voice-proof.json").read_text())
(j.ROOT/"acceptance-proof.json").write_text(json.dumps(proof,indent=2,ensure_ascii=False))
print(json.dumps(proof,ensure_ascii=False),flush=True)
