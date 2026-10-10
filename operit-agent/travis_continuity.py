"""Durable, scoped conversational recollection. Stored evidence, not consciousness.

No model-generated personal facts, automatic deletion, or global session merging.
The phone migration is explicit and retains every original conversation row.
"""
import hashlib
import json
import re
import sqlite3
import time
import unicodedata
from pathlib import Path


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFD', str(value).lower())
                   if not unicodedata.combining(c))


STOP = set('the this that with what when where your you for and how about tell remember '
           'have does can was were que uma para como onde quando meu minha teus tuas '
           'sobre isto isso quero podes lembra recorda explica qual quais disse'.split())


def terms(text):
    return set(w for w in re.findall(r'[a-z0-9]+', normalized(text))
               if len(w) > 2 and w not in STOP)


class Continuity:
    def __init__(self, path, clock=time.time):
        self.path, self.clock = Path(path), clock
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS continuity_links(owner TEXT,session TEXT,
                PRIMARY KEY(owner,session));
            CREATE TABLE IF NOT EXISTS continuity_notes(id TEXT PRIMARY KEY,
                session TEXT,slot TEXT,text TEXT,source TEXT,created REAL,
                updated REAL,uses INTEGER DEFAULT 0,active INTEGER DEFAULT 1);
            CREATE INDEX IF NOT EXISTS continuity_scope ON continuity_notes(session,active);
            CREATE TABLE IF NOT EXISTS continuity_returns(session TEXT PRIMARY KEY,
                seen REAL,history TEXT);
            CREATE VIRTUAL TABLE IF NOT EXISTS continuity_search USING fts5(
                session UNINDEXED,body,tokenize='unicode61 remove_diacritics 2');
            CREATE TABLE IF NOT EXISTS continuity_meta(key TEXT PRIMARY KEY,value INTEGER);
            ''')

    def db(self):
        return sqlite3.connect(self.path, timeout=10)

    def scopes(self, session):
        if not session:
            return []
        with self.db() as db:
            rows = db.execute('SELECT session FROM continuity_links WHERE owner=?', (session,))
            return list(dict.fromkeys([session, *(r[0] for r in rows)]))

    def import_personal_sessions(self, owner, sessions):
        """Local installation only; never expose this operation as a web tool."""
        with self.db() as db:
            db.executemany('INSERT OR IGNORE INTO continuity_links VALUES(?,?)',
                           [(owner, s) for s in sessions if re.fullmatch(r'[a-zA-Z0-9-]{8,80}', s)])

    def recent(self, session, limit=8):
        scopes = self.scopes(session)
        if not scopes:
            return []
        with self.db() as db:
            rows = db.execute("SELECT created,data FROM conversations WHERE json_valid(data) "
                              "AND json_extract(data,'$.session') IN (" + ','.join('?' for _ in scopes) +
                              ') ORDER BY id DESC LIMIT ?', (*scopes, limit)).fetchall()
        return [dict(json.loads(raw), recordedAt=created) for created, raw in reversed(rows)]

    def capture(self, session, user):
        """Only direct, bounded declarations. Never learn facts from assistant output."""
        if not session:
            return None
        text = str(user).strip()
        name = re.fullmatch(r"(?:my name is|call me|o meu nome é|chama-me|podes chamar-me)\s+([\w .'-]{1,60})[.!]?", text, re.I)
        explicit = re.fullmatch(r'(?:remember(?: that)?|lembra-te(?: de)? que|lembra que|recorda que|memoriza que|guarda que)\s+(.{1,600})', text, re.I)
        preference = re.fullmatch(r'(?:I prefer|prefiro)\s+(.{1,250})', text, re.I)
        if name:
            slot, value = 'address', name.group(1).strip(' .!')
        elif explicit or preference:
            slot, value = 'note', text
        else:
            return None
        # Secrets never become greeting/prompt material.
        if re.search(r'(?i)password|palavra.passe|api.?key|bearer\s|\btoken\b|sk-\w+', value):
            return None
        key = hashlib.sha256((session+'\0'+slot+'\0'+normalized(value)).encode()).hexdigest()[:24]
        now = self.clock()
        with self.db() as db:
            if slot == 'address':
                db.execute('UPDATE continuity_notes SET active=0 WHERE session=? AND slot=? AND id!=?', (session, slot, key))
            db.execute('''INSERT INTO continuity_notes VALUES(?,?,?,?,?,?,?,0,1)
                ON CONFLICT(id) DO UPDATE SET updated=excluded.updated,active=1''',
                (key, session, slot, value, 'explicit_user', now, now))
        return key

    def notes(self, session, query='', max_chars=650):
        scopes = self.scopes(session)
        if not scopes:
            return ''
        with self.db() as db:
            rows = db.execute('SELECT id,slot,text,updated,uses FROM continuity_notes WHERE active=1 AND session IN ('+
                              ','.join('?' for _ in scopes)+') ORDER BY updated DESC LIMIT 200', scopes).fetchall()
            words = terms(query)
            ranked = sorted(rows, key=lambda r: (r[1] == 'address', len(words & terms(r[2])), r[3], min(r[4], 5)), reverse=True)
            parts, used = [], 0
            for key, slot, text, updated, uses in ranked:
                if slot != 'address' and words and not words & terms(text):
                    continue
                line = json.dumps({'kind': slot, 'userSaid': text, 'source': 'explicit_user', 'recordedAt': updated}, ensure_ascii=False)
                if used+len(line)+1 > max_chars:
                    continue
                parts.append(line); used += len(line)+1
                db.execute('UPDATE continuity_notes SET uses=uses+1 WHERE id=?', (key,))
                if len(parts) >= 4:
                    break
        return '\n'.join(parts)

    def address(self, session):
        with self.db() as db:
            row = db.execute("SELECT text FROM continuity_notes WHERE session=? AND slot='address' AND active=1 ORDER BY updated DESC LIMIT 1", (session,)).fetchone()
        return row[0] if row else ''

    def recall(self, session, query, limit=2):
        words, scopes = terms(query), self.scopes(session)
        if not words or not scopes:
            return []
        with self.db() as db:
            # Incrementally index original dialogue. FTS rows keep original row ids.
            last = db.execute("SELECT value FROM continuity_meta WHERE key='indexed'").fetchone()
            rows = db.execute('SELECT id,data FROM conversations WHERE id>? ORDER BY id LIMIT 2000', (last[0] if last else 0,)).fetchall()
            for ident, raw in rows:
                try:
                    row = json.loads(raw)
                    if isinstance(row, dict):
                        db.execute('INSERT OR REPLACE INTO continuity_search(rowid,session,body) VALUES(?,?,?)',
                                   (ident, row.get('session', ''), str(row.get('user', ''))))
                except (TypeError, ValueError):
                    continue
            if rows:
                db.execute("INSERT OR REPLACE INTO continuity_meta VALUES('indexed',?)", (rows[-1][0],))
            search = ' OR '.join('"'+w+'"' for w in sorted(words)[:20])
            hits = db.execute('''SELECT c.created,c.data FROM continuity_search f
                JOIN conversations c ON c.id=f.rowid WHERE continuity_search MATCH ?
                AND f.session IN ('''+','.join('?' for _ in scopes)+
                ') ORDER BY bm25(continuity_search),c.id DESC LIMIT ?', (search, *scopes, limit)).fetchall()
        return [dict(json.loads(raw), recordedAt=created) for created, raw in hits]

    def begin_return(self, session, now=None):
        now = self.clock() if now is None else now
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT seen,history FROM continuity_returns WHERE session=?', (session,)).fetchone()
            history = json.loads(row[1]) if row else []
            db.execute('INSERT OR REPLACE INTO continuity_returns VALUES(?,?,?)', (session, now, json.dumps(history)))
        gap = now-row[0] if row else None
        return {'gap': gap, 'speak': gap is None or gap >= 90 or gap < 0, 'previous': history}

    def save_greeting(self, session, text):
        with self.db() as db:
            row = db.execute('SELECT history FROM continuity_returns WHERE session=?', (session,)).fetchone()
            history = json.loads(row[0]) if row else []
            db.execute('UPDATE continuity_returns SET history=? WHERE session=?',
                       (json.dumps((history+[text])[-4:], ensure_ascii=False), session))


def fallback_greeting(language, previous=(), address='', returning=True):
    # Only for an unavailable/slow model, never claimed as a generated thought.
    choices = (['Bem-vindo de volta.', 'Olá. É bom continuar a nossa conversa.',
                'Cá estamos outra vez.', 'Estou aqui. Podemos retomar com calma.',
                'Olá. Por onde queres seguir?'] if language == 'pt' else
               ['Welcome back.', 'Hello. Good to continue our conversation.',
                'Here we are again.', 'I’m here. We can pick up at your pace.',
                'Hello. Where would you like to go next?'])
    if not returning:
        choices = ['Olá. Estou aqui.', 'Olá. Por onde queres começar?'] if language == 'pt' else ['Hello. I’m here.', 'Hello. Where would you like to begin?']
    return next((x for x in choices if x not in previous), choices[0])
