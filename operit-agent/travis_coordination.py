"""Persistent observe/prioritise/verify coordination inside the existing Travis.

Browser reports are observations, never tool authority. No model inference,
camera polling, automatic action replay or consciousness claims happen here.
"""
from __future__ import annotations
import contextlib
import json
import re
import sqlite3
import threading
import time
from pathlib import Path

VALID_ID = re.compile(r'^[a-zA-Z0-9-]{8,80}$')

def bounded(value, limit=180):
    return re.sub(r'[\x00-\x1f]', ' ', str(value or ''))[:limit]

class Coordinator:
    def __init__(self, path, clock=time.time):
        self.path, self.clock = Path(path), clock
        self.stop_event = threading.Event()
        self.thread = None
        self.heartbeat = None
        self.ticks = 0
        self.phase = 'starting'
        self.last_error = ''
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS coordination_goals(
                session TEXT,id TEXT,request TEXT,state TEXT,result TEXT,
                created REAL,updated REAL,PRIMARY KEY(session,id));
              CREATE TABLE IF NOT EXISTS coordination_events(
                session TEXT,id TEXT,phase TEXT,observed REAL,payload TEXT,
                PRIMARY KEY(session,id,phase));
              CREATE TABLE IF NOT EXISTS coordination_views(
                session TEXT PRIMARY KEY,observed REAL,payload TEXT);
            ''')
        self.path.chmod(0o600)

    @contextlib.contextmanager
    def db(self):
        db=sqlite3.connect(self.path,timeout=3)
        db.row_factory=sqlite3.Row
        try:
            with db:yield db
        finally:db.close()

    def receive(self, session, event):
        if not VALID_ID.fullmatch(session or ''):raise ValueError('Invalid session')
        action=event.get('action')
        now=self.clock()
        if action=='observe':
            supplied=event.get('display') or {}
            if not isinstance(supplied,dict):raise ValueError('Invalid observation')
            view={k:bounded(supplied.get(k)) for k in ('scene','title','sourceId','mediaType')}
            view['active']=supplied.get('active') is True
            view['playing']=supplied.get('playing') is True
            view['source']='browser_report'
            with self.db() as db:
                db.execute('INSERT OR REPLACE INTO coordination_views VALUES(?,?,?)',
                           (session,now,json.dumps(view,ensure_ascii=False)))
            return {'ok':True,'recorded':True,'source':'browser_report'}
        ident=event.get('id')
        if not isinstance(ident,str) or not VALID_ID.fullmatch(ident):raise ValueError('Invalid request id')
        if action not in ('requested','result'):raise ValueError('Invalid coordination action')
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            if action=='requested':
                request=bounded(event.get('text'),300)
                if not request:raise ValueError('Missing user request')
                inserted=db.execute('INSERT OR IGNORE INTO coordination_goals VALUES(?,?,?,?,?,?,?)',
                    (session,ident,request,'awaiting_browser','{}',now,now)).rowcount
                payload={'request':request,'authority':'existing_user_command'}
            else:
                goal=db.execute('SELECT * FROM coordination_goals WHERE session=? AND id=?',(session,ident)).fetchone()
                if goal is None:return {'ok':False,'recorded':False,'reason':'unknown-request'}
                supplied=event.get('result') or {}
                if not isinstance(supplied,dict):raise ValueError('Invalid result')
                kind=supplied.get('kind') if supplied.get('kind') in ('snapshot','video') else 'unverified'
                observed=supplied.get('verified') is True and kind!='unverified' and bool(supplied.get('sourceId'))
                payload={'source':'browser_report','mediaType':kind,'sourceId':bounded(supplied.get('sourceId'),128),
                         'name':bounded(supplied.get('source')),'summary':bounded(supplied.get('reply'),240),
                         'observedPlayback':observed,'feedFreshnessVerified':False}
                state='browser_observed' if observed else 'unverified'
                inserted=db.execute('INSERT OR IGNORE INTO coordination_events VALUES(?,?,?,?,?)',
                    (session,ident,action,now,json.dumps(payload,ensure_ascii=False))).rowcount
                if inserted:db.execute('UPDATE coordination_goals SET state=?,result=?,updated=? WHERE session=? AND id=?',
                    (state,json.dumps(payload,ensure_ascii=False),now,session,ident))
            if action=='requested':
                db.execute('INSERT OR IGNORE INTO coordination_events VALUES(?,?,?,?,?)',
                    (session,ident,action,now,json.dumps(payload,ensure_ascii=False)))
        return {'ok':True,'recorded':bool(inserted),'source':'browser_report'}

    def tick(self, foreground=False, paused=False):
        now=self.clock()
        self.heartbeat=now;self.ticks+=1
        if paused:
            self.phase='paused';return
        with self.db() as db:
            db.execute("UPDATE coordination_goals SET state='unverified_timeout',updated=? WHERE state='awaiting_browser' AND created<?",(now,now-120))
            pending=db.execute("SELECT COUNT(*) FROM coordination_goals WHERE state='awaiting_browser'").fetchone()[0]
        self.phase='foreground_priority' if foreground else 'awaiting_result' if pending else 'observing'

    def context(self, session, limit=650):
        if not VALID_ID.fullmatch(session or ''):return ''
        now=self.clock();rows=[]
        with self.db() as db:
            view=db.execute('SELECT * FROM coordination_views WHERE session=?',(session,)).fetchone()
            goal=db.execute('SELECT * FROM coordination_goals WHERE session=? ORDER BY updated DESC LIMIT 1',(session,)).fetchone()
        if view and 0<=now-view['observed']<=45:
            rows.append({'currentDisplay':json.loads(view['payload']),'observedAt':view['observed']})
        if goal:
            full=json.loads(goal['result'])
            result={k:full[k] for k in ('mediaType','sourceId','name','observedPlayback','feedFreshnessVerified') if k in full}
            rows.append({'lastCameraRequest':goal['request'][:100],'state':goal['state'],
                         'result':result,'observedAt':goal['updated'],'current':False})
        output=[];used=0
        for row in rows:
            line=json.dumps(row,ensure_ascii=False,separators=(',',':'))
            if used+len(line)+1<=limit:output.append(line);used+=len(line)+1
        return '\n'.join(output)

    def status(self):
        with self.db() as db:
            counts=dict(db.execute('SELECT state,count(*) FROM coordination_goals GROUP BY state'))
            total=db.execute('SELECT count(*) FROM coordination_events').fetchone()[0]
        return {'algorithm':'observe-prioritise-act-receipt-verify-v1','running':bool(self.thread and self.thread.is_alive()),
                'heartbeatAt':self.heartbeat,'ticks':self.ticks,'phase':self.phase,'goals':counts,
                'events':total,'lastError':self.last_error,'automaticActionReplay':False,
                'modelWeightsUpdated':False}

    def start(self, foreground=lambda:False, paused=lambda:False, interval=5):
        if self.thread and self.thread.is_alive():return
        self.stop_event.clear()
        def run():
            while not self.stop_event.is_set():
                try:self.tick(foreground(),paused());self.last_error=''
                except Exception as exc:self.last_error=type(exc).__name__
                self.stop_event.wait(interval)
        self.thread=threading.Thread(target=run,name='travis-continuous-coordination',daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:self.thread.join(timeout=1)
