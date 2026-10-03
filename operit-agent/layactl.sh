#!/usr/bin/env sh
set -eu

HOME_DIR="${HOME:-/root}"
STATE_DIR="$HOME_DIR/.centro-laya"
VENV="$STATE_DIR/venv"
PID_FILE="$STATE_DIR/laya.pid"
LOG_FILE="$STATE_DIR/laya.log"
RUNNER="$STATE_DIR/run_server.py"
HOST="127.0.0.1"
PORT="18790"

mkdir -p "$STATE_DIR"

health() {
  python3 - "$PORT" <<'PY' >/dev/null 2>&1
import sys, urllib.request
port=sys.argv[1]
with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=3) as r:
    raise SystemExit(0 if r.status == 200 else 1)
PY
}

is_running() {
  [ -f "$PID_FILE" ] || return 1
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$PID" ] || return 1
  kill -0 "$PID" 2>/dev/null
}

start_laya() {
  if health; then
    echo "Laya já está ONLINE em $HOST:$PORT"
    return 0
  fi
  BIN="$VENV/bin/laya-serve"
  if [ ! -x "$BIN" ]; then
    echo "Laya ainda não está instalado."
    echo "Executa: layainstall"
    exit 127
  fi

  if is_running; then
    echo "Processo Laya existe mas o health ainda não responde. PID $(cat "$PID_FILE")"
    exit 1
  fi

  export LAYA_HOST="$HOST"
  export LAYA_PORT="$PORT"
  export LAYA_PRELOAD="1"
  export LAYA_MODELS="multilingual"
  export LAYA_DEFAULT_MODEL="multilingual"
  export LAYA_THREADS="${LAYA_THREADS:-4}"
  export OMP_NUM_THREADS="${OMP_NUM_THREADS:-4}"
  export MKL_NUM_THREADS="${MKL_NUM_THREADS:-4}"
  export LAYA_JEV_STRICT="${LAYA_JEV_STRICT:-0}"

  cat >"$RUNNER" <<'PY'
import os
import torch

threads = max(1, int(os.environ.get("LAYA_THREADS", "4")))
torch.set_num_threads(threads)
try:
    torch.set_num_interop_threads(1)
except RuntimeError:
    pass

from laya.serve import main
main()
PY

  nohup "$VENV/bin/python" "$RUNNER" >>"$LOG_FILE" 2>&1 </dev/null &
  PID=$!
  echo "$PID" > "$PID_FILE"

  i=0
  while [ "$i" -lt 90 ]; do
    if health; then
      echo "Laya ONLINE · PID $PID · $HOST:$PORT"
      echo "Log: $LOG_FILE"
      return 0
    fi
    if ! kill -0 "$PID" 2>/dev/null; then
      break
    fi
    sleep 1
    i=$((i + 1))
  done

  echo "Laya não ficou saudável ao arrancar."
  tail -n 60 "$LOG_FILE" 2>/dev/null || true
  exit 1
}

stop_laya() {
  if ! is_running; then
    rm -f "$PID_FILE"
    echo "Laya já está parado."
    return 0
  fi
  PID="$(cat "$PID_FILE")"
  kill "$PID" 2>/dev/null || true
  i=0
  while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 15 ]; do
    sleep 1
    i=$((i + 1))
  done
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "Laya parado."
}

status_laya() {
  echo "LAYA"
  if [ -x "$VENV/bin/laya" ]; then
    VERSION="$("$VENV/bin/python" -c 'import laya; print(getattr(laya,"__version__","instalado"))' 2>/dev/null || true)"
    echo "CLI: OK · ${VERSION:-instalado}"
  else
    echo "CLI: FALTA"
  fi
  if health; then
    echo "Servidor: ONLINE"
    echo "Endereço: $HOST:$PORT"
  else
    echo "Servidor: OFFLINE"
  fi
  if is_running; then
    echo "PID: $(cat "$PID_FILE")"
  fi
}

logs_laya() {
  touch "$LOG_FILE"
  tail -n 100 -f "$LOG_FILE"
}

case "${1:-status}" in
  start) start_laya ;;
  stop) stop_laya ;;
  restart) stop_laya || true; start_laya ;;
  status) status_laya ;;
  logs) logs_laya ;;
  *)
    echo "Uso: layactl {start|stop|restart|status|logs}"
    exit 2
    ;;
esac
