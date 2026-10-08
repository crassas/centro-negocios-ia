#!/usr/bin/env python3
"""Bridge the real Quantum Unified Agent V10.73 runtime into Travis.

Quantum is the governing cognitive/control layer. Travis remains the voice/UI/tool host.
"""
from __future__ import annotations
import hashlib,json,sys,time
from pathlib import Path

DEFAULT_ROOT=Path.home()/"quantum-runtime/v10.73/quantum-unified-agent-v10.73"
EXPECTED_PACKAGE_SHA256="0d409255d9526ce647f625860559ef795b6ccb49d122092a82914393ebed0cc0"
BUILT_BASELINE="10.73"
CANONICAL_DRIVE_STATE="10.83 PARTIAL"
MUTATING_ACTIONS={"WRITE_FILE","RUN_COMMAND","DB_MUTATION","REPO_CHANGE"}

class QuantumUnavailable(RuntimeError):pass

class QuantumTravisBridge:
 def __init__(self,root:Path=DEFAULT_ROOT,receipt_path:Path|None=None):
  self.root=Path(root)
  self.receipt_path=receipt_path or (Path.home()/".centro-jarvis/quantum-receipts.jsonl")
  self._loaded=False
  self._load_error=""
  self._mods={}

 def _load(self):
  if self._loaded:return
  try:
   if not self.root.is_dir():raise QuantumUnavailable("Quantum runtime directory is missing")
   required=[
    self.root/"quantum/routing/strategist_router.py",
    self.root/"quantum/cognition/execution_prompt_compiler.py",
    self.root/"quantum/governance/quantum_wall.py",
    self.root/"quantum/learning/wisdom_loop.py",
    self.root/"VALIDATION-V10.73.json",
   ]
   missing=[str(p) for p in required if not p.is_file()]
   if missing:raise QuantumUnavailable("Quantum runtime is incomplete")
   rp=str(self.root)
   if rp not in sys.path:sys.path.insert(0,rp)
   from quantum.routing.strategist_router import resolve_strategy
   from quantum.cognition.execution_prompt_compiler import compile_execution_brief
   from quantum.governance.quantum_wall import QuantumCoreWall,wall_status
   from quantum.learning.wisdom_loop import WisdomLoop
   self._mods={
    "resolve_strategy":resolve_strategy,
    "compile_execution_brief":compile_execution_brief,
    "wall":QuantumCoreWall(),
    "wall_status":wall_status,
    "WisdomLoop":WisdomLoop,
   }
   self._loaded=True;self._load_error=""
  except Exception as exc:
   self._load_error=f"{type(exc).__name__}: {exc}"
   raise

 def _tier(self,action_type:str,tool:str)->str:
  action=str(action_type or "READ").upper()
  if tool in {"web_research","web_read","site_check","search_positions","gmail_inbox"}:return "T3"
  if action=="READ":return "T1"
  if action=="INFERENCE":return "T2"
  if action=="API_CALL":return "T3"
  if action in {"WRITE_FILE","RUN_COMMAND","DB_MUTATION"}:return "T4"
  if action=="REPO_CHANGE":return "T5"
  return "T2"

 def _phase(self,action_type:str,tool:str)->str:
  action=str(action_type or "READ").upper()
  if tool in {"site_check","search_positions","system_status","git_status","git_diff","repo_review"}:return "VERIFY"
  if tool in {"web_research","web_read","gmail_inbox","neural_recall"}:return "RESEARCH"
  if action=="INFERENCE":return "PLAN"
  if action in MUTATING_ACTIONS:return "EXECUTE"
  return "RESEARCH"

 def _complex(self,task:str,tool:str)->bool:
  t=str(task or "").lower()
  return tool in {"repo_change","repo_review","expert_query"} or len(t)>220 or any(x in t for x in (
   "build","implement","architecture","redesign","debug","investigate","analyse deeply","analyze deeply",
   "corrige","implementa","arquitetura","redesign","investiga","analisa a fundo"
  ))

 def prepare(self,*,task:str,tool:str,action_type:str,project_id:str="",workspace:Path|None=None,mutation:bool=False,requires_evidence:bool=True)->dict:
  self._load()
  task=str(task or "").strip()
  if not task:raise ValueError("Quantum requires a user goal")
  route=self._mods["resolve_strategy"](task)
  brief=self._mods["compile_execution_brief"](task,route)
  phase=self._phase(action_type,tool);tier=self._tier(action_type,tool)
  goal_ref="travis:"+hashlib.sha256(task.encode()).hexdigest()[:16]
  authorization=self._mods["wall"].authorize({
   "goal_ref":goal_ref,
   "phase":phase,
   "capability":tool,
   "tool_tier":tier,
   "intent":{"task":task[:4000],"project":project_id,"tool":tool},
   "state_epoch":"CURRENT",
   "evidence_required":bool(requires_evidence),
   "rollback_required":bool(mutation or action_type in MUTATING_ACTIONS),
   # A direct current user request is the authority source. Existing Travis guards still apply.
   "authority_confirmed":bool(mutation or action_type in MUTATING_ACTIONS),
  })
  wisdom=None
  if self._complex(task,tool):
   ws=Path(workspace or (Path.home()/".centro-jarvis/quantum-workspace"))
   ws.mkdir(parents=True,exist_ok=True)
   try:
    raw=self._mods["WisdomLoop"](ws).build_plan(task)
    wisdom={
     "task_kind":raw.get("task_kind"),"current_layer":raw.get("current_layer"),
     "layers":raw.get("layers",[])[:18],"tool_plan":raw.get("tool_plan",[])[:10],
     "stop_rule":raw.get("stop_rule"),"existing_product_baseline":raw.get("existing_product_baseline"),
    }
   except Exception as exc:
    wisdom={"status":"DEGRADED","error":type(exc).__name__}
  return {
   "schema":"travis-quantum-bridge/v1",
   "builtBaseline":BUILT_BASELINE,
   "canonicalDriveState":CANONICAL_DRIVE_STATE,
   "goalRef":goal_ref,
   "strategyRoute":route.to_dict(),
   "executionBrief":brief.to_dict(),
   "wisdomPlan":wisdom,
   "authorization":authorization,
   "phase":phase,"tier":tier,"tool":tool,"project":project_id,
   "preparedAt":time.time(),
  }

 def reasoning_context(self,plan:dict)->str:
  r=plan.get("strategyRoute") or {};b=plan.get("executionBrief") or {};w=plan.get("wisdomPlan")
  lines=[
   "QUANTUM UNIFIED AGENT GOVERNING CONTEXT:",
   f"- primary strategy: {r.get('primary','IMPLEMENTATION')}",
   f"- support strategies: {', '.join(r.get('support') or []) or 'none'}",
   f"- desired outcome: {b.get('outcome','')}",
   f"- execution instruction: {b.get('execution_instruction','')}",
   f"- verification rule: {b.get('verification_rule','')}",
   "- external models/tools are executors, not authorities.",
   "- preserve explicit user constraints and do not silently invent unknowns.",
  ]
  if isinstance(w,dict) and w.get("current_layer"):
   lines.append(f"- current bounded layer: {w.get('current_layer')}")
   if w.get("stop_rule"):lines.append(f"- stop rule: {w.get('stop_rule')}")
  return "\n".join(lines)

 def ingest(self,plan:dict,*,status:str,result_summary:str="",evidence_refs=None,provenance:str="travis-runtime")->dict:
  self._load()
  returned=self._mods["wall"].ingest_result(plan["authorization"],{
   "status":str(status or "UNKNOWN"),
   "provenance":provenance,
   "evidence_refs":list(evidence_refs or []),
   "summary":str(result_summary or "")[:3000],
  })
  record={
   "ts":time.time(),"goalRef":plan.get("goalRef"),"tool":plan.get("tool"),
   "phase":plan.get("phase"),"tier":plan.get("tier"),
   "strategy":(plan.get("strategyRoute") or {}).get("primary"),
   "status":status,"returnEnvelope":returned,
  }
  self.receipt_path.parent.mkdir(parents=True,exist_ok=True)
  with self.receipt_path.open("a",encoding="utf-8") as f:f.write(json.dumps(record,ensure_ascii=False,separators=(",",":"))+"\n")
  return returned

 def health(self)->dict:
  try:
   self._load()
   validation=self.root/"VALIDATION-V10.73.json"
   val={}
   try:val=json.loads(validation.read_text(encoding="utf-8"))
   except Exception:pass
   return {
    "ok":True,"builtBaseline":BUILT_BASELINE,"canonicalDriveState":CANONICAL_DRIVE_STATE,
    "root":str(self.root),"wall":self._mods["wall_status"](),
    "validationStatus":val.get("status") or val.get("result") or "PRESENT",
    "packageSha256":EXPECTED_PACKAGE_SHA256,
   }
  except Exception:
   return {"ok":False,"builtBaseline":BUILT_BASELINE,"canonicalDriveState":CANONICAL_DRIVE_STATE,"error":self._load_error}
