"""Deterministic tests for the fast speech backend without live services."""
import ast,io,json,os,struct,tempfile,time,wave,types
from pathlib import Path

source=Path(__file__).with_name("jarvis_local.py").read_text()
tree=ast.parse(source)
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=="transcribe"]
assert len(nodes)==1
events=[]
class Worker:
 def __init__(self,name,path):
  self.name=name;self.model=Path(path);self.calls=[]
 def request(self,payload):
  self.calls.append(payload)
  with wave.open(str(payload["path"]),"rb") as w:
   assert w.getnchannels()==1 and w.getframerate()==16000
  return "TRAVIS_STT:"+json.dumps({"text":self.name})
with tempfile.TemporaryDirectory() as root:
 root=Path(root)
 (root/"venv/bin").mkdir(parents=True)
 (root/"venv/bin/python").write_text("")
 (root/"models/tiny.gguf").parent.mkdir()
 (root/"models/tiny.gguf").write_text("")
 fast=Worker("FAST_ENG",root/"models/tiny.gguf")
 precise=Worker("PRECISE_PT",root/"models/tiny.gguf")
 def event(kind,data):events.append((kind,data))
 def command(args,timeout):raise AssertionError("Already-PCM samples must skip FFmpeg")
 env={"ROOT":root,"MODELS":root,"FAST_STT_WORKER":fast,"STT_WORKER":precise,
      "tempfile":tempfile,"time":time,"io":io,"wave":wave,"Path":Path,
      "json":json,"command":command,"event":event}
 exec(compile(ast.Module(body=nodes,type_ignores=[]),"<transcribe-unit>","exec"),env)
 b=io.BytesIO()
 with wave.open(b,"wb") as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000)
  w.writeframes(struct.pack("<1600h",*[300]*1600))
 data=b.getvalue()
 assert env["transcribe"](data,"en")=="FAST_ENG"
 assert env["transcribe"](data,"auto")=="FAST_ENG"
 assert env["transcribe"](data,"pt")=="PRECISE_PT"
 assert len(fast.calls)==2 and len(precise.calls)==1
 assert all(x[1]["pcmDirect"] for x in events)
 assert [r[1]["engine"] for r in events]==["tiny-fast","tiny-fast","base-accurate"]
 print("PASS STT_POLICY: English/auto use fast tiny; Portuguese uses precise; 16 kHz PCM skips FFmpeg")
