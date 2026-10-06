#!/usr/bin/env bash
set -euo pipefail
STATE="${HOME}/.centro-jarvis"
SCRIPT_ROOT="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd)"
if [ -f "$HOME/jarvis_local.py" ] && [ -f "$HOME/jarvis_voice.html" ]; then SCRIPT_ROOT="$HOME"; fi
SOURCE="${JARVIS_SOURCE:-$SCRIPT_ROOT}"
mkdir -p "$STATE"
stop_router() {
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
}
case "${1:-doctor}" in
 start)
  if [ -f "$STATE/router.pid" ] && kill -0 "$(cat "$STATE/router.pid")" 2>/dev/null; then echo "Jarvis activo"; exit; fi
  nohup /usr/bin/python3 "$SOURCE/jarvis_local.py" serve >>"$STATE/router.log" 2>&1 </dev/null &
  echo $! > "$STATE/router.pid"
  echo "Jarvis: http://127.0.0.1:8770"
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
