#!/usr/bin/env python3
"""Idempotent Travis skillbook recovery without a second agent or restart.

An existing optional watcher calls this every ~70 seconds. The code repairs
local skillbook references and the CLI startup guard after Centro sync.
It never replaces the Quantum runtime, opens camera feeds or authorises tools.
"""
from __future__ import annotations
import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path

HOME=Path.home()
INDEX=HOME/".centro-jarvis/skills/travis-quantum/registry.json"
ENABLED=HOME/".centro-jarvis/skills/travis-quantum/enabled"
INSTALLER=HOME/".centro-jarvis/travis-skillbook-install.py"
JARVIS=HOME/"jarvis_local.py"
CTL=Path("/usr/local/bin/jarvisctl")
BACKUPS=HOME/".centro-jarvis/backups/skills-integration-20261010"
STATUS=HOME/".centro-jarvis/skillbook-guard-status.txt"
LAST_CHECK=0.0
INTERVAL=70.0
JARVIS_MARKER="TRAVIS_QUANTUM_SKILLBOOK_V1"
CTL_MARKER="TRAVIS_QUANTUM_SKILLBOOK_STARTUP_V1"
START_ANCHOR='case "${1:-doctor}" in\n start)\n'
START_INJECTION=(
    'case "${1:-doctor}" in\n start)\n'
    "  # "+CTL_MARKER+": install local advisory skill references before Jarvis boots.\n"
    '  if [ -f "$STATE/travis-skillbook-install.py" ]; then\n'
    '    /usr/bin/python3 "$STATE/travis-skillbook-install.py" apply >/dev/null 2>&1 || true\n'
    "  fi\n"
)

def _write_atomic(path,data):
    tmp=path.with_name(path.name+".skillbook-guard.tmp")
    tmp.write_text(data,encoding="utf-8")
    os.chmod(tmp,path.stat().st_mode & 0o777)
    tmp.replace(path)

def ensure_start_hook():
    if not CTL.is_file():
        return False
    content=CTL.read_text(encoding="utf-8")
    if CTL_MARKER in content:
        return True
    if content.count(START_ANCHOR)!=1:
        return False
    updated=content.replace(START_ANCHOR,START_INJECTION,1)
    subprocess.run(["bash","-n","-"],input=updated,text=True,
                   check=True,timeout=4,capture_output=True)
    BACKUPS.mkdir(parents=True,exist_ok=True)
    digest=hashlib.sha256(content.encode()).hexdigest()[:12]
    backup=BACKUPS/("jarvisctl.before-skills."+digest)
    if not backup.exists():
        backup.write_text(content,encoding="utf-8")
    _write_atomic(CTL,updated)
    return True

def ensure_skillbook_guard(now=None):
    global LAST_CHECK
    if not ENABLED.is_file() or not INDEX.is_file() or not INSTALLER.is_file():
        return False
    now=time.monotonic() if now is None else now
    if now-LAST_CHECK<INTERVAL:
        return True
    LAST_CHECK=now
    try:
        hook=ensure_start_hook()
        patched=JARVIS.is_file() and JARVIS_MARKER in JARVIS.read_text(encoding="utf-8")
        if not patched:
            result=subprocess.run(
                [sys.executable,str(INSTALLER),"apply"],
                check=False,capture_output=True,text=True,timeout=12
            )
            patched=result.returncode==0 and JARVIS_MARKER in JARVIS.read_text(encoding="utf-8")
        report="hook="+str(int(hook))+" patched_file="+str(int(patched))+" observer=NO_RESTART\n"
        STATUS.write_text(report,encoding="utf-8")
        return hook and patched
    except (OSError,ValueError,subprocess.SubprocessError) as exc:
        print("[travis-skills] recovery declined:",type(exc).__name__,flush=True)
        return False

if __name__=="__main__":
    print("skillbook guard:",ensure_skillbook_guard())
