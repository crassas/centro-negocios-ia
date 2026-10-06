#!/usr/bin/env bash
set -euo pipefail
STATE="${HOME}/.centro-jarvis"
SCRIPT_ROOT="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd)"
SOURCE="${JARVIS_SOURCE:-$SCRIPT_ROOT}"
mkdir -p "$STATE"
case "${1:-doctor}" in
 start)
  if [ -f "$STATE/router.pid" ] && kill -0 "$(cat "$STATE/router.pid")" 2>/dev/null; then echo "Jarvis activo"; exit; fi
  nohup /usr/bin/python3 "$SOURCE/jarvis_local.py" serve >>"$STATE/router.log" 2>&1 </dev/null &
  echo $! > "$STATE/router.pid"
  echo "Jarvis: http://127.0.0.1:8770"
  ;;
 stop)
  /usr/bin/python3 - "$STATE/router.pid" <<'PY'
import os,signal,sys
from pathlib import Path
p=Path(sys.argv[1])
try:
 pid=int(p.read_text())
 if b"jarvis_local.py" in Path(f"/proc/{pid}/cmdline").read_bytes():os.kill(pid,signal.SIGTERM)
except (OSError,ValueError):pass
p.unlink(missing_ok=True)
PY
  /usr/bin/python3 "$SOURCE/jarvis_local.py" llm-stop ;;
 restart) "$0" stop; "$0" start ;;
 status|doctor) /usr/bin/python3 "$SOURCE/jarvis_local.py" doctor ;;
 ask) shift; /usr/bin/python3 "$SOURCE/jarvis_local.py" ask "$*" ;;
 llm-start) /usr/bin/python3 "$SOURCE/jarvis_local.py" llm-start "${2:-small}" ;;
 llm-stop) /usr/bin/python3 "$SOURCE/jarvis_local.py" llm-stop ;;
 *) echo 'Uso: jarvisctl start|stop|restart|doctor|ask|llm-start|llm-stop'; exit 2 ;;
esac
