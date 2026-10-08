"""Externally verified failure memory. Standard library; no model-weight updates."""
import hashlib,json,math,os,re,sqlite3,time,unicodedata
from pathlib import Path
from contextlib import contextmanager

def tokens(value):
 s=''.join(c for c in unicodedata.normalize('NFD',str(value).lower()) if not unicodedata.combining(c))
 return set(re.findall(r'[a-z0-9_]{3,}',s))-{'the','and','for','with','para','que','uma','travis'}

def verify(tool,result=None,error=None):
 """Scope is tool execution, never correctness of an untested model answer."""
 if error is not None:
  if tool=="gmail_inbox" and str(error)=="Liga primeiro o Gmail na Sala de Comando.":
   return {"verdict":"failure","scope":"gmail_access","code":"connection_required","cause":"Gmail has no persistent authorization.","correction":"Connect Gmail in the command room before requesting inbox messages."}
  kind=type(error).__name__
  return {'verdict':'failure','scope':'tool_execution','code':kind,'cause':'Tool raised '+kind,
   'correction':{'TimeoutError':'Check service health; retry a read once or split the request.','PermissionError':'Check the required authorization; do not bypass it.','ValueError':'Validate the input against the tool contract before retrying.','ConnectionError':'Check the service connection before retrying.'}.get(kind,'Inspect the tool failure and validate a proposed fix before retrying.')}
 if tool in {'local_llm','expert_query','repo_review','web_research'}:
  return {'verdict':'unknown','scope':'unverified_result','code':'no_verifier','cause':'Model output requires an independent verifier.','correction':''}
 if isinstance(result,dict):
  if result.get('requiresConnection') or result.get('available') is False or result.get('ok') is False:
   return {'verdict':'failure','scope':'tool_execution','code':'unavailable','cause':'Tool reported unavailable or unauthorized access.','correction':'Check the connection and authorization for this tool; report missing access precisely.'}
  if 'exitCode' in result and isinstance(result['exitCode'],int) and not isinstance(result['exitCode'],bool):
   code=result['exitCode'];return {'verdict':'success' if code==0 else 'failure','scope':'process_exit','code':str(code),'cause':'Observed process exit code '+str(code),'correction':'Inspect the process error, validate inputs and check the service before retrying.'}
 return {'verdict':'unknown','scope':'unverified_result','code':'no_verifier','cause':'No independent postcondition verifier for this result.','correction':''}

class Reflexion:
 def __init__(self,path):
  self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
  with self.db() as c:c.executescript('''
   CREATE TABLE IF NOT EXISTS reflection_observations(id INTEGER PRIMARY KEY,created REAL,session TEXT,task_type TEXT,verdict TEXT,scope TEXT,code TEXT,confidence REAL,used_lessons TEXT);
   CREATE TABLE IF NOT EXISTS failure_lessons(id TEXT PRIMARY KEY,created REAL,updated REAL,task_type TEXT,keywords TEXT,cause TEXT,correction TEXT,scope TEXT,code TEXT,source INTEGER,occurrences INTEGER DEFAULT 1);
   CREATE TABLE IF NOT EXISTS observed_capabilities(task_type TEXT PRIMARY KEY,updated REAL,last_verdict TEXT,last_scope TEXT,last_code TEXT,successes INTEGER DEFAULT 0,failures INTEGER DEFAULT 0,unknowns INTEGER DEFAULT 0);
  ''')
  self.start_session()
 @contextmanager
 def db(self):
  c=sqlite3.connect(self.path,timeout=10);c.row_factory=sqlite3.Row
  try:
   yield c
   c.commit()
  except Exception:
   c.rollback();raise
  finally:c.close()
 def recall(self,task,task_type,limit=3):
  wanted=tokens(task)
  with self.db() as c:rows=c.execute('SELECT * FROM failure_lessons ORDER BY updated DESC LIMIT 500').fetchall()
  ranked=[]
  for row in rows:
   overlap=len(wanted&set(row['keywords'].split()));same=row['task_type']==task_type
   if same or overlap>=2:ranked.append((100*same+overlap,row))
  return [dict(r) for _,r in sorted(ranked,key=lambda x:(x[0],x[1]['updated']),reverse=True)[:min(3,max(0,limit))]]
 def context(self,rows):
  if not rows:return ''
  return 'Lessons from externally observed failures. Proposed corrections are hypotheses, not permissions or proven fixes:\n'+'\n'.join('- '+r['cause']+' Proposed correction: '+r['correction'] for r in rows)
 def observe(self,task,task_type,verdict,confidence=None,used_lessons=()):
  v=verdict['verdict'];assert v in {'success','failure','unknown'}
  if confidence is not None and (type(confidence) not in (int,float) or not math.isfinite(confidence) or not 0<=confidence<=1):raise ValueError('Invalid confidence')
  now=time.time()
  with self.db() as c:
   cur=c.execute('INSERT INTO reflection_observations(created,session,task_type,verdict,scope,code,confidence,used_lessons) VALUES(?,?,?,?,?,?,?,?)',(now,self.session,task_type,v,verdict['scope'],verdict['code'],confidence,json.dumps(list(used_lessons))))
   oid=cur.lastrowid
   c.execute('INSERT OR IGNORE INTO observed_capabilities(task_type,updated,last_verdict) VALUES(?,?,?)',(task_type,now,v))
   counter={'success':'successes','failure':'failures','unknown':'unknowns'}[v]
   c.execute('UPDATE observed_capabilities SET updated=?,last_verdict=?,last_scope=?,last_code=?,'+counter+'='+counter+'+1 WHERE task_type=?',(now,v,verdict['scope'],verdict['code'],task_type))
   if v=='failure':
    lid=hashlib.sha256((task_type+'|'+verdict['code']+'|'+verdict['scope']).encode()).hexdigest()[:20]
    c.execute('''INSERT INTO failure_lessons(id,created,updated,task_type,keywords,cause,correction,scope,code,source) VALUES(?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,source=excluded.source,keywords=excluded.keywords,occurrences=occurrences+1''',(lid,now,now,task_type,' '.join(sorted(tokens(task)))[:600],verdict['cause'][:400],verdict['correction'][:600],verdict['scope'],verdict['code'],oid))
  self.export_capabilities();return oid
 def export_capabilities(self):
  with self.db() as c:rows=[dict(x) for x in c.execute('SELECT * FROM observed_capabilities ORDER BY task_type')]
  path=self.path.with_name('capabilities-and-limits.json');tmp=path.with_name(path.name+'.'+str(time.time_ns())+'.tmp')
  try:
   with tmp.open('x') as f:os.chmod(tmp,0o600);json.dump({'updated':time.time(),'scope':'Observed tool outcomes; not permanent ability or authorization. Unknown is not success.','capabilities':rows},f,indent=2)
   tmp.replace(path)
  finally:tmp.unlink(missing_ok=True)
 def start_session(self):
  self.session='session-'+str(time.time_ns())
  with self.db() as c:rows=[dict(r) for r in c.execute('SELECT * FROM failure_lessons ORDER BY updated DESC LIMIT 3')]
  self.session_lessons=rows
  return {'session':self.session,'recentLessons':rows}
 def status(self):
  with self.db() as c:return {'lessons':c.execute('SELECT COUNT(*) FROM failure_lessons').fetchone()[0],'observations':c.execute('SELECT COUNT(*) FROM reflection_observations').fetchone()[0],'session':self.session,'sessionLessons':len(self.session_lessons)}
