#!/usr/bin/env bash
set -euo pipefail
STATE="${HOME}/.centro-jarvis"
SCRIPT_ROOT="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd)"
DEFAULT_SOURCE="$SCRIPT_ROOT"
if [ ! -f "$DEFAULT_SOURCE/jarvis_local.py" ] && [ -f "$HOME/jarvis_local.py" ]; then DEFAULT_SOURCE="$HOME"; fi
if [ ! -f "$DEFAULT_SOURCE/jarvis_local.py" ] && [ -f "$HOME/.centro-ui/operit-agent/jarvis_local.py" ]; then DEFAULT_SOURCE="$HOME/.centro-ui/operit-agent"; fi
if [ ! -f "$DEFAULT_SOURCE/jarvis_local.py" ] && [ -f "$HOME/repos/centro-negocios-ia/operit-agent/jarvis_local.py" ]; then DEFAULT_SOURCE="$HOME/repos/centro-negocios-ia/operit-agent"; fi
SOURCE="${JARVIS_SOURCE:-$DEFAULT_SOURCE}"
mkdir -p "$STATE"
stop_router() {
  /usr/bin/python3 - "$STATE/router.pid" "$SOURCE/jarvis_local.py" <<'PY'
import os,signal,sys,time
from pathlib import Path
pidfile=Path(sys.argv[1])
expected_script=Path(sys.argv[2]).resolve()
def owns_router(raw):
 argv=[os.fsdecode(x) for x in raw.split(b'\0') if x]
 return (len(argv)>=3 and Path(argv[0]).name.startswith('python')
         and Path(argv[1]).resolve()==expected_script and argv[2]=='serve')
pids=set()
try:
 pids.add(int(pidfile.read_text()))
except (OSError,ValueError):
 pass
for proc in Path("/proc").iterdir():
 if not proc.name.isdigit():continue
 try:
  cmd=Path(proc/"cmdline").read_bytes()
 except OSError:
  continue
 if owns_router(cmd):
  pids.add(int(proc.name))
for pid in sorted(pids):
 try:
  cmd=Path(f"/proc/{pid}/cmdline").read_bytes()
  if owns_router(cmd):os.kill(pid,signal.SIGTERM)
 except OSError:
  pass
deadline=time.monotonic()+8
while time.monotonic()<deadline:
 alive=[]
 for pid in pids:
  try:
   cmd=Path(f"/proc/{pid}/cmdline").read_bytes()
   if owns_router(cmd):alive.append(pid)
  except OSError:
   pass
 if not alive:break
 time.sleep(.1)
else:
 raise RuntimeError("O Travis ainda não terminou; novo arranque cancelado.")
pidfile.unlink(missing_ok=True)
PY
}
case "${1:-doctor}" in
 start)
  # TRAVIS_QUANTUM_SKILLBOOK_STARTUP_V1: install local advisory skill references before Jarvis boots.
  if [ -f "$STATE/travis-skillbook-install.py" ]; then
    /usr/bin/python3 "$STATE/travis-skillbook-install.py" apply >/dev/null 2>&1 || true
  fi
  if /usr/bin/python3 - <<'PYHEALTH'
import json,sys,urllib.request
try:
 with urllib.request.urlopen('http://127.0.0.1:8770/health',timeout=1) as response:d=json.load(response)
 sys.exit(0 if d.get('ok') and d.get('service')=='jarvis' else 1)
except (OSError,ValueError):sys.exit(1)
PYHEALTH
  then echo "Travis activo e confirmado"; exit; fi
  nohup /usr/bin/python3 "$SOURCE/jarvis_local.py" serve >>"$STATE/router.log" 2>&1 </dev/null &
  ROUTER_PID=$!
  echo "$ROUTER_PID" > "$STATE/router.pid"
  if ! /usr/bin/python3 - "$ROUTER_PID" <<'PY'
import os,sys,time,urllib.request,json
from pathlib import Path
pid=int(sys.argv[1]);deadline=time.monotonic()+8
while time.monotonic()<deadline:
 try:
  os.kill(pid,0)
  with urllib.request.urlopen('http://127.0.0.1:8770/health',timeout=1) as response:
   if json.load(response).get('ok'):sys.exit(0)
 except (OSError,ValueError):pass
 time.sleep(.2)
sys.exit(1)
PY
  then
   echo "Travis não ficou disponível. Último erro:"
   tail -n 12 "$STATE/router.log"
   exit 1
  fi
  echo "Travis: http://127.0.0.1:8770"
  ;;
 stop)
  stop_router
  /usr/bin/python3 "$SOURCE/jarvis_local.py" llm-stop ;;
 reload) stop_router; "$0" start ;;
 restart) "$0" stop; "$0" start ;;
 status|doctor) /usr/bin/python3 "$SOURCE/jarvis_local.py" doctor ;;
 ask) shift; /usr/bin/python3 "$SOURCE/jarvis_local.py" ask "$*" ;;
 llm-start) /usr/bin/python3 "$SOURCE/jarvis_local.py" llm-start "${2:-small}" ;;
 llm-stop) /usr/bin/python3 "$SOURCE/jarvis_local.py" llm-stop ;;
 *) echo 'Uso: jarvisctl start|stop|restart|doctor|ask|llm-start|llm-stop'; exit 2 ;;
esac
