"""Functional cognitive coordination and autonomous offline reflection.

Anatomical labels are design analogies. This is not a biological brain simulation
or a consciousness detector. Dream records never become verified facts or tools.
"""
from __future__ import annotations
import contextlib, datetime, fcntl, json, math, os, re, shutil, sqlite3, threading, time, unicodedata
from pathlib import Path

REGIONS = {
    'attention': ('Tálamo', 'Entrada e encaminhamento'),
    'memory': ('Hipocampo', 'Recuperação de experiências'),
    'executive': ('Córtex pré-frontal', 'Planeamento e seleção de ações'),
    'action': ('Gânglios da base', 'Execução de ferramentas'),
    'monitor': ('Cíngulo anterior', 'Verificação de resultados e erros'),
    'regulation': ('Hipotálamo', 'Recursos, repouso e prioridade da conversa'),
    'reflection': ('Redes de associação', 'Revisão, simulação e filosofia'),
}
STOP = set('para como sobre uma uns umas que dos das com sem the and for from with this that user travis project projecto repositorio'.split())

def clean(value, limit=1200):
    value = re.sub(r'(?i)(bearer\s+\S+|(?:token|password|api.?key|secret)\s*[:=]\s*\S+|gh[pousr]_\w+|sk-\w+)', '[redigido]', str(value))
    return value[:limit]

def terms(value):
    value = ''.join(c for c in unicodedata.normalize('NFD', str(value).lower()) if not unicodedata.combining(c))
    return set(re.findall(r'[a-z0-9]{3,}', value)) - STOP

class BrainRuntime:
    def __init__(self, path, store, cognitive, *, idle_seconds=180, interval_seconds=1800,
                 daily_limit=8, clock=time.time, resources=None, generator=None):
        self.path = Path(path); self.store = store; self.cognitive = cognitive
        self.clock = clock; self.idle_seconds = idle_seconds; self.interval_seconds = interval_seconds
        self.daily_limit = daily_limit; self.resources = resources or self._resources; self.generator = generator
        self.lock = threading.RLock(); self.stop_event = threading.Event(); self.wake_event = threading.Event()
        self.active = 0; self.last_user = clock(); self.activity = {}; self.thread = None
        self.phase = 'awake'; self.reason = 'À espera de repouso'; self.last_error = ''
        self.heartbeat = None
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._backup_before_learning_migration()
        with self.db() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS brain_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS brain_events(id INTEGER PRIMARY KEY,created REAL,region TEXT,phase TEXT,detail TEXT);
            CREATE TABLE IF NOT EXISTS brain_episodes(id TEXT PRIMARY KEY,updated REAL,task TEXT,summary TEXT,status TEXT,verified INTEGER,tool TEXT);
            CREATE TABLE IF NOT EXISTS brain_associations(source TEXT,target TEXT,terms TEXT,weight REAL,updated REAL,PRIMARY KEY(source,target));
            CREATE TABLE IF NOT EXISTS brain_cycles(id TEXT PRIMARY KEY,started REAL,finished REAL,status TEXT,trigger TEXT,episodes INTEGER,associations INTEGER,error TEXT);
            CREATE TABLE IF NOT EXISTS brain_journal(id INTEGER PRIMARY KEY,cycle_id TEXT,created REAL,kind TEXT,title TEXT,body TEXT,source_ids TEXT,epistemic TEXT);
            CREATE INDEX IF NOT EXISTS brain_journal_time ON brain_journal(created DESC);
            CREATE TABLE IF NOT EXISTS brain_episode_scopes(id TEXT PRIMARY KEY,session TEXT NOT NULL,project TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS brain_memory_utility(id TEXT PRIMARY KEY,q REAL NOT NULL,samples INTEGER NOT NULL,updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS brain_learning_usage(run_id TEXT PRIMARY KEY,session TEXT NOT NULL,project TEXT NOT NULL,used_ids TEXT NOT NULL,created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS brain_learning_feedback(run_id TEXT NOT NULL,issuer TEXT NOT NULL,reward REAL NOT NULL,evidence TEXT NOT NULL,created REAL NOT NULL,PRIMARY KEY(run_id,issuer));
            INSERT OR IGNORE INTO brain_settings VALUES('paused','false');
            ''')
            c.execute("UPDATE brain_cycles SET status='interrupted',finished=?,error='Runtime restarted during cycle' WHERE status='running'", (clock(),))
        os.chmod(self.path, 0o600)

    def _backup_before_learning_migration(self):
        """Consistent one-time WAL backup before the additive schema change."""
        if not self.path.is_file() or not self.path.stat().st_size: return
        backup = self.path.with_suffix('.pre-learning-v1.sqlite')
        with self.path.with_suffix('.migration.lock').open('a') as lockfile:
            fcntl.flock(lockfile, fcntl.LOCK_EX)
            if backup.exists(): return
            temporary = backup.with_suffix('.tmp')
            try:
                with contextlib.closing(sqlite3.connect(self.path, timeout=5)) as source:
                    with contextlib.closing(sqlite3.connect(temporary)) as destination:
                        source.backup(destination)
                os.chmod(temporary, 0o600); os.replace(temporary, backup)
            finally: temporary.unlink(missing_ok=True)

    @contextlib.contextmanager
    def db(self):
        c = sqlite3.connect(self.path, timeout=5); c.row_factory = sqlite3.Row
        try:
            c.execute('PRAGMA journal_mode=WAL'); yield c; c.commit()
        except Exception:
            c.rollback(); raise
        finally: c.close()

    def _resources(self):
        available = 0
        for line in Path('/proc/meminfo').read_text().splitlines():
            if line.startswith('MemAvailable:'): available = int(line.split()[1]) // 1024
        return {'memoryMB': available, 'diskMB': shutil.disk_usage(self.path.parent).free // 1048576}

    def mark(self, region, phase, detail=''):
        if region not in REGIONS: raise ValueError('Unknown cognitive region')
        now = self.clock()
        with self.lock: self.activity[region] = {'at': now, 'phase': clean(phase, 60), 'detail': clean(detail, 180)}
        try:
            with self.db() as c:
                c.execute('INSERT INTO brain_events(created,region,phase,detail) VALUES(?,?,?,?)', (now, region, clean(phase, 60), clean(detail, 180)))
                c.execute('DELETE FROM brain_events WHERE id < (SELECT COALESCE(MAX(id),0)-600 FROM brain_events)')
        except sqlite3.Error as exc:
            # Telemetry must not break the user's foreground task.
            self.last_error = type(exc).__name__

    @contextlib.contextmanager
    def request(self, text):
        with self.lock:
            self.active += 1; self.last_user = self.clock(); self.wake_event.set(); self.phase = 'awake'
        try:
            self.mark('attention', 'received', clean(text, 140))
            yield
        finally:
            with self.lock: self.active = max(0, self.active-1); self.last_user = self.clock()

    def cancelled(self):
        return self.stop_event.is_set() or self.wake_event.is_set() or self.active > 0

    def paused(self):
        with self.db() as c: return c.execute("SELECT value FROM brain_settings WHERE key='paused'").fetchone()[0] == 'true'

    def pause(self, value):
        if type(value) is not bool: raise ValueError('paused must be boolean')
        with self.lock:
            with self.db() as c: c.execute("UPDATE brain_settings SET value=? WHERE key='paused'", ('true' if value else 'false',))
            if value: self.wake_event.set()
        return self.status()

    def eligibility(self):
        now = self.clock()
        if self.paused(): return False, 'Ciclos em pausa'
        with self.lock:
            if self.active: return False, 'Conversa ou tarefa em curso'
            if now-self.last_user < self.idle_seconds: return False, 'À espera de 3 minutos sem pedidos'
        resource = self.resources()
        if resource.get('memoryMB', 0) < 512 or resource.get('diskMB', 0) < 128: return False, 'Recursos reservados para a conversa'
        day = datetime.datetime.fromtimestamp(now, datetime.timezone.utc).strftime('%Y-%m-%d')
        with self.db() as c:
            latest = c.execute('SELECT MAX(finished) FROM brain_cycles').fetchone()[0]
            count = c.execute("SELECT COUNT(*) FROM brain_cycles WHERE strftime('%Y-%m-%d',started,'unixepoch')=?", (day,)).fetchone()[0]
        if latest and now-latest < self.interval_seconds: return False, 'Intervalo de repouso entre ciclos'
        if count >= self.daily_limit: return False, 'Limite diário de ciclos atingido'
        return True, 'Repouso confirmado'

    def _sources(self):
        # Existing stores remain authoritative; this module never rewrites their facts.
        with self.cognitive.db() as c:
            runs = [dict(r) for r in c.execute("SELECT * FROM runs WHERE status!='running' ORDER BY updated DESC LIMIT 80")]
        with contextlib.closing(self.store.connect()) as c:
            c.row_factory = sqlite3.Row
            memories = [dict(r) for r in c.execute('SELECT id,title,summary,tags,project_id,source_type,confidence FROM travis_neurons WHERE active=1 ORDER BY updated DESC LIMIT 160')]
        return runs, memories

    def _consolidate(self, runs, memories):
        associations = []
        for i, a in enumerate(memories):
            ta = terms(a['title']+' '+a['summary']+' '+a['tags'])
            for b in memories[i+1:]:
                overlap = sorted(ta & terms(b['title']+' '+b['summary']+' '+b['tags']))
                if len(overlap) >= 2:
                    source, target = sorted((a['id'], b['id']))
                    associations.append((source, target, ' '.join(overlap[:12]), min(1, len(overlap)/8), self.clock()))
        with self.db() as c:
            for r in runs:
                try: metadata = json.loads(r['metadata']); tool = metadata.get('tool', '')
                except (ValueError, TypeError): metadata = {}; tool = ''
                c.execute('INSERT OR REPLACE INTO brain_episodes VALUES(?,?,?,?,?,?,?)',
                    (r['id'], r['updated'], clean(r['task'], 600), clean(r['result_summary'] or r['failure'], 900), r['status'], r['verified'], clean(tool, 80)))
                c.execute('INSERT OR IGNORE INTO brain_episode_scopes VALUES(?,?,?)',
                          (r['id'], str(metadata.get('session') or '')[:80], str(metadata.get('project') or '')[:80]))
            c.execute('DELETE FROM brain_associations')
            c.executemany('INSERT INTO brain_associations VALUES(?,?,?,?,?)', associations)
        return len(associations)

    def _record_journal(self, cycle, kind, title, body, sources, epistemic):
        with self.db() as c:
            c.execute('INSERT INTO brain_journal(cycle_id,created,kind,title,body,source_ids,epistemic) VALUES(?,?,?,?,?,?,?)',
                      (cycle, self.clock(), kind, title, json.dumps(body, ensure_ascii=False), json.dumps(sources), epistemic))

    def cycle(self):
        lockpath = self.path.with_suffix('.cycle.lock')
        with lockpath.open('a') as lockfile:
            try: fcntl.flock(lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: return {'ran': False, 'reason': 'Outro ciclo em curso'}
            eligible, reason = self.eligibility(); self.reason = reason
            if not eligible: return {'ran': False, 'reason': reason}
            with self.lock:
                if self.active or self.paused() or self.clock()-self.last_user < self.idle_seconds:
                    return {"ran": False, "reason": "Conversa retomada"}
                self.wake_event.clear()
            cycle = 'dream-'+str(time.time_ns()); start = self.clock()
            with self.db() as c: c.execute('INSERT INTO brain_cycles VALUES(?,?,NULL,?,?,0,0,?)', (cycle, start, 'running', 'automatic_idle', ''))
            try:
                self.phase = 'consolidating'; self.mark('regulation', 'rest', 'Recursos e repouso confirmados')
                self.mark('memory', 'consolidating', 'Revisão de experiências e ligações persistidas')
                runs, memories = self._sources()
                if self.cancelled(): raise InterruptedError('Conversa retomada')
                links = self._consolidate(runs, memories)
                if self.cancelled(): raise InterruptedError('Conversa retomada')
                self.phase = 'dreaming'; self.mark('reflection', 'simulating', 'Cenários hipotéticos; sem execução de ações')
                recent = runs[:6]; ids = [r['id'] for r in recent]
                unresolved = [r for r in recent if not r['verified']]
                with self.db() as c:
                    ordinal = c.execute("SELECT COUNT(*) FROM brain_cycles WHERE status='completed'").fetchone()[0]
                candidates = unresolved or recent
                focus = candidates[ordinal % len(candidates)] if candidates else None
                question = clean(focus['task'], 260) if focus else 'Como distinguir uma suposição de conhecimento confirmado?'
                dream = {'scenario': 'E se o mesmo pedido surgisse com informação incompleta: '+question,
                         'alternative': 'Recuperar experiências relacionadas e comparar duas hipóteses antes de escolher uma ação.',
                         'test': 'Verificar a pós-condição da ferramenta e guardar a evidência; uma resposta plausível permanece por confirmar.',
                         'observations': {'reviewedRuns': len(runs), 'unverifiedRecent': len(unresolved)},
                         'generatedBy': 'structured-local-simulation'}
                reflection = {'question': 'Quando é legítimo afirmar que sei alguma coisa?',
                              'thesis': 'Nos pedidos revistos, uma afirmação operacional exige uma observação verificável.',
                              'objection': 'Um teste isolado pode passar por acaso; a ausência de erro também não demonstra que a resposta está correta.',
                              'test': 'Comparar a conclusão com uma explicação alternativa e indicar que observação a faria mudar.',
                              'context': question, 'generatedBy': 'structured-local-reflection'}
                topics = [
                    ('Conhecimento, dúvida e evidência', reflection),
                    ('Responsabilidade e consequências', {'question': 'Uma ação eficiente é necessariamente uma boa ação?',
                     'thesis': 'Um resultado útil exige também respeito pela intenção e pelas escolhas do utilizador.',
                     'objection': 'A mesma ação pode beneficiar um objetivo e prejudicar outro; a rapidez não resolve esse conflito.',
                     'test': 'Identificar as pessoas afetadas e comparar as consequências de agir, adiar e pedir esclarecimento.'}),
                    ('Memória e identidade', {'question': 'Guardar experiências basta para manter uma identidade ao longo do tempo?',
                     'thesis': 'A memória permite continuidade operacional, mas não demonstra uma experiência subjetiva.',
                     'objection': 'Dois sistemas com as mesmas memórias podem tomar decisões diferentes quando o contexto muda.',
                     'test': 'Comparar decisões perante o mesmo problema com e sem uma experiência relevante; distinguir comportamento de consciência.'}),
                    ('Autonomia e escolha', {'question': 'Que diferença existe entre escolher e seguir uma regra?',
                     'thesis': 'Comparar alternativas e justificar uma escolha torna a decisão examinável.',
                     'objection': 'A justificação pode ter sido construída depois da decisão; coerência verbal não prova liberdade.',
                     'test': 'Registar alternativas antes da ação e verificar se novas evidências alteram a decisão.'}),
                ]
                reflection_title, reflection = topics[ordinal % len(topics)]
                reflection.update(context=question, generatedBy='structured-local-reflection')
                if self.generator and not self.cancelled():
                    prompt = json.dumps({'task': question, 'observedOutcomes': [{'id':r['id'],'status':r['status'],'verified':bool(r['verified'])} for r in recent],
                        'philosophicalQuestion': reflection['question'],
                        'request': 'Return only JSON with dream (a concrete imaginative counterfactual about the task) and reflection (an argument, objection and possible test about the philosophical question). Both values must be Portuguese strings, each under 65 words. Hypothetical exercises, never factual memories or consciousness claims. Do not claim to have executed actions.'}, ensure_ascii=False)
                    try:
                        generated = self.generator(prompt, self.cancelled)
                        if generated and not self.cancelled():
                            draft = json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', generated.strip()))
                            for key, target in [('dream', dream), ('reflection', reflection)]:
                                if isinstance(draft.get(key), str) and draft[key].strip():
                                    target['draft'] = clean(draft[key], 1800)
                                    target['generatedBy'] = 'local-model-draft'
                    except Exception as exc:
                        reflection['modelNote'] = 'Modelo local indisponível: '+type(exc).__name__
                if self.cancelled(): raise InterruptedError('Conversa retomada')
                self._record_journal(cycle, 'dream', 'Simulação de uma experiência', dream, ids, 'hypothesis_not_memory')
                self._record_journal(cycle, 'philosophy', reflection_title, reflection, ids, 'reflection_not_fact')
                with self.db() as c: c.execute("UPDATE brain_cycles SET finished=?,status='completed',episodes=?,associations=? WHERE id=?", (self.clock(), len(runs), links, cycle))
                self.mark('monitor', 'recorded', 'Diário guardado; hipóteses separadas de factos')
                self.phase = 'resting'; self.reason = 'Ciclo concluído'; self.last_error = ''
                return {'ran': True, 'id': cycle, 'episodes': len(runs), 'associations': links, 'journalEntries': 2}
            except InterruptedError as exc:
                with self.db() as c: c.execute("UPDATE brain_cycles SET finished=?,status='interrupted',error=? WHERE id=?", (self.clock(), str(exc), cycle))
                self.phase = 'awake'; return {'ran': False, 'interrupted': True}
            except Exception as exc:
                self.last_error = type(exc).__name__; self.phase = 'awake'
                with self.db() as c: c.execute("UPDATE brain_cycles SET finished=?,status='failed',error=? WHERE id=?", (self.clock(), self.last_error, cycle))
                return {'ran': False, 'error': self.last_error}

    def recall_context(self, query, limit=2, session='', project=''):
        wanted = terms(query)
        if not wanted: return ''
        with self.db() as c:
            rows = [dict(r) for r in c.execute('''SELECT e.*,COALESCE(u.q,0.5) AS utility
              FROM brain_episodes e LEFT JOIN brain_memory_utility u ON e.id=u.id
              LEFT JOIN brain_episode_scopes s ON e.id=s.id
              WHERE COALESCE(s.session,'')=? AND COALESCE(s.project,'')=?
              ORDER BY e.updated DESC LIMIT 400''', (session, project))]
        ranked = []
        for row in rows:
            have = terms(row['task']); overlap = len(wanted & have)
            if overlap < 2: continue
            relevance = overlap / math.sqrt(len(wanted)*len(have))
            freshness = math.exp(-max(0,self.clock()-row['updated'])/(30*86400))
            ranked.append((0.60*relevance+0.35*row['utility']+0.05*freshness, row))
        selected = [r for score,r in sorted(ranked,key=lambda x:x[0],reverse=True)][:max(1,min(5,int(limit)))]
        if selected: self.mark('memory', 'recalled', str(len(selected))+' experiências recuperadas')
        # Keep each JSON record complete: the prompt builder counts only included rows.
        return '\n'.join(json.dumps({'source': r['id'], 'request':clean(r['task'],90),
            'outcome':clean(r['summary'],140), 'verified':bool(r['verified']),
            'utility':round(r['utility'],4)},ensure_ascii=False) for r in selected)

    def _reward(self, c, run_id, reward, issuer, evidence):
        old = c.execute('SELECT reward,evidence FROM brain_learning_feedback WHERE run_id=? AND issuer=?', (run_id,issuer)).fetchone()
        if old:
            if old['reward'] != reward: raise ValueError('Este resultado já recebeu uma avaliação diferente.')
            return {'duplicate':True,'updates':[]}
        use = c.execute('SELECT * FROM brain_learning_usage WHERE run_id=?', (run_id,)).fetchone()
        if use is None: raise ValueError('Experiência desconhecida.')
        changes = []
        # The current episode becomes reusable too; source credit is approximate.
        for mid in dict.fromkeys([run_id]+json.loads(use['used_ids'])):
            row = c.execute('SELECT q,samples FROM brain_memory_utility WHERE id=?', (mid,)).fetchone()
            before, samples = (row['q'],row['samples']) if row else (0.5,0)
            after = before+0.2*(reward-before)
            c.execute('INSERT INTO brain_memory_utility VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET q=excluded.q,samples=excluded.samples,updated=excluded.updated',
                      (mid,after,samples+1,self.clock()))
            changes.append({'source':mid,'before':round(before,6),'after':round(after,6)})
        c.execute('INSERT INTO brain_learning_feedback VALUES(?,?,?,?,?)', (run_id,issuer,reward,clean(evidence,500),self.clock()))
        return {'duplicate':False,'updates':changes}

    def record_outcome(self, run_id, verification, used_ids=(), session='', project='', summary=None):
        """Host verifier only. Unknown prose stays unknown and receives no reward."""
        run = self.cognitive.run(run_id)
        if not run or run['status']=='running': raise ValueError('Experiência ainda não concluída.')
        verdict = verification.get('verdict')
        if verdict not in {'success','failure','unknown'}: raise ValueError('Verificação inválida.')
        try: tool = json.loads(run['metadata']).get('tool','')
        except (ValueError,TypeError): tool = ''
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            existing = c.execute('SELECT * FROM brain_learning_usage WHERE run_id=?',(run_id,)).fetchone()
            if existing:
                if existing['session']!=session or existing['project']!=project: raise ValueError('Âmbito incompatível.')
                return {'runId':run_id,'duplicate':True,'verdict':verdict,'usedMemories':len(json.loads(existing['used_ids']))}
            valid = []
            for mid in list(dict.fromkeys(used_ids))[:5]:
                found = c.execute('SELECT 1 FROM brain_episodes e LEFT JOIN brain_episode_scopes s ON e.id=s.id WHERE e.id=? AND COALESCE(s.session,\'\')=? AND COALESCE(s.project,\'\')=?', (mid,session,project)).fetchone()
                if found: valid.append(mid)
            c.execute('INSERT OR REPLACE INTO brain_episodes VALUES(?,?,?,?,?,?,?)',
                      (run_id,run['updated'],clean(run['task'],600),clean(summary if summary is not None else (run['result_summary'] or run['failure']),900),run['status'],int(run['verified']),clean(tool,80)))
            c.execute('INSERT OR REPLACE INTO brain_episode_scopes VALUES(?,?,?)',(run_id,session,project))
            c.execute('INSERT INTO brain_learning_usage VALUES(?,?,?,?,?)',(run_id,session,project,json.dumps(valid),self.clock()))
            learning = {'updates':[],'duplicate':False}
            if verdict in {'success','failure'}:
                learning = self._reward(c,run_id,1.0 if verdict=='success' else 0.0,'verifier',
                                        json.dumps(verification,ensure_ascii=False))
        return {'runId':run_id,'verdict':verdict,'usedMemories':len(valid),**learning}

    def feedback(self, run_id, session, accepted):
        if type(accepted) is not bool: raise ValueError('A avaliação deve ser um booleano.')
        if not isinstance(session,str) or not session: raise ValueError('É necessária uma sessão de conversa.')
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            row = c.execute('SELECT session FROM brain_learning_usage WHERE run_id=?',(run_id,)).fetchone()
            if row is None or row['session']!=session: raise ValueError('A experiência não pertence a esta conversa.')
            result = self._reward(c,run_id,float(accepted),'user','Explicit user feedback for this conversation')
        self.mark('monitor','learning','Avaliação do utilizador registada; utilidade das experiências actualizada')
        return {'runId':run_id,'accepted':accepted,**result}

    def graph(self, limit=120):
        """Read-only snapshot of persisted memories and persisted relations."""
        limit = max(1, min(int(limit), 120))
        with contextlib.closing(self.store.connect()) as c:
            c.row_factory = sqlite3.Row
            rows = c.execute(
                'SELECT id,title,kind,project_id,importance,confidence,updated,source_type '
                'FROM travis_neurons WHERE active=1 '
                'ORDER BY importance DESC,updated DESC LIMIT ?', (limit,)
            ).fetchall()
            nodes = [{
                'id': r['id'], 'title': clean(r['title'], 90),
                'kind': r['kind'], 'projectId': r['project_id'] or '',
                'importance': round(float(r['importance'] or 0), 3),
                'confidence': round(float(r['confidence'] or 0), 3),
                'updated': r['updated'], 'sourceType': r['source_type']
            } for r in rows]
            ids = [n['id'] for n in nodes]
            links = []
            if ids:
                marks = ','.join('?' for _ in ids)
                query = ('SELECT source_id,target_id,relation_type,weight,confidence,updated '
                         'FROM travis_synapses WHERE active=1 '
                         f'AND source_id IN ({marks}) AND target_id IN ({marks}) '
                         'ORDER BY updated DESC LIMIT 320')
                for r in c.execute(query, (*ids, *ids)):
                    links.append({
                        'source': r['source_id'], 'target': r['target_id'],
                        'relation': r['relation_type'],
                        'weight': round(float(r['weight'] or 0), 3),
                        'confidence': round(float(r['confidence'] or 0), 3),
                        'updated': r['updated'], 'provenance': 'persisted-synapse'
                    })
        return {
            'ok': True, 'source': 'local-sqlite', 'kind': 'persisted-memory-graph',
            'nodes': nodes, 'links': links, 'observedAt': self.clock(),
            'truncated': len(nodes) == limit,
            'disclaimer': 'Stored graph, not a biological brain or a model reasoning trace'
        }

    def status(self):
        now = self.clock()
        with self.db() as c:
            counts = {'episodes': c.execute('SELECT COUNT(*) FROM brain_episodes').fetchone()[0], 'associations': c.execute('SELECT COUNT(*) FROM brain_associations').fetchone()[0],
                      'cycles': c.execute("SELECT COUNT(*) FROM brain_cycles WHERE status='completed'").fetchone()[0]}
            latest = c.execute('SELECT * FROM brain_cycles ORDER BY started DESC LIMIT 1').fetchone()
            learning = {'algorithm':'episodic-utility-v1','alpha':0.2,
                        'observedRuns':c.execute('SELECT COUNT(*) FROM brain_learning_usage').fetchone()[0],
                        'feedbackEvents':c.execute('SELECT COUNT(*) FROM brain_learning_feedback').fetchone()[0],
                        'weightedMemories':c.execute('SELECT COUNT(*) FROM brain_memory_utility').fetchone()[0],
                        'modelWeightsUpdated':False}
            journal = []
            for row in c.execute('SELECT * FROM brain_journal ORDER BY id DESC LIMIT 8'):
                item = dict(row); item['body'] = json.loads(item['body']); item['source_ids'] = json.loads(item['source_ids']); journal.append(item)
        with self.lock:
            modules = [{'id': key, 'name': name, 'function': function, **self.activity.get(key, {}),
                        'active': now-self.activity.get(key, {}).get('at', 0)<18} for key,(name,function) in REGIONS.items()]
            active = self.active; last_user = self.last_user
        return {'ok': True, 'version': 1, 'kind': 'functional-cognitive-architecture', 'anatomy': 'inspired-functional-analogy',
                'phase': self.phase, 'reason': self.reason, 'modules': modules, 'counts': counts, 'journal': journal,
                'learning':learning,'heartbeatAt':self.heartbeat,
                'paused': self.paused(), 'automatic': bool(self.thread and self.thread.is_alive()), 'activeRequests': active,
                'idleSeconds': max(0, int(now-last_user)), 'idleThreshold': self.idle_seconds, 'cycleInterval': self.interval_seconds,
                'dailyLimit': self.daily_limit, 'lastCycle': dict(latest) if latest else None, 'lastError': self.last_error,
                'observedAt': now, 'consciousness': 'not_established'}

    def start(self, tick_seconds=10):
        if self.thread and self.thread.is_alive(): return
        self.stop_event.clear()
        def loop():
            while not self.stop_event.wait(tick_seconds):
                try: self.heartbeat=self.clock(); self.cycle()
                except Exception as exc: self.last_error = type(exc).__name__
        self.thread = threading.Thread(target=loop, name='travis-autonomous-reflection', daemon=True); self.thread.start()

    def stop(self):
        self.stop_event.set(); self.wake_event.set()
        if self.thread: self.thread.join(timeout=1)
