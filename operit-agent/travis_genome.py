#!/usr/bin/env python3
"""Behavioral genome for Travis: explicit, testable and reversible runtime policy."""
from __future__ import annotations
import json, statistics, time
from pathlib import Path

GENOME_VERSION="1.0"
GENE_NAMES=(
 "evidence_threshold","autonomy","action_bias","verbosity","retry_persistence",
 "tool_first","confidence_threshold","hallucination_tolerance","latency_priority"
)
DEFAULT_PROFILES={
 "evidence-fast-v1":{
  "evidence_threshold":0.95,"autonomy":0.90,"action_bias":0.85,"verbosity":0.25,
  "retry_persistence":0.95,"tool_first":0.90,"confidence_threshold":0.80,
  "hallucination_tolerance":0.00,"latency_priority":0.95,
 },
 "speed-v1":{
  "evidence_threshold":0.95,"autonomy":0.90,"action_bias":0.90,"verbosity":0.14,
  "retry_persistence":0.72,"tool_first":0.94,"confidence_threshold":0.82,
  "hallucination_tolerance":0.00,"latency_priority":0.99,
 },
 "verifier-v1":{
  "evidence_threshold":0.99,"autonomy":0.78,"action_bias":0.70,"verbosity":0.24,
  "retry_persistence":0.96,"tool_first":0.98,"confidence_threshold":0.91,
  "hallucination_tolerance":0.00,"latency_priority":0.72,
 },
}

def _clamp(value):
 return max(0.0,min(1.0,float(value)))

def validate_genes(genes):
 if not isinstance(genes,dict):raise ValueError("Genes inválidos")
 missing=[name for name in GENE_NAMES if name not in genes]
 unknown=[name for name in genes if name not in GENE_NAMES]
 if missing or unknown:raise ValueError("Perfil incompleto")
 clean={name:round(_clamp(genes[name]),4) for name in GENE_NAMES}
 if clean["hallucination_tolerance"]!=0.0:raise ValueError("Tolerância a alucinação tem de ser zero")
 return clean

class BehaviorGenome:
 def __init__(self,root:Path):
  self.root=Path(root)
  self.state_path=self.root/"behavior-genome.json"
  self.observations_path=self.root/"behavior-genome-observations.jsonl"

 def _default_state(self):
  return {
   "version":GENOME_VERSION,"generation":1,"active":"evidence-fast-v1",
   "profiles":{name:validate_genes(genes) for name,genes in DEFAULT_PROFILES.items()},
   "updatedAt":int(time.time()),
  }

 def _atomic_write(self,path:Path,text:str):
  self.root.mkdir(parents=True,exist_ok=True)
  tmp=path.with_name(path.name+".tmp")
  tmp.write_text(text,encoding="utf-8")
  tmp.replace(path)

 def _load(self):
  if not self.state_path.exists():
   state=self._default_state();self._save(state);return state
  try:
   state=json.loads(self.state_path.read_text(encoding="utf-8"))
   if state.get("version")!=GENOME_VERSION:raise ValueError("Versão incompatível")
   profiles=state.get("profiles") or {}
   if not profiles:raise ValueError("Sem perfis")
   state["profiles"]={str(k):validate_genes(v) for k,v in profiles.items()}
   if state.get("active") not in state["profiles"]:raise ValueError("Perfil activo inválido")
   state["generation"]=max(1,int(state.get("generation") or 1))
   return state
  except Exception:
   bad=self.state_path.with_suffix(".invalid.json")
   try:self.state_path.replace(bad)
   except OSError:pass
   state=self._default_state();self._save(state);return state

 def _save(self,state):
  state={**state,"updatedAt":int(time.time())}
  self._atomic_write(self.state_path,json.dumps(state,ensure_ascii=False,indent=2,sort_keys=True))

 def active_profile(self):
  state=self._load()
  return state["active"],dict(state["profiles"][state["active"]])

 def snapshot(self):
  state=self._load();active=state["active"]
  return {
   "version":state["version"],"generation":state["generation"],"activeProfile":active,
   "genes":dict(state["profiles"][active]),"profiles":sorted(state["profiles"]),
   "metrics":self.metrics(active),"automaticMutation":False,
  }

 def activate(self,name):
  state=self._load()
  if name not in state["profiles"]:raise ValueError("Perfil desconhecido")
  previous=state["active"];state["active"]=name;state["generation"]=int(state["generation"])+1
  self._save(state)
  return {"previous":previous,"activeProfile":name,"generation":state["generation"]}

 def derive(self,name,mutations,parent=None):
  if not name or len(name)>80:raise ValueError("Nome de perfil inválido")
  state=self._load();base=parent or state["active"]
  if base not in state["profiles"]:raise ValueError("Perfil pai desconhecido")
  genes=dict(state["profiles"][base])
  if not isinstance(mutations,dict) or not mutations:raise ValueError("Mutações vazias")
  for key,value in mutations.items():
   if key not in GENE_NAMES:raise ValueError("Gene desconhecido: "+str(key))
   genes[key]=value
  state["profiles"][name]=validate_genes(genes)
  state["generation"]=int(state["generation"])+1;self._save(state)
  return {"created":name,"parent":base,"generation":state["generation"],"genes":state["profiles"][name]}

 def inference_policy(self,json_mode=False):
  name,genes=self.active_profile()
  temperature=round(max(0.04,min(0.12,0.12-(genes["confidence_threshold"]-0.80)*0.20)),3)
  max_tokens=320 if json_mode else max(160,min(384,int(round(128+512*genes["verbosity"]))))
  suffix=(
   "Profile "+name+": use verifiable facts and do not invent data. "
   "Answer ordinary conversation and general knowledge directly. For private or current facts use observed context; if a fact is missing, name that fact and the next useful check. "
   "When a suitable deterministic tool exists, prefer it. "
   "Keep the final user-facing answer concise, direct, and in English."
  )
  return {"profile":name,"temperature":temperature,"max_tokens":max_tokens,"systemSuffix":suffix}

 def observe(self,tool,duration_ms,completion_status,ok=True,evidence_count=0,metadata=None):
  name,_=self.active_profile()
  row={
   "ts":time.time(),"profile":name,"tool":str(tool)[:80],"durationMs":max(0,int(duration_ms)),
   "completionStatus":str(completion_status)[:80],"ok":bool(ok),"evidenceCount":max(0,int(evidence_count)),
  }
  if isinstance(metadata,dict):
   row["metadata"]={str(k)[:40]:v for k,v in metadata.items() if isinstance(v,(str,int,float,bool,type(None)))}
  self.root.mkdir(parents=True,exist_ok=True)
  with self.observations_path.open("a",encoding="utf-8") as f:f.write(json.dumps(row,ensure_ascii=False,separators=(",",":"))+"\n")
  return row

 def _rows(self,profile=None,limit=500):
  if not self.observations_path.exists():return []
  lines=self.observations_path.read_text(encoding="utf-8",errors="replace").splitlines()[-max(1,min(int(limit),5000)):]
  rows=[]
  for line in lines:
   try:
    row=json.loads(line)
    if profile and row.get("profile")!=profile:continue
    rows.append(row)
   except Exception:continue
  return rows

 def metrics(self,profile=None,limit=500):
  rows=self._rows(profile,limit)
  if not rows:return {"samples":0,"eligible":False}
  durations=[max(0,int(r.get("durationMs") or 0)) for r in rows]
  success=sum(1 for r in rows if r.get("ok") is True)/len(rows)
  verified=sum(1 for r in rows if r.get("completionStatus") in {"VERIFIED","REGRESSION_TESTED","RELEASE_CANDIDATE","PRODUCTION_READY"})/len(rows)
  evidence=sum(1 for r in rows if int(r.get("evidenceCount") or 0)>0)/len(rows)
  p50=float(statistics.median(durations));ordered=sorted(durations)
  p95=float(ordered[min(len(ordered)-1,max(0,int(round((len(ordered)-1)*0.95))))])
  latency_score=1.0/(1.0+p50/1500.0)
  score=100.0*(0.45*success+0.30*verified+0.15*latency_score+0.10*evidence)
  return {
   "samples":len(rows),"eligible":len(rows)>=20,"successRate":round(success,4),
   "verifiedRate":round(verified,4),"evidenceRate":round(evidence,4),
   "p50LatencyMs":round(p50,1),"p95LatencyMs":round(p95,1),"score":round(score,2),
  }

 def compare(self,min_samples=20):
  state=self._load();rows=[]
  for name in sorted(state["profiles"]):rows.append({"profile":name,**self.metrics(name)})
  eligible=[row for row in rows if row["samples"]>=max(1,int(min_samples))]
  winner=max(eligible,key=lambda row:row["score"])["profile"] if eligible else None
  return {
   "profiles":rows,"minimumSamples":max(1,int(min_samples)),"winner":winner,
   "automaticActivation":False,
   "note":"Sem vencedor até haver amostras suficientes. Nunca activa um perfil automaticamente.",
  }
