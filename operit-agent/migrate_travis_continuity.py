"""Explicit one-owner phone migration, with SQLite backup and original rows intact."""
import argparse
import json
import secrets
import sqlite3
import time
from pathlib import Path
from travis_continuity import Continuity


def migrate(root):
    root=Path(root);path=root/'memory.sqlite';identity=root/'personal-session'
    if not path.is_file():raise ValueError('Existing memory database required')
    backup=root/'continuity-backups'/str(time.time_ns());backup.mkdir(parents=True,mode=0o700)
    with sqlite3.connect(path) as source,sqlite3.connect(backup/'memory.sqlite') as dest:
        source.backup(dest)
    (backup/'memory.sqlite').chmod(0o600)
    owner=identity.read_text().strip() if identity.exists() else 'travis-personal-'+secrets.token_hex(16)
    memory=Continuity(path)
    with sqlite3.connect(path) as db:
        sessions=[r[0] for r in db.execute("SELECT DISTINCT json_extract(data,'$.session') FROM conversations WHERE json_valid(data) AND json_extract(data,'$.session') IS NOT NULL")]
        count=db.execute('SELECT count(*) FROM conversations').fetchone()[0]
        latest=db.execute('SELECT data FROM dialogue_preferences ORDER BY updated DESC LIMIT 1').fetchone()
        if latest:
            db.execute('INSERT OR IGNORE INTO dialogue_preferences VALUES(?,?,?)',(owner,time.time(),latest[0]))
    memory.import_personal_sessions(owner,sessions)
    # Old explicit declarations become retrievable, but generated answers never do.
    # Chronological order ensures a later name correction takes precedence.
    with sqlite3.connect(path) as db:
        rows=db.execute('SELECT data FROM conversations WHERE json_valid(data) ORDER BY id').fetchall()
    captured=0
    for (raw,) in rows:
        row=json.loads(raw)
        if isinstance(row,dict) and memory.capture(owner,row.get('user','')):captured+=1
    tmp=identity.with_suffix('.tmp');tmp.write_text(owner);tmp.chmod(0o600);tmp.replace(identity)
    return {'ok':True,'conversationsPreserved':count,'linkedSessions':len(sessions),
            'explicitDeclarations':captured,'backup':str(backup),'identityFile':str(identity)}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=Path.home()/'.centro-jarvis')
    p.add_argument('--personal-history',action='store_true',required=True,
                   help='Confirm this device history belongs to one person')
    args=p.parse_args();print(json.dumps(migrate(args.root),ensure_ascii=False))
