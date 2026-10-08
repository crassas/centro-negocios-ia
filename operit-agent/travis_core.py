#!/usr/bin/env python3
"""Local-first contracts, registry, event graph and execution wrapper for Travis/Centro."""
from __future__ import annotations
import json,re,secrets,sqlite3,time,unicodedata
from dataclasses import asdict,dataclass,field
from pathlib import Path
from typing import Any,Callable,Dict,Iterable

CORE_VERSION="1.2"
PRIORITIES={"CRITICAL","HIGH","MEDIUM","LOW"}
ACTION_TYPES={"READ","WRITE_FILE","RUN_COMMAND","API_CALL","DB_MUTATION","REPO_CHANGE","INFERENCE"}
COMPLETION_STATUSES=("DOCUMENTED","PLANNED","PARTIALLY_IMPLEMENTED","IMPLEMENTED_NOT_VERIFIED","VERIFIED","REGRESSION_TESTED","RELEASE_CANDIDATE","PRODUCTION_READY")
NEURON_TYPES={"CONCEPT","DECISION","FACT","RULE"}
SYNAPSE_TYPES={"DEPENDS_ON","CONTRADICTS","EXTENDS","SIMILAR_TO"}
TRUSTED_MEMORY_SOURCES={"explicit_user","verified_result","system_config"}
MEMORY_STOPWORDS={"sobre","muito","entao","quando","como","para","esta","estou","este","esta","uma","uns","umas","pelo","pela","pelos","elas","eles","com","sem","sob","por","que","dos","das","nos","nas","the","and","from"}

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
 "projects_status":("jarvis","READ",0,1,"none"),"presence":("jarvis","READ",0,0,"none"),"open_youtube":("jarvis","READ",0,1,"none"),"stop":("jarvis","READ",0,0,"none"),"system_status":("jarvis","READ",0,1,"none"),"quantum_status":("jarvis","READ",0,1,"none"),"genome_status":("jarvis","READ",0,1,"none"),"genome_compare":("jarvis","READ",0,1,"none"),"genome_activate":("jarvis","DB_MUTATION",1,1,"none"),"repo_access":("jarvis","READ",0,1,"none"),"site_check":("jarvis","API_CALL",0,1,"none"),"search_positions":("jarvis","API_CALL",0,1,"none"),"git_status":("jarvis","RUN_COMMAND",0,1,"none"),"git_diff":("jarvis","RUN_COMMAND",0,1,"none"),"git_pull_ff_only":("jarvis","RUN_COMMAND",1,1,"none"),"read_file":("jarvis","READ",0,1,"none"),"search_repo":("jarvis","READ",0,1,"none"),"sqlite_query":("jarvis","READ",0,1,"none"),"create_task":("jarvis","DB_MUTATION",1,1,"none"),"update_task":("jarvis","DB_MUTATION",1,1,"none"),"task_list":("jarvis","READ",0,1,"none"),"note_fact":("jarvis","DB_MUTATION",1,1,"none"),"neural_status":("jarvis","READ",0,1,"none"),"neural_recall":("jarvis","READ",0,1,"none"),"neural_consolidate":("jarvis","DB_MUTATION",1,1,"none"),"pause_project":("jarvis","DB_MUTATION",1,1,"none"),"laya_status":("laya","API_CALL",0,1,"none"),"laya_decide":("laya","API_CALL",0,1,"none"),"local_llm":("jarvis","INFERENCE",0,0,"local_model_fallback"),"expert_query":("centro-server","INFERENCE",0,1,"large_agent_fallback"),"repo_review":("centro-server","INFERENCE",0,1,"readonly_agent"),"repo_change":("centro-server","REPO_CHANGE",1,1,"local_only"),"jarvis_query":("centro-server","INFERENCE",0,0,"local_model_fallback"),"server_status":("centro-server","READ",0,1,"none"),"station_status":("centro-server","READ",0,1,"none"),"station_doctor":("centro-server","READ",0,1,"none"),"agents_status":("centro-server","READ",0,1,"none"),"autonomy_selftest":("centro-server","RUN_COMMAND",0,1,"none"),"fault_timeout":("centro-server","RUN_COMMAND",0,1,"none"),"fault_laya_recovery":("centro-server","RUN_COMMAND",0,1,"none"),"system_info":("centro-server","READ",0,1,"none"),"git_pull":("centro-server","RUN_COMMAND",1,1,"none"),"git_access_matrix":("centro-server","READ",0,1,"none"),"claude_query":("centro-server","INFERENCE",0,0,"workers_ai_readonly"),"manus_status":("centro-server","READ",0,1,"none"),"manus_query":("centro-server","API_CALL",0,1,"none"),"business_db_status":("centro-server","READ",0,1,"none"),"business_snapshot":("centro-server","READ",0,1,"none"),"business_add_lead":("centro-server","DB_MUTATION",1,1,"none"),"business_update_lead":("centro-server","DB_MUTATION",1,1,"none"),"business_add_site":("centro-server","DB_MUTATION",1,1,"none"),"business_add_payment":("centro-server","DB_MUTATION",1,1,"none"),"business_add_task":("centro-server","DB_MUTATION",1,1,"none")}
 for k,v in defs.items():register_capability(k,v[0],v[1],bool(v[2]),bool(v[3]),v[4])
_bootstrap()
register_capability("gmail_inbox","jarvis","API_CALL")
register_capability("agent_sessions","jarvis","READ")
for _tool in ("web_open","web_read","web_follow"):register_capability(_tool,"jarvis","READ",False,True,"none")
register_capability("web_research","jarvis","API_CALL",False,True,"local_llm_fallback")
def registry_snapshot():return {"version":CORE_VERSION,"localFirst":True,"paidFallback":False,"capabilities":[asdict(CAPABILITIES[k]) for k in sorted(CAPABILITIES)]}

def validate_centro_task(task,allowed_actions:Iterable[str],allowed_targets:Iterable[str]):
 if not isinstance(task,dict):raise ValueError("Tarefa deve ser um objecto")
 action=str(task.get("action") or "").strip()
 if action not in set(allowed_actions) or action not in CAPABILITIES:raise ValueError("Acção não registada")
 target=str(task.get("target") or "").strip()
 repo_target_actions={"repo_change","git_status","git_pull","claude_query"}
 if action in repo_target_actions and target and target!="local" and target not in set(allowed_targets):raise ValueError("Target não autorizado")
 args=task.get("args") or {}
 if not isinstance(args,dict):raise ValueError("args deve ser um objecto")
 if len(json.dumps(args,ensure_ascii=False))>56000:raise ValueError("Parâmetros excedem o limite")

def classify_local_intent(text,project_id=""):
 raw=_norm(text)
 raw=re.sub(r"^(?:travisse(?:-se)?|travisse|travis-se|travi)\b","travis",raw)
 t=re.sub(r"^(?:travis|jarvis)\b[\s,:;.!?-]*","",raw).strip();g=re.sub(r"[^a-z0-9 ]","",t).strip();p={"target":project_id or None}
 if re.search(r"\b(?:le|ler|mostra|ver|consulta|consultar)\b",t) and any(w in t for w in ["gmail","emails","e-mails","correio"]):return "gmail_inbox",{}
 if any(w in t for w in ["sessoes dos agentes","estado dos agentes","sala dos agentes","sala de comando"]):return "agent_sessions",{}
 if (not g and raw.strip(" ,:;.!?-") in {"travis","jarvis"}) or g in {"ai","tas ai","estas ai","estas aqui","ola","oi","bom dia","boa tarde","boa noite","alo"}:return "presence",{}
 if re.fullmatch(r"(?:por favor[, ]+)?(?:(?:consegues|podes|poderias)\s+)?(?:abrir|abre)\s+(?:o\s+)?youtube[\s?.!]*(?:por favor[\s?.!]*)?",t):return "open_youtube",{}
 if t in {"para","cancela","silencio","jarvis para","travis para"}:return "stop",{}
 if any(w in t for w in ["cria uma tarefa","criar tarefa","adiciona uma tarefa"]):return "create_task",{"title":text}
 if any(w in t for w in ["que tarefas","lista de tarefas","tarefas pendentes","que trabalho tens"]):return "task_list",{}
 if any(w in t for w in ["estado dos neuronios","estado do cerebro","quantos neuronios","mapa neural"]):return "neural_status",{}
 if any(w in t for w in ["procura na memoria","pesquisa na memoria","o que tens na memoria sobre"]):return "neural_recall",{"query":text}
 if any(w in t for w in ["consolida a memoria","consolida os neuronios","ciclo de sono","dream cycle"]):return "neural_consolidate",{}
 m=re.fullmatch(r"(?:ativa|activar|ativar)\s+(?:o\s+)?perfil\s+(evidence-fast-v1|speed-v1|verifier-v1|rapido|verificador|equilibrado)",t)
 if m:
  name={"rapido":"speed-v1","verificador":"verifier-v1","equilibrado":"evidence-fast-v1"}.get(m.group(1),m.group(1));return "genome_activate",{"profile":name}
 if any(w in t for w in ["compara os perfis","comparar os perfis","compara o genoma","comparar o genoma"]):return "genome_compare",{}
 if any(w in t for w in ["estado do genoma","genoma comportamental","perfil comportamental"]):return "genome_status",{}
 if any(t.startswith(w) for w in ["lembra-te que","lembra que","guarda que","memoriza que","recorda que"]):return "note_fact",{"text":text}
 if "nao mexas" in t:return "pause_project",p
 action_terms=["trata disso","faz isso","resolve","corrige","melhora","altera","atualiza","actualiza","implementa","optimiza","aplica","faz as alteracoes","faz a alteracao","poe isso a funcionar","deixa isso pronto"]
 review_terms=["ve o que falta","ver o que falta","analisa","reve","revisa","inspeciona","audita","acede ao repositorio","acessa o repositorio","entra no repositorio","abre o repositorio","verifica o repositorio","olha para o repositorio","ve o repositorio"]
 if project_id and any(w in t for w in action_terms):return "repo_change",{"target":project_id,"prompt":text}
 if project_id and any(w in t for w in review_terms):return "repo_review",{"target":project_id,"prompt":text}
 if any(w in t for w in ["repositorio","github","paginas internet","paginas internas"]) and any(w in t for w in ["acesso","ligado","ligacao","quais","lista"]):return "repo_access",{}
 if re.search(r"\b(posicao|posicoes|ranking|rankings|classificacao no google)\b",t):return "search_positions",p
 if "git" in t:return ("git_diff" if "diff" in t else "git_status"),p
 if "laya" in t and any(w in t for w in ["estado","ligado","online"]):return "laya_status",{}
 if "classifica" in t:return "laya_decide",{"text":text}
 # Operational status must use observed data, never model inference.
 if re.fullmatch(r"(?:(?:ola|amigo)[, ]+)?(?:tudo (?:bem|em ordem) com (?:os |o |a )?|como (?:estao|esta|vao|vai|andam|anda) (?:os |o |a )?|(?:qual (?:e )?o )?estado (?:dos |do |da )?)(?:meus |nossos )?(?:projectos?|projetos?|"+re.escape(_norm(project_id or "__none__"))+r")[\s?.!]*",t):return "projects_status",p
 if any(w in t for w in ["estado do quantum","quantum status","estado do cerebro quantum","estado do cérebro quantum"]):return "quantum_status",{}
 if any(w in t for w in ["estado da estacao","estado do centro","estado do sistema"]):return "system_status",{}
 if any(w in t for w in ["online","offline","site funciona","site esta disponivel","verifica o site","verifica os sites","como estao os sites"]) and ("site" in t or project_id in {"best-pizza","pentehouse","2-irmaos"}):return "site_check",p
 expert_terms=["analisa a fundo","analisa profundamente","investiga","pesquisa a fundo","compara","arquitetura","estrategia","estratégia","faz um plano","plano detalhado","diagnostica","diagnóstico","qual a melhor forma","estuda isto","estuda este","avalia a fundo"]
 if not project_id and (any(w in t for w in expert_terms) or len(t)>260):return "expert_query",{"text":text}
 if any(t.startswith(w) for w in ["corrige","melhora","altera","atualiza","actualiza","implementa","optimiza","resolve"]):return "repo_change",{"target":project_id or None,"prompt":text}
 return "local_llm",{"text":text}

class RuntimeStore:
 def __init__(self,db_path:Path):self.db_path=Path(db_path)
 def connect(self):
  self.db_path.parent.mkdir(parents=True,exist_ok=True);c=sqlite3.connect(self.db_path,timeout=10);c.execute("PRAGMA journal_mode=WAL");c.execute("CREATE TABLE IF NOT EXISTS travis_events(id TEXT PRIMARY KEY,created REAL,correlation_id TEXT,event_type TEXT,data TEXT)");c.execute("CREATE TABLE IF NOT EXISTS travis_entities(id TEXT PRIMARY KEY,created REAL,kind TEXT,data TEXT)");c.execute("CREATE TABLE IF NOT EXISTS travis_relations(id TEXT PRIMARY KEY,created REAL,source_id TEXT,target_id TEXT,kind TEXT,data TEXT)");c.execute("CREATE TABLE IF NOT EXISTS travis_neurons(id TEXT PRIMARY KEY,created REAL,updated REAL,title TEXT,summary TEXT,kind TEXT,tags TEXT,project_id TEXT,priority INTEGER,importance REAL,last_accessed REAL,source_type TEXT,source_event_id TEXT,confidence REAL,active INTEGER DEFAULT 1)");c.execute("CREATE TABLE IF NOT EXISTS travis_synapses(id TEXT PRIMARY KEY,created REAL,updated REAL,source_id TEXT,target_id TEXT,relation_type TEXT,weight REAL,confidence REAL,last_reinforced REAL,active INTEGER DEFAULT 1,UNIQUE(source_id,target_id,relation_type))");return c
 def emit(self,e):
  with self.connect() as c:c.execute("INSERT OR REPLACE INTO travis_events VALUES(?,?,?,?,?)",(e.event_id,e.timestamp,e.correlation_id,e.event_type,_safe(json.dumps(asdict(e),ensure_ascii=False),16000)))
 def entity(self,i,k,d):
  with self.connect() as c:c.execute("INSERT OR REPLACE INTO travis_entities VALUES(?,?,?,?)",(i,time.time(),k,_safe(json.dumps(d,ensure_ascii=False),16000)))
 def relation(self,s,t,k,d=None):
  i="rel-"+secrets.token_hex(8)
  with self.connect() as c:c.execute("INSERT INTO travis_relations VALUES(?,?,?,?,?,?)",(i,time.time(),s,t,k,_safe(json.dumps(d or {},ensure_ascii=False),8000)))
  return i
 def remember(self,title,summary,kind="FACT",tags=None,project_id="",priority=3,source_type="explicit_user",source_event_id="",confidence=1.0):
  kind=str(kind).upper();source_type=str(source_type)
  if kind not in NEURON_TYPES:raise ValueError("Tipo de neurónio inválido")
  if source_type not in TRUSTED_MEMORY_SOURCES:raise ValueError("Fonte de memória não autorizada")
  summary=_safe(summary,2400).strip();title=_safe(title or summary[:90],180).strip()
  if not summary or not title:raise ValueError("Neurónio vazio")
  priority=max(1,min(5,int(priority)));confidence=max(0.0,min(1.0,float(confidence)));project_id=_safe(project_id,120).strip()
  tag_list=sorted({x for x in (_norm(t).strip() for t in (tags or [])) if x})[:20];now=time.time()
  with self.connect() as c:
   row=c.execute("SELECT id,importance FROM travis_neurons WHERE active=1 AND lower(title)=lower(?) AND project_id=? AND kind=? LIMIT 1",(title,project_id,kind)).fetchone()
   if row:
    nid=row[0];importance=min(1.0,max(float(row[1] or 0.5),0.5)+0.03)
    c.execute("UPDATE travis_neurons SET updated=?,summary=?,tags=?,priority=?,importance=?,last_accessed=?,source_type=?,source_event_id=?,confidence=? WHERE id=?",(now,summary,json.dumps(tag_list,ensure_ascii=False),priority,importance,now,source_type,_safe(source_event_id,160),confidence,nid));return nid
   nid="neuron-"+secrets.token_hex(8)
   c.execute("INSERT INTO travis_neurons VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",(nid,now,now,title,summary,kind,json.dumps(tag_list,ensure_ascii=False),project_id,priority,0.5,now,source_type,_safe(source_event_id,160),confidence,1));return nid
 def link_neurons(self,source_id,target_id,relation_type="EXTENDS",weight=0.5,confidence=1.0):
  relation_type=str(relation_type).upper()
  if relation_type not in SYNAPSE_TYPES or source_id==target_id:raise ValueError("Sinapse inválida")
  weight=max(0.1,min(1.0,float(weight)));confidence=max(0.0,min(1.0,float(confidence)));now=time.time()
  with self.connect() as c:
   found=c.execute("SELECT id FROM travis_neurons WHERE id IN (?,?) AND active=1",(source_id,target_id)).fetchall()
   if len(found)!=2:raise ValueError("Neurónio da sinapse não existe")
   row=c.execute("SELECT id,weight FROM travis_synapses WHERE source_id=? AND target_id=? AND relation_type=?",(source_id,target_id,relation_type)).fetchone()
   if row:
    sid=row[0];weight=min(1.0,max(weight,float(row[1] or 0.1))+0.08);c.execute("UPDATE travis_synapses SET updated=?,weight=?,confidence=?,last_reinforced=?,active=1 WHERE id=?",(now,weight,confidence,now,sid));return sid
   sid="synapse-"+secrets.token_hex(8);c.execute("INSERT INTO travis_synapses VALUES(?,?,?,?,?,?,?,?,?,?)",(sid,now,now,source_id,target_id,relation_type,weight,confidence,now,1));return sid
 def recall(self,query,project_id="",limit=6):
  tokens={w for w in re.findall(r"[a-z0-9]+",_norm(query)) if len(w)>=3 and w not in MEMORY_STOPWORDS};project_id=_safe(project_id,120).strip();now=time.time()
  with self.connect() as c:
   rows=c.execute("SELECT id,title,summary,kind,tags,project_id,priority,importance,last_accessed,source_type,confidence FROM travis_neurons WHERE active=1 ORDER BY importance DESC,updated DESC LIMIT 500").fetchall()
   central={row[0]:float(row[1] or 0) for row in c.execute("SELECT n.id,COALESCE(SUM(s.weight),0) FROM travis_neurons n LEFT JOIN travis_synapses s ON s.active=1 AND (s.source_id=n.id OR s.target_id=n.id) WHERE n.active=1 GROUP BY n.id")}
   scored=[]
   for row in rows:
    nid,title,summary,kind,tags_raw,pid,priority,importance,last_accessed,source_type,confidence=row
    try:tags=json.loads(tags_raw or "[]")
    except Exception:tags=[]
    title_tokens=set(re.findall(r"[a-z0-9]+",_norm(title)));body_tokens=set(re.findall(r"[a-z0-9]+",_norm(summary+" "+" ".join(tags))))
    overlap=2.0*len(tokens & title_tokens)+1.0*len(tokens & body_tokens);project_boost=2.5 if project_id and pid==project_id else 0.0
    if tokens and overlap==0 and project_boost==0:continue
    age_days=max(0.0,(now-float(last_accessed or now))/86400);recency=max(0.0,1.0-age_days/30.0)
    score=overlap+project_boost+float(importance or 0.5)*2.0+min(1.5,central.get(nid,0.0))+recency+float(priority or 3)*0.1
    scored.append((score,{"id":nid,"title":title,"summary":summary,"kind":kind,"tags":tags,"projectId":pid,"importance":round(float(importance or 0.5),3),"confidence":round(float(confidence or 1.0),3),"sourceType":source_type}))
   selected=sorted(scored,key=lambda x:(-x[0],-x[1]["importance"]))[:max(1,min(int(limit),12))]
   for _,item in selected:c.execute("UPDATE travis_neurons SET last_accessed=?,importance=MIN(1.0,importance+0.02),updated=? WHERE id=?",(now,now,item["id"]))
  return [{**item,"score":round(score,3)} for score,item in selected]
 def neural_context(self,query,project_id="",limit=5):
  rows=self.recall(query,project_id,limit)
  if not rows:return ""
  return "\n".join(f"- [{r['kind']}] {r['title']}: {r['summary']} (confiança {r['confidence']:.2f})" for r in rows)
 def consolidate_neurons(self):
  now=time.time();changed=0
  with self.connect() as c:
   synapses=c.execute("SELECT id,weight,last_reinforced FROM travis_synapses WHERE active=1").fetchall()
   for sid,weight,last in synapses:
    days=max(0.0,(now-float(last or now))/86400);decay=min(0.25,0.01*(days//7))
    new_weight=max(0.1,float(weight or 0.5)-decay)
    if abs(new_weight-float(weight or 0.5))>0.0001:c.execute("UPDATE travis_synapses SET weight=?,updated=? WHERE id=?",(round(new_weight,3),now,sid));changed+=1
   central={row[0]:float(row[1] or 0) for row in c.execute("SELECT n.id,COALESCE(SUM(s.weight),0) FROM travis_neurons n LEFT JOIN travis_synapses s ON s.active=1 AND (s.source_id=n.id OR s.target_id=n.id) WHERE n.active=1 GROUP BY n.id")}
   max_c=max([1.0,*central.values()])
   neurons=c.execute("SELECT id,last_accessed,priority FROM travis_neurons WHERE active=1").fetchall()
   for nid,last,priority in neurons:
    age=max(0.0,(now-float(last or now))/86400);recency=max(0.0,0.3-age*0.01);structural=(central.get(nid,0.0)/max_c)*0.6;prio=float(priority or 3)/5*0.1;importance=max(0.1,min(1.0,structural+recency+prio));c.execute("UPDATE travis_neurons SET importance=?,updated=? WHERE id=?",(round(importance,3),now,nid))
  return {"neurons":len(neurons),"synapses":len(synapses),"decayed":changed}
 def health(self):
  with self.connect() as c:
   q=c.execute;integrity=q("PRAGMA integrity_check").fetchone()[0];events=q("SELECT COUNT(*) FROM travis_events").fetchone()[0];entities=q("SELECT COUNT(*) FROM travis_entities").fetchone()[0];relations=q("SELECT COUNT(*) FROM travis_relations").fetchone()[0];neurons=q("SELECT COUNT(*) FROM travis_neurons WHERE active=1").fetchone()[0];synapses=q("SELECT COUNT(*) FROM travis_synapses WHERE active=1").fetchone()[0]
  return {"ok":integrity=="ok","integrity":integrity,"events":events,"entities":entities,"relations":relations,"neurons":neurons,"synapses":synapses}

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
