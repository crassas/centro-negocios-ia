#!/usr/bin/env sh
set -eu

HOME_DIR="${HOME:-/root}"
STATE_DIR="$HOME_DIR/.centro-openclaw"
PID_FILE="$STATE_DIR/gateway.pid"
LOG_FILE="$STATE_DIR/gateway.log"
PORT="18789"

mkdir -p "$STATE_DIR"

find_openclaw() {
  if command -v openclaw >/dev/null 2>&1; then
    command -v openclaw
    return 0
  fi
  for P in "$HOME_DIR/.local/bin/openclaw" "/usr/local/bin/openclaw" "/usr/bin/openclaw"; do
    if [ -x "$P" ]; then
      echo "$P"
      return 0
    fi
  done
  return 1
}

health() {
  python3 - "$PORT" <<'PY' >/dev/null 2>&1
import sys, urllib.request
port=sys.argv[1]
with urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz", timeout=3) as r:
    raise SystemExit(0 if 200 <= r.status < 500 else 1)
PY
}

managed_running() {
  [ -f "$PID_FILE" ] || return 1
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$PID" ] || return 1
  kill -0 "$PID" 2>/dev/null
}

start_gateway() {
  if health; then
    echo "OpenClaw Gateway já está ONLINE em 127.0.0.1:$PORT"
    return 0
  fi

  OPENCLAW="$(find_openclaw || true)"
  if [ -z "$OPENCLAW" ]; then
    echo "OpenClaw CLI não encontrado."
    exit 127
  fi

  if managed_running; then
    PID="$(cat "$PID_FILE")"
    NOW="$(date +%s 2>/dev/null || echo 0)"
    MTIME="$(stat -c %Y "$PID_FILE" 2>/dev/null || echo 0)"
    AGE=$((NOW - MTIME))
    if [ "$NOW" -gt 0 ] && [ "$MTIME" -gt 0 ] && [ "$AGE" -ge 120 ]; then
      echo "Processo OpenClaw preso há ${AGE}s; a reciclar PID $PID."
      kill "$PID" 2>/dev/null || true
      sleep 2
      kill -9 "$PID" 2>/dev/null || true
      rm -f "$PID_FILE"
    else
      echo "Processo OpenClaw existe mas ainda está a arrancar. PID $PID · idade ${AGE}s"
      exit 1
    fi
  fi

  rm -f "$PID_FILE"
  nohup "$OPENCLAW" gateway --port "$PORT" >>"$LOG_FILE" 2>&1 </dev/null &
  PID=$!
  echo "$PID" > "$PID_FILE"

  i=0
  while [ "$i" -lt 15 ]; do
    if health; then
      echo "OpenClaw Gateway iniciado. PID $PID · 127.0.0.1:$PORT"
      echo "Log: $LOG_FILE"
      return 0
    fi
    if ! kill -0 "$PID" 2>/dev/null; then
      break
    fi
    sleep 1
    i=$((i + 1))
  done

  echo "OpenClaw não ficou saudável ao arrancar."
  tail -n 40 "$LOG_FILE" 2>/dev/null || true
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
  fi
  exit 1
}

stop_gateway() {
  if ! managed_running; then
    rm -f "$PID_FILE"
    if health; then
      echo "OpenClaw está ONLINE, mas não foi iniciado pelo Centro. Não vou terminar um processo externo."
    else
      echo "OpenClaw Gateway já está parado."
    fi
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
  echo "OpenClaw Gateway parado."
}

status_gateway() {
  OPENCLAW="$(find_openclaw || true)"
  echo "OPENCLAW"
  if [ -n "$OPENCLAW" ]; then
    VERSION="$("$OPENCLAW" --version 2>/dev/null || true)"
    echo "CLI: OK · ${VERSION:-versão desconhecida}"
  else
    echo "CLI: FALTA"
  fi

  if health; then
    echo "Gateway: ONLINE"
    echo "Endereço: 127.0.0.1:$PORT"
  else
    echo "Gateway: OFFLINE"
    echo "Endereço esperado: 127.0.0.1:$PORT"
  fi

  if managed_running; then
    echo "PID Centro: $(cat "$PID_FILE")"
  else
    echo "PID Centro: -"
  fi
}

logs_gateway() {
  touch "$LOG_FILE"
  tail -n 100 -f "$LOG_FILE"
}

restart_gateway() {
  if managed_running; then
    stop_gateway
  elif health; then
    echo "OpenClaw já está ONLINE e é gerido externamente; não reinicio."
    return 0
  fi
  start_gateway
}

case "${1:-status}" in
  start) start_gateway ;;
  stop) stop_gateway ;;
  restart) restart_gateway ;;
  status) status_gateway ;;
  logs) logs_gateway ;;
  *)
    echo "Uso: openclawctl {start|stop|restart|status|logs}"
    exit 2
    ;;
esac
