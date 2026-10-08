#!/usr/bin/env python3
"""Persistent cognitive kernel for Travis.

Stores runs, tool steps and reusable lessons. It does not modify model weights.
Learning means preserving evidence-backed strategies and reusing them on later tasks.
"""
from __future__ import annotations
import json,re,secrets,sqlite3,time
from travis_reflexion import Reflexion
from contextlib import contextmanager
from pathlib import Path

WORD_RE=re.compile(r"[A-Za-zÀ-ÿ0-9_.+-]{3,}")
STOP={"the","and","for","from","with","that","this","uma","umas","uns","para","com","sem","que","como","sobre","por","dos","das","nos","nas","mais","muito","agora"}

def _tokens(text):
 out=[]
 for raw in WORD_RE.findall(str(text or "").lower()):
  token="".join(c for c in __import__("unicodedata").normalize("NFD",raw) if not __import__("unicodedata").combining(c))
  if token not in STOP:out.append(token)
 return out

def _safe_json(value,limit=12000):
 try:raw=json.dumps(value,ensure_ascii=False,separators=(",",":"))
 except Exception:raw=json.dumps(str(value),ensure_ascii=False)
 return raw[:limit]

class CognitiveKernel:
 def __init__(self,path:Path):
  self.path=Path(path)
  self._init()
  self.reflexion=Reflexion(self.path)

 def connect(self):
  self.path.parent.mkdir(parents=True,exist_ok=True)
  con=sqlite3.connect(self.path,timeout=10)
  con.row_factory=sqlite3.Row
  con.execute("PRAGMA journal_mode=WAL")
  return con

 @contextmanager
 def db(self):
  con=self.connect()
  try:
   yield con
   con.commit()
  except Exception:
   con.rollback()
   raise
  finally:con.close()

 def _init(self):
  with self.db() as con:
   con.executescript("""
   CREATE TABLE IF NOT EXISTS runs(
    id TEXT PRIMARY KEY, created REAL NOT NULL, updated REAL NOT NULL,
    task TEXT NOT NULL, task_key TEXT NOT NULL, status TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0, result_summary TEXT NOT NULL DEFAULT '',
    failure TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}'
   );
   CREATE TABLE IF NOT EXISTS steps(
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, created REAL NOT NULL,
    seq INTEGER NOT NULL, tool TEXT NOT NULL, args TEXT NOT NULL,
    status TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0,
    evidence INTEGER NOT NULL DEFAULT 0, observation TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(run_id) REFERENCES runs(id)
   );
   CREATE TABLE IF NOT EXISTS lessons(
    id INTEGER PRIMARY KEY AUTOINCREMENT, created REAL NOT NULL, updated REAL NOT NULL,
    task_key TEXT NOT NULL, keywords TEXT NOT NULL, strategy TEXT NOT NULL,
    source_run TEXT NOT NULL, successes INTEGER NOT NULL DEFAULT 0,
    failures INTEGER NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0, UNIQUE(task_key,strategy)
   );
   CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created DESC);
   CREATE INDEX IF NOT EXISTS idx_steps_run ON steps(run_id,seq);
   CREATE INDEX IF NOT EXISTS idx_lessons_score ON lessons(score DESC,updated DESC);
   """)

 def task_key(self,task):
  toks=_tokens(task)
  return " ".join(sorted(dict.fromkeys(toks))[:12])[:240] or "general"

 def begin(self,task,metadata=None):
  rid="cog-"+secrets.token_hex(8);now=time.time();key=self.task_key(task)
  with self.db() as con:
   con.execute("INSERT INTO runs(id,created,updated,task,task_key,status,metadata) VALUES(?,?,?,?,?,'running',?)",
    (rid,now,now,str(task)[:6000],key,_safe_json(metadata or {},4000)))
  return rid

 def add_step(self,run_id,tool,args,status,duration_ms=0,evidence=0,observation=""):
  with self.db() as con:
   seq=con.execute("SELECT COALESCE(MAX(seq),0)+1 FROM steps WHERE run_id=?",(run_id,)).fetchone()[0]
   con.execute("""INSERT INTO steps(run_id,created,seq,tool,args,status,duration_ms,evidence,observation)
                  VALUES(?,?,?,?,?,?,?,?,?)""",
    (run_id,time.time(),int(seq),str(tool)[:100],_safe_json(args,3000),str(status)[:80],
     max(0,int(duration_ms)),max(0,int(evidence)),str(observation or "")[:6000]))
   con.execute("UPDATE runs SET updated=? WHERE id=?",(time.time(),run_id))

 def finish(self,run_id,success,verified,result_summary="",failure="",verification=None):
  now=time.time()
  with self.db() as con:
   row=con.execute("SELECT task_key FROM runs WHERE id=?",(run_id,)).fetchone()
   if not row:raise ValueError("Run not found")
   steps=list(con.execute("SELECT tool,status,evidence,duration_ms FROM steps WHERE run_id=? ORDER BY seq",(run_id,)))
   unknown=verification=="unknown"
   success=bool(success) and not unknown;verified=bool(verified)
   tool_ok=sum(1 for x in steps if str(x["status"]).lower() in {"ok","verified","completed","success"})
   evidence=sum(int(x["evidence"] or 0) for x in steps)
   latency=sum(int(x["duration_ms"] or 0) for x in steps)
   score=(55 if success else 0)+(25 if verified else 0)+min(15,evidence*3)+min(5,tool_ok)-min(10,latency/20000)
   con.execute("""UPDATE runs SET updated=?,status=?,success=?,verified=?,score=?,result_summary=?,failure=?
                  WHERE id=?""",(now,"unverified" if unknown else "completed" if success else "failed",int(success),int(verified),round(score,2),
                  str(result_summary)[:6000],str(failure)[:2000],run_id))
  if success and verified:self.learn(run_id)
  elif not success and not unknown:self._penalize_related(run_id)
  return self.run(run_id)

 def learn(self,run_id):
  with self.db() as con:
   run=con.execute("SELECT * FROM runs WHERE id=?",(run_id,)).fetchone()
   steps=list(con.execute("SELECT * FROM steps WHERE run_id=? ORDER BY seq",(run_id,)))
   if not run or not steps:return None
   useful=[s for s in steps if s["tool"] not in {"presence","stop","local_llm"} and str(s["status"]).lower() not in {"failed","error"}]
   if not useful:return None
   strategy=" -> ".join(str(s["tool"]) for s in useful[:8])
   if not strategy:return None
   keywords=" ".join(_tokens(run["task"])[:20])
   verified=int(run["verified"] or 0)
   base=float(run["score"] or 0)
   old=con.execute("SELECT * FROM lessons WHERE task_key=? AND strategy=?",(run["task_key"],strategy)).fetchone()
   if old:
    successes=int(old["successes"])+1
    failures=int(old["failures"])
    v=max(int(old["verified"]),verified)
    score=self._lesson_score(successes,failures,v,base)
    con.execute("""UPDATE lessons SET updated=?,keywords=?,source_run=?,successes=?,verified=?,score=?
                   WHERE id=?""",(time.time(),keywords,run_id,successes,v,score,old["id"]))
    return int(old["id"])
   score=self._lesson_score(1,0,verified,base)
   cur=con.execute("""INSERT INTO lessons(created,updated,task_key,keywords,strategy,source_run,successes,failures,verified,score)
                      VALUES(?,?,?,?,?,?,?,?,?,?)""",
    (time.time(),time.time(),run["task_key"],keywords,strategy,run_id,1,0,verified,score))
   return cur.lastrowid

 def _penalize_related(self,run_id):
  with self.db() as con:
   run=con.execute("SELECT task_key FROM runs WHERE id=?",(run_id,)).fetchone()
   if not run:return
   rows=list(con.execute("SELECT * FROM lessons WHERE task_key=?",(run["task_key"],)))
   for row in rows:
    failures=int(row["failures"])+1
    score=self._lesson_score(int(row["successes"]),failures,int(row["verified"]),50)
    con.execute("UPDATE lessons SET updated=?,failures=?,score=? WHERE id=?",(time.time(),failures,score,row["id"]))

 def _lesson_score(self,successes,failures,verified,run_score):
  reliability=(successes+1)/(successes+failures+2)
  return round(100*(.55*reliability+.25*min(1,verified)+.20*max(0,min(1,float(run_score)/100))),2)

 def recall(self,task,limit=5):
  wanted=set(_tokens(task))
  if not wanted:return []
  with self.db() as con:rows=list(con.execute("SELECT * FROM lessons WHERE verified=1 ORDER BY score DESC,updated DESC LIMIT 300"))
  ranked=[]
  for row in rows:
   have=set(str(row["keywords"]).split())|set(str(row["task_key"]).split())
   overlap=len(wanted&have)
   if overlap<=0:continue
   rank=overlap*20+float(row["score"])
   ranked.append((rank,row))
  out=[]
  for _,row in sorted(ranked,key=lambda x:x[0],reverse=True)[:max(1,min(int(limit),20))]:
   out.append({"strategy":row["strategy"],"score":row["score"],"successes":row["successes"],
               "failures":row["failures"],"verified":bool(row["verified"]),"taskKey":row["task_key"]})
  return out

 def planning_context(self,task,limit=4):
  rows=self.recall(task,limit)
  if not rows:return ""
  lines=["Evidence-backed strategies from previous Travis runs:"]
  for row in rows:
   lines.append(f"- {row['strategy']} | score={row['score']} | successes={row['successes']} | failures={row['failures']} | verified={row['verified']}")
  return "\n".join(lines)

 def run(self,run_id):
  with self.db() as con:
   run=con.execute("SELECT * FROM runs WHERE id=?",(run_id,)).fetchone()
   if not run:return None
   steps=[dict(x) for x in con.execute("SELECT * FROM steps WHERE run_id=? ORDER BY seq",(run_id,))]
  data=dict(run);data["steps"]=steps
  for k in ("success","verified"):data[k]=bool(data[k])
  return data

 def consolidate(self,max_lessons=200):
  with self.db() as con:
   before=con.execute("SELECT COUNT(*) FROM lessons").fetchone()[0]
   con.execute("DELETE FROM lessons WHERE failures>=3 AND successes=0")
   rows=list(con.execute("SELECT id FROM lessons ORDER BY score DESC,updated DESC"))
   for row in rows[max(10,int(max_lessons)):]:con.execute("DELETE FROM lessons WHERE id=?",(row["id"],))
   con.execute("DELETE FROM runs WHERE created<?",(time.time()-90*86400,))
   after=con.execute("SELECT COUNT(*) FROM lessons").fetchone()[0]
  return {"before":before,"after":after,"removed":before-after}

 def health(self):
  with self.db() as con:
   integrity=con.execute("PRAGMA integrity_check").fetchone()[0]
   runs=con.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
   lessons=con.execute("SELECT COUNT(*) FROM lessons").fetchone()[0]
   successes=con.execute("SELECT COUNT(*) FROM runs WHERE success=1").fetchone()[0]
   verified=con.execute("SELECT COUNT(*) FROM runs WHERE verified=1").fetchone()[0]
  return {"ok":integrity=="ok","integrity":integrity,"runs":runs,"lessons":lessons,
          "successfulRuns":successes,"verifiedRuns":verified}
