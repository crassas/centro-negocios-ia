#!/usr/bin/env python3
"""Travis Decision Governor: local Laya preferences + verified consequences.

Laya choice probabilities are preferences over the supplied alternatives,
NOT calibrated chances that an action will succeed. Only exact, read-only
actions are executable. High-risk requests never acquire permissions here.
Every decision is persisted with provenance and observed postconditions.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import secrets
import sqlite3
import subprocess
import time
import unicodedata
import urllib.request
from contextlib import closing
from pathlib import Path

VERSION = "1.0"
LAYA_ENDPOINT = "http://127.0.0.1:18790/v1/systemone"
OBSERVATION_ENDPOINTS = {
    "inspect_centro": "http://127.0.0.1:8765/health",
    "inspect_laya": "http://127.0.0.1:18790/health",
    "inspect_router": "http://127.0.0.1:8770/health",
}
ACTION_DESCRIPTIONS = {
    "inspect_centro": "Verificar o serviço Centro por HTTP local, sem alterações.",
    "inspect_laya": "Verificar o serviço Laya por HTTP local, sem alterações.",
    "inspect_router": "Verificar o serviço de voz e execução do Travis, sem alterações.",
    "inspect_memory": "Verificar integridade e contagem de memórias numa base SQLite só de leitura.",
    "inspect_repo": "Consultar o estado Git do repositório Centro, sem modificar ficheiros.",
    "request_approval": "Solicitar ao operador autorização específica antes de qualquer alteração.",
    "defer": "Não executar nada e indicar que faltam observações.",
}
READ_ONLY = frozenset({"inspect_centro","inspect_laya","inspect_router",
                       "inspect_memory","inspect_repo"})
SAFE = frozenset(ACTION_DESCRIPTIONS)
HIGH_RISK = re.compile(
    r"\b(?:apaga(?:r)?|elimina(?:r)?|remove(?:r)?|destr[oó]i|publica(?:r)?|"
    r"deploy|delete|erase|remove|publish|transferir|transfer|pagar|pay|"
    r"enviar|send|comprar|buy|alterar|mudar|modify|write|escrever|"
    r"executar\s+comando|run\s+command|instala(?:r)?|install)\b",re.I)
MIN_PREFERENCE = 0.50  # Exploratory read-only probes only
MIN_MARGIN = 0.08

def normalize(s):
    return "".join(c for c in unicodedata.normalize("NFD",str(s).lower())
                   if not unicodedata.combining(c))

def json_compact(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"))

def _read_json(url, payload):
    req=urllib.request.Request(url,data=json_compact(payload).encode(),
        headers={"Content-Type":"application/json","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=14) as response:
        raw=response.read(16001)
        if len(raw)>16000:raise ValueError("laya_response_too_large")
        return json.loads(raw)

def laya_preferences(task, options, transport=None):
    """Strictly validate the choice response. Never trust it as a tool call."""
    if not isinstance(options,(list,tuple)) or not 2<=len(options)<=7:
        raise ValueError("invalid_options")
    ids=[o for o in options]
    if len(set(ids))!=len(ids) or not set(ids).issubset(SAFE):
        raise ValueError("unregistered_decision_alternative")
    request={"state":str(task)[:850],
      "questions":{"action":{"type":"choice",
        "instructions":"Escolhe a próxima ação mais útil com risco proporcional. "
          "Não interpretes alternativas como autorização; se faltarem dados, "
          "prefere adiar ou pedir confirmação. Responde só à escolha.",
        "criteria":{identifier:ACTION_DESCRIPTIONS[identifier] for identifier in ids}}},
      "model":"multilingual"}
    response=(transport or _read_json)(LAYA_ENDPOINT,request)
    if not isinstance(response,dict):raise ValueError("not_a_response_object")
    answer=(response.get("answers") or {}).get("action")
    if not isinstance(answer,dict):raise ValueError("missing_laya_answer")
    choice=answer.get("choice")
    probabilities=answer.get("probabilities")
    if choice not in ids or not isinstance(probabilities,dict) or set(probabilities)!=set(ids):
        raise ValueError("unexpected_laya_choices")
    if any(type(probabilities[k]) not in (int,float) or not math.isfinite(probabilities[k])
           or probabilities[k]<0 or probabilities[k]>1 for k in ids):
        raise ValueError("invalid_laya_probability")
    total=sum(probabilities.values())
    if not 0.975<=total<=1.025:raise ValueError("laya_probability_sum")
    values={k:round(float(probabilities[k])/total,6) for k in ids}
    # A model may report one choice but a different maximum: that is uncertain.
    maximum=max(values.values())
    if values[choice]<maximum-0.001:raise ValueError("laya_choice_disagrees_with_scores")
    return {"choice":choice,"preferences":values,
            "model":str(response.get("model") or "unidentified")[:75],
            "interpretation":"relative_choice_preferences_not_real_success_probabilities"}

def domain_choices(task):
    normalized=normalize(task)
    normalized=re.sub(r'^(?:travis|jarvis)[,:;.!? ]+', '', normalized).strip()
    # A request for a change must never be converted into an automated mutation.
    if HIGH_RISK.search(normalized):
        return ["request_approval","defer"],"approval_required"
    targets=[]
    if re.search(r"\b(?:laya|motor\s+de\s+decisao)\b",normalized):
        targets.append("inspect_laya")
    if re.search(r"\b(?:memoria|neuronios|cerebro|sqlite|memory)\b",normalized):
        targets.append("inspect_memory")
    if re.search(r"\b(?:repositorios?|repositorio|git|checkout|working\s+tree)\b",normalized):
        targets.append("inspect_repo")
    if re.search(r"\b(?:centro|servidor|backend|server|estacao)\b",normalized):
        targets.append("inspect_centro")
    if re.search(r"\b(?:travis|jarvis|router|voz|voice)\b",normalized):
        targets.append("inspect_router")
    targets=list(dict.fromkeys(targets))
    if not targets:return ["request_approval","defer"],"no_observable_target"
    return targets[:5]+["request_approval","defer"],"read_only"

def _safe_observation(action,root,repo,fetch=None):
    if action not in READ_ONLY:raise PermissionError("action_not_readonly")
    if action in OBSERVATION_ENDPOINTS:
        try:
            if fetch is None:
                with urllib.request.urlopen(OBSERVATION_ENDPOINTS[action],timeout=2) as response:
                    payload=json.loads(response.read(5000))
            else:payload=fetch(OBSERVATION_ENDPOINTS[action])
            ok=isinstance(payload,dict) and (payload.get("ok") is True or payload.get("status")=="ok")
            return {"verdict":"success" if ok else "failure",
                    "scope":"local_dependency_health",
                    "code":"health_ok" if ok else "health_not_ok"}
        except (OSError,ValueError,TypeError,TimeoutError) as exc:
            return {"verdict":"failure","scope":"local_dependency_health",
                    "code":"health_"+type(exc).__name__}
    if action=="inspect_memory":
        path=Path(root)/"memory.sqlite"
        if not path.is_file():
            return {"verdict":"failure","scope":"sqlite_readonly","code":"memory_missing"}
        try:
            with closing(sqlite3.connect(path.resolve().as_uri()+"?mode=ro",
                                         uri=True,timeout=2)) as db:
                valid=db.execute("PRAGMA quick_check").fetchone()[0]=="ok"
                count=db.execute("SELECT COUNT(*) FROM travis_neurons").fetchone()[0] if valid else 0
            return {"verdict":"success" if valid else "failure",
                    "scope":"sqlite_readonly",
                    "code":"sqlite_integrity_ok" if valid else "sqlite_integrity_failed",
                    "records":int(count)}
        except (sqlite3.Error,OSError) as exc:
            return {"verdict":"failure","scope":"sqlite_readonly",
                    "code":"sqlite_"+type(exc).__name__}
    try:
        root_repo=Path(repo)
        proc=subprocess.run(["git","-C",str(root_repo),"rev-parse","--is-inside-work-tree"],
                            capture_output=True,text=True,timeout=3,check=False)
        status=proc.returncode==0 and proc.stdout.strip()=="true"
        if status:
            proc=subprocess.run(["git","-C",str(root_repo),"status","--porcelain"],
                                capture_output=True,text=True,timeout=4,check=False)
            status=proc.returncode==0
        return {"verdict":"success" if status else "failure",
                "scope":"read_only_git","code":"git_checkout_accessible" if status else "git_error"}
    except (OSError,subprocess.TimeoutExpired) as exc:
        return {"verdict":"failure","scope":"read_only_git",
                "code":"git_"+type(exc).__name__}

class DecisionGovernor:
    def __init__(self,state_dir,repo_dir=None,transport=None,fetch=None,clock=None):
        self.root=Path(state_dir)
        self.root.mkdir(parents=True,exist_ok=True)
        self.repo=Path(repo_dir or Path.home()/"repos/centro-negocios-ia")
        self.transport=transport
        self.fetch=fetch
        self.clock=clock or time.time
        self.dbpath=self.root/"decision-governor.sqlite"
        with self.db() as db:
            db.executescript("""CREATE TABLE IF NOT EXISTS decisions(
                id TEXT PRIMARY KEY, created REAL NOT NULL, task_digest TEXT NOT NULL,
                domain TEXT NOT NULL, laya_model TEXT NOT NULL,
                alternatives TEXT NOT NULL, preferences TEXT NOT NULL,
                selected TEXT NOT NULL, status TEXT NOT NULL,
                verdict TEXT NOT NULL, scope TEXT NOT NULL, evidence_code TEXT NOT NULL,
                fallback TEXT NOT NULL, checked INTEGER NOT NULL DEFAULT 0);
                CREATE INDEX IF NOT EXISTS idx_decisions_action ON decisions(selected,created);
            """)
        self.dbpath.chmod(0o600)

    def db(self):
        return sqlite3.connect(self.dbpath,timeout=5)

    def historical(self,action):
        with self.db() as db:
            row=db.execute("""SELECT COUNT(*),SUM(verdict='success'),SUM(verdict='failure')
                 FROM decisions WHERE selected=? AND checked=1 AND verdict IN ('success','failure')""",
                 (action,)).fetchone()
        n=int(row[0] or 0);successes=int(row[1] or 0);failures=int(row[2] or 0)
        # Beta mean is a smoothed *historical* observed check pass rate.
        return {"samples":n,"successes":successes,"failures":failures,
            "smoothedObservedRate":round((successes+1)/(n+2),4) if n>=10 else None,
            "reason":"insufficient_verified_cases" if n<10 else "observed_local_checks_only"}

    def decide(self,task,execute=True,language="pt"):
        if not isinstance(task,str) or not task.strip() or len(task)>4000:
            raise ValueError("decision_request_invalid")
        options,domain=domain_choices(task)
        source="not_queried"; model="none"; preferences={};model_choice=None
        choice="defer";fallback=""
        if domain=="approval_required":
            choice="request_approval"
            fallback="blocked_high_risk_until_specific_authorization"
        elif domain=="no_observable_target":
            choice="defer"
            fallback="insufficient_context_to_propose_a_read_only_action"
        else:
            try:
                estimate=laya_preferences(task,options,self.transport)
                choice=estimate["choice"]
                model_choice=choice
                preferences=estimate["preferences"]
                model=estimate["model"]
                source="laya"
                ranked=sorted(preferences.values(),reverse=True)
                if (choice in READ_ONLY and (preferences[choice]<MIN_PREFERENCE or
                    ranked[0]-ranked[1]<MIN_MARGIN)):
                    choice="defer";fallback="laya_uncertainty_threshold"
            except (OSError,ValueError,TimeoutError,TypeError,KeyError) as exc:
                source="deterministic_fallback"
                fallback="laya_"+type(exc).__name__
                safe=[opt for opt in options if opt in READ_ONLY]
                # No invented probabilities; narrow safe observation only.
                choice=safe[0] if len(safe)==1 else "defer"
        # Repeated independently observed failures change future choices.
        # This is local strategy adaptation, not model-weight training.
        if choice in READ_ONLY:
            previous=self.historical(choice)
            if previous["samples"]>=10 and previous["smoothedObservedRate"] is not None and previous["smoothedObservedRate"]<0.25:
                choice="defer"
                fallback="prior_verified_failures_favor_deferring"
        # The model is NEVER trusted to invent a tool. Only exact read-only
        # alternatives can execute; approval is not granted by this function.
        observation={"verdict":"unknown","scope":"decision_only",
                     "code":"awaiting_authorization" if choice=="request_approval" else
                            "not_executed"}
        status="approval_required" if choice=="request_approval" else "deferred"
        if choice in READ_ONLY and execute:
            observation=_safe_observation(choice,self.root,self.repo,self.fetch)
            status="checked" if observation["verdict"]=="success" else "check_failed"
        elif choice in READ_ONLY:
            status="proposed"
        cid="decision-"+secrets.token_hex(10)
        timestamp=self.clock()
        digest=hashlib.sha256(task.encode()).hexdigest()
        with self.db() as db:
            db.execute("""INSERT INTO decisions
                 (id,created,task_digest,domain,laya_model,alternatives,preferences,
                  selected,status,verdict,scope,evidence_code,fallback,checked)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (cid,timestamp,digest,domain,model,json_compact(options),
                 json_compact(preferences),choice,status,observation["verdict"],
                 observation["scope"],observation["code"],fallback,
                 int(choice in READ_ONLY and execute)))
        history=self.historical(choice) if choice in READ_ONLY else None
        if language=="en":
            if status=="approval_required":message="This decision requires specific approval before any change."
            elif status in {"deferred","proposed"}:message="I compared the alternatives but cannot justify executing an action yet."
            else:message=("I chose a read-only check and confirmed its postcondition." if status=="checked"
                          else "I tried the read-only check, but the postcondition was not confirmed.")
        else:
            if status=="approval_required":message="Esta decisão exige autorização específica antes de qualquer alteração."
            elif status in {"deferred","proposed"}:message="Comparei as alternativas, mas ainda não tenho fundamento para executar uma ação."
            else:message=("Escolhi uma consulta de leitura e confirmei o resultado observado." if status=="checked"
                          else "Executei a consulta de leitura, mas não confirmei o resultado esperado.")
        if source=="laya" and preferences and model_choice:
            preference=round(preferences[model_choice]*100,1)
            label=ACTION_DESCRIPTIONS[model_choice]
            message+=(" O Laya sugeriu: "+label+" Preferência relativa: "+str(preference)+"% (não é probabilidade de sucesso)."
                      if language!="en" else
                      " Laya suggested: "+label+" Relative preference: "+str(preference)+"% (not a success probability).")
        elif source=="deterministic_fallback":
            message+=(" O Laya não respondeu validamente; apliquei a alternativa determinística segura."
                      if language!="en" else
                      " Laya was unavailable or invalid; I used the safe deterministic fallback.")
        return {"source":"travis-decision-governor","version":VERSION,
                "decisionId":cid,"domain":domain,"alternatives":options,
                "selected":choice,"status":status,
                "layaPreferred":model_choice,
                "modelSource":source,"model":model,
                "relativePreferences":preferences,"scoreSemantics":"preference_not_success_probability",
                "fallbackReason":fallback,"verification":observation,
                "historicalObservedRate":history,"reply":message}

    def status(self):
        with self.db() as db:
            rows=db.execute("""SELECT selected,status,COUNT(*),SUM(checked),
                 SUM(verdict='success'),SUM(verdict='failure')
                 FROM decisions GROUP BY selected,status ORDER BY selected,status""").fetchall()
            total=db.execute("SELECT COUNT(*) FROM decisions").fetchone()[0]
            integrity=db.execute("PRAGMA quick_check").fetchone()[0]
        return {"ok":integrity=="ok","version":VERSION,"decisions":total,
                "records":[{"selected":r[0],"status":r[1],"count":r[2],
                            "checks":int(r[3] or 0),"successes":int(r[4] or 0),
                            "failures":int(r[5] or 0)} for r in rows],
                "layaRole":"relative-choice-preference",
                "safety":"read_only_actions_only_no_unattended_mutations",
                "learning":"independent_local_postconditions_not_model_weight_update"}

if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("action",choices=("decide","status"))
    p.add_argument("text",nargs="?",default="")
    p.add_argument("--state-dir",default=str(Path.home()/".centro-jarvis"))
    a=p.parse_args()
    governor=DecisionGovernor(a.state_dir)
    print(json.dumps(governor.status() if a.action=="status" else governor.decide(a.text),
          ensure_ascii=False,indent=2))
