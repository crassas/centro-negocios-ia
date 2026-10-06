#!/usr/bin/env python3
"""Local-first contracts, registry, event graph and execution wrapper for Travis/Centro."""
from __future__ import annotations
import json,re,secrets,sqlite3,time,unicodedata
from dataclasses import asdict,dataclass,field
from pathlib import Path
from typing import Any,Callable,Dict,Iterable

CORE_VERSION="1.0"
PRIORITIES={"CRITICAL","HIGH","MEDIUM","LOW"}
ACTION_TYPES={"READ","WRITE_FILE","RUN_COMMAND","API_CALL","DB_MUTATION","REPO_CHANGE","INFERENCE"}
COMPLETION_STATUSES=("DOCUMENTED","PLANNED","PARTIALLY_IMPLEMENTED","IMPLEMENTED_NOT_VERIFIED","VERIFIED","REGRESSION_TESTED","RELEASE_CANDIDATE","PRODUCTION_READY")

def _norm(s):
 return "".join(c for c in unicodedata.normalize("NFD",str(s).lower()) if not unicodedata.combining(c))
def _safe(v,n=4000):
 return re.sub(r"(?i)(bearer\s+\S+|(?:token|password|api.?key|secret)\s*[:=]\s*\S+|gh[pousr]_\w+|sk-\w+)","[redigido]",str(v or "")[:n])

@dataclass(frozen=True)
class RuntimeContext:
 request_id:str;correlation_id:str;source:str="local";project_id:str="";local_first:bool=True;paid_fallback:bool=False;started_at:float=field(default_factory=time.time)
 @classmethod
 def create(cls,source="local",project_id="",request_id=""):
  rid=request_id or "travis-"+secrets.token_hex(8);return cls(rid,rid,source,project_id)

@dataclass(frozen=True)
class EventEnvelope:
 event_id:str;correlation_id:str;timestamp:float;event_type:str;priority:str;source:str;ttl:int;payload:Dict[str,Any];context_metadata:Dict[str,Any];causation_id:str=""
 @classmethod
 def create(cls,event_type,context,payload=None,priority="MEDIUM",source="travis-core",causation_id="",ttl=5):
  priority=priority.upper()
  if priority not in PRIORITIES or not event_type or not 1<=ttl<=20:raise ValueError("Envelope de evento inválido")
  return cls("evt-"+secrets.token_hex(8),context.correlation_id,time.time(),event_type,priority,source,ttl,payload or {},{"projectId":context.project_id,"requestId":context.request_id,"localFirst":context.local_first,"paidFallback":context.paid_fallback},causation_id)

@dataclass(frozen=True)
class ActionRequest:
 action_id:str;correlation_id:str;action_type:str;parameters:Dict[str,Any];safety_constraints:Dict[str,Any];rationale:str;authorized_by:str
 @classmethod
 def create(cls,context,action_type,parameters=None,rationale="",authorized_by="travis-router",max_execution_time_ms=120000,requires_sandbox=False,rollback_supported=False):
  action_type=action_type.upper()
  if action_type not in ACTION_TYPES or not 1<=max_execution_time_ms<=900000:raise ValueError("Contrato de acção inválido")
  return cls("act-"+secrets.token_hex(8),context.correlation_id,action_type,parameters or {},{"maxExecutionTimeMs":int(max_execution_time_ms),"requiresSandbox":bool(requires_sandbox),"rollbackSupported":bool(rollback_supported)},_safe(rationale,800),_safe(authorized_by,120))

@dataclass(frozen=True)
class Capability:
 id:str;owner:str;action_type:str;mutation:bool=False;local_first:bool=True;requires_evidence:bool=True;fallback:str="none"
CAPABILITIES={}
def register_capability(tool_id,owner,action_type,mutation=False,requires_evidence=True,fallback="none"):
 if tool_id in CAPABILITIES:return
 if not tool_id or action_type.upper() not in ACTION_TYPES:raise ValueError("Capability inválida")
 CAPABILITIES[tool_id]=Capability(tool_id,owner,action_type.upper(),mutation,True,requires_evidence,fallback)
def _bootstrap():
 defs={
 "presence":("jarvis","READ",0,0,"none"),"stop":("jarvis","READ",0,0,"none"),"system_status":("jarvis","READ",0,1,"none"),"repo_access":("jarvis","READ",0,1,"none"),"site_check":("jarvis","API_CALL",0,1,"none"),"git_status":("jarvis","RUN_COMMAND",0,1,"none"),"git_diff":("jarvis","RUN_COMMAND",0,1,"none"),"git_pull_ff_only":("jarvis","RUN_COMMAND",1,1,"none"),"read_file":("jarvis","READ",0,1,"none"),"search_repo":("jarvis","READ",0,1,"none"),"sqlite_query":("jarvis","READ",0,1,"none"),"create_task":("jarvis","DB_MUTATION",1,1,"none"),"update_task":("jarvis","DB_MUTATION",1,1,"none"),"task_list":("jarvis","READ",0,1,"none"),"note_fact":("jarvis","DB_MUTATION",1,1,"none"),"pause_project":("jarvis","DB_MUTATION",1,1,"none"),"laya_status":("laya","API_CALL",0,1,"none"),"laya_decide":("laya","API_CALL",0,1,"none"),"local_llm":("jarvis","INFERENCE",0,0,"local_model_fallback"),"repo_change":("centro-server","REPO_CHANGE",1,1,"local_only"),"jarvis_query":("centro-server","INFERENCE",0,0,"local_model_fallback"),"server_status":("centro-server","READ",0,1,"none"),"station_status":("centro-server","READ",0,1,"none"),"station_doctor":("centro-server","READ",0,1,"none"),"agents_status":("centro-server","READ",0,1,"none"),"autonomy_selftest":("centro-server","RUN_COMMAND",0,1,"none"),"fault_timeout":("centro-server","RUN_COMMAND",0,1,"none"),"fault_laya_recovery":("centro-server","RUN_COMMAND",0,1,"none"),"system_info":("centro-server","READ",0,1,"none"),"git_pull":("centro-server","RUN_COMMAND",1,1,"none"),"git_access_matrix":("centro-server","READ",0,1,"none"),"claude_query":("centro-server","INFERENCE",0,0,"workers_ai_readonly"),"manus_status":("centro-server","READ",0,1,"none"),"manus_query":("centro-server","API_CALL",0,1,"none")}
 for k,v in defs.items():register_capability(k,v[0],v[1],bool(v[2]),bool(v[3]),v[4])
_bootstrap()
def registry_snapshot():return {"version":CORE_VERSION,"localFirst":True,"paidFallback":False,"capabilities":[asdict(CAPABILITIES[k]) for k in sorted(CAPABILITIES)]}

def validate_centro_task(task,allowed_actions:Iterable[str],allowed_targets:Iterable[str]):
 if not isinstance(task,dict):raise ValueError("Tarefa deve ser um objecto")
 action=str(task.get("action") or "").strip()
 if action not in set(allowed_actions) or action not in CAPABILITIES:raise ValueError("Acção não registada")
 target=str(task.get("target") or "").strip()
 if target and target!="local" and target not in set(allowed_targets):raise ValueError("Target não autorizado")
 args=task.get("args") or {}
 if not isinstance(args,dict):raise ValueError("args deve ser um objecto")
 if len(json.dumps(args,ensure_ascii=False))>56000:raise ValueError("Parâmetros excedem o limite")

def classify_local_intent(text,project_id=""):
 t=re.sub(r"^(?:travis|jarvis)\b[\s,:;.!?-]*","",_norm(text)).strip();g=re.sub(r"[^a-z0-9 ]","",t).strip();p={"target":project_id or None}
 if g in {"estas ai","estas aqui","ola","oi","bom dia","boa tarde","boa noite","alo"}:return "presence",{}
 if t in {"para","cancela","silencio","jarvis para","travis para"}:return "stop",{}
 if any(w in t for w in ["cria uma tarefa","criar tarefa","adiciona uma tarefa"]):return "create_task",{"title":text}
 if any(w in t for w in ["que tarefas","lista de tarefas","tarefas pendentes","que trabalho tens"]):return "task_list",{}
 if "nao mexas" in t:return "pause_project",p
 if any(w in t for w in ["repositorio","github","paginas internet","paginas internas"]) and any(w in t for w in ["acesso","ligado","ligacao","quais","lista"]):return "repo_access",{}
 if "git" in t:return ("git_diff" if "diff" in t else "git_status"),p
 if "laya" in t and any(w in t for w in ["estado","ligado","online"]):return "laya_status",{}
 if "classifica" in t:return "laya_decide",{"text":text}
 if any(w in t for w in ["estado da estacao","estado do centro","estado do sistema"]):return "system_status",{}
 if any(w in t for w in ["online","verifica","ve o","como estao os sites"]) and ("site" in t or project_id in {"best-pizza","pentehouse","2-irmaos"}):return "site_check",p
 if any(t.startswith(w) for w in ["corrige","melhora","altera"]):return "repo_change",{"target":project_id or None,"prompt":text}
 return "local_llm",{"text":text}

class RuntimeStore:
 def __init__(self,db_path:Path):self.db_path=Path(db_path)
 def connect(self):
  self.db_path.parent.mkdir(parents=True,exist_ok=True);c=sqlite3.connect(self.db_path,timeout=10);c.execute("PRAGMA journal_mode=WAL");c.execute("CREATE TABLE IF NOT EXISTS travis_events(id TEXT PRIMARY KEY,created REAL,correlation_id TEXT,event_type TEXT,data TEXT)");c.execute("CREATE TABLE IF NOT EXISTS travis_entities(id TEXT PRIMARY KEY,created REAL,kind TEXT,data TEXT)");c.execute("CREATE TABLE IF NOT EXISTS travis_relations(id TEXT PRIMARY KEY,created REAL,source_id TEXT,target_id TEXT,kind TEXT,data TEXT)");return c
 def emit(self,e):
  with self.connect() as c:c.execute("INSERT OR REPLACE INTO travis_events VALUES(?,?,?,?,?)",(e.event_id,e.timestamp,e.correlation_id,e.event_type,_safe(json.dumps(asdict(e),ensure_ascii=False),16000)))
 def entity(self,i,k,d):
  with self.connect() as c:c.execute("INSERT OR REPLACE INTO travis_entities VALUES(?,?,?,?)",(i,time.time(),k,_safe(json.dumps(d,ensure_ascii=False),16000)))
 def relation(self,s,t,k,d=None):
  i="rel-"+secrets.token_hex(8)
  with self.connect() as c:c.execute("INSERT INTO travis_relations VALUES(?,?,?,?,?,?)",(i,time.time(),s,t,k,_safe(json.dumps(d or {},ensure_ascii=False),8000)))
  return i
 def health(self):
  with self.connect() as c:
   q=c.execute;integrity=q("PRAGMA integrity_check").fetchone()[0];events=q("SELECT COUNT(*) FROM travis_events").fetchone()[0];entities=q("SELECT COUNT(*) FROM travis_entities").fetchone()[0];relations=q("SELECT COUNT(*) FROM travis_relations").fetchone()[0]
  return {"ok":integrity=="ok","integrity":integrity,"events":events,"entities":entities,"relations":relations}

class UnifiedExecutionFramework:
 def __init__(self,store):self.store=store
 def execute(self,tool_id,parameters,executor:Callable[[],Any],context):
  cap=CAPABILITIES.get(tool_id)
  if not cap:raise ValueError("Capability não registada: "+tool_id)
  action=ActionRequest.create(context,cap.action_type,parameters,"Pedido encaminhado pelo router local-first.",cap.owner,840000 if cap.action_type=="REPO_CHANGE" else 300000,cap.action_type=="REPO_CHANGE",cap.action_type=="REPO_CHANGE")
  self.store.entity(context.request_id,"UserRequest",{"tool":tool_id,"source":context.source,"project":context.project_id});self.store.entity(action.action_id,"ActionRequest",{"correlationId":action.correlation_id,"actionType":action.action_type,"parameterKeys":sorted(str(k) for k in action.parameters),"safetyConstraints":action.safety_constraints,"authorizedBy":action.authorized_by});self.store.relation(context.request_id,action.action_id,"SPAWNS");self.store.emit(EventEnvelope.create("TOOL_EXECUTION_STARTED",context,{"tool":tool_id,"actionId":action.action_id},"HIGH" if cap.mutation else "MEDIUM"));started=time.monotonic()
  try:
   result=executor();ms=int((time.monotonic()-started)*1000);rid="result-"+secrets.token_hex(8);code=int(result.get("exitCode",0)) if isinstance(result,dict) and "exitCode" in result else 0;ok=code==0;status="IMPLEMENTED_NOT_VERIFIED" if ok else "PARTIALLY_IMPLEMENTED";self.store.entity(rid,"Result",{"tool":tool_id,"durationMs":ms,"exitCode":code,"completionStatus":status});self.store.relation(action.action_id,rid,"RESULTS_IN");self.store.emit(EventEnvelope.create("TOOL_EXECUTION_SUCCEEDED" if ok else "TOOL_EXECUTION_FAILED",context,{"tool":tool_id,"durationMs":ms,"resultId":rid,"exitCode":code},"MEDIUM" if ok else "HIGH"));return {"result":result,"durationMs":ms,"completionStatus":status,"correlationId":context.correlation_id,"evidence":[]}
  except Exception as exc:
   ms=int((time.monotonic()-started)*1000);self.store.emit(EventEnvelope.create("TOOL_EXECUTION_FAILED",context,{"tool":tool_id,"durationMs":ms,"error":_safe(exc,600)},"HIGH"));raise

def completion_status(result):
 if int(result.get("exitCode",1))!=0:return "PARTIALLY_IMPLEMENTED"
 return "VERIFIED" if result.get("evidence") else "IMPLEMENTED_NOT_VERIFIED"
