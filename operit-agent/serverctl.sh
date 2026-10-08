#!/usr/bin/env sh
set -eu

HOME_DIR="${HOME:-/root}"
SERVER="$HOME_DIR/centro_server.py"
STATE_DIR="$HOME_DIR/.centro-server"
PID_FILE="$STATE_DIR/server.pid"
LOG_FILE="$STATE_DIR/server.log"
TOKEN_FILE="$STATE_DIR/token"

mkdir -p "$STATE_DIR"

is_running() {
  [ -f "$PID_FILE" ] || return 1
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$PID" ] || return 1
  kill -0 "$PID" 2>/dev/null
}

adopt_server() {
  EXISTING_PID="$(python3 "$SERVER" --probe-pid 2>/dev/null)" || return 1
  case "$EXISTING_PID" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s\n' "$EXISTING_PID" > "$PID_FILE"
  echo "Centro Server já está activo. PID $EXISTING_PID · ligação confirmada"
}

start_server() {
  if [ ! -f "$SERVER" ]; then
    echo "Falta $SERVER"
    exit 1
  fi

  if adopt_server; then return 0; fi
  if is_running; then
    echo "Centro Server já está activo. PID $(cat "$PID_FILE")"
    return 0
  fi

  nohup python3 "$SERVER" >>"$LOG_FILE" 2>&1 </dev/null &
  PID=$!
  echo "$PID" > "$PID_FILE"
  sleep 1

  if kill -0 "$PID" 2>/dev/null; then
    echo "Centro Server iniciado em background. PID $PID"
    echo "Local: http://127.0.0.1:8765"
    echo "Log: $LOG_FILE"
  else
    # Another launcher can win the port while this process starts.
    if adopt_server; then return 0; fi
    echo "O servidor terminou ao arrancar."
    tail -n 30 "$LOG_FILE" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
  fi
}

stop_server() {
  if ! is_running; then
    echo "Centro Server já está parado."
    rm -f "$PID_FILE"
    return 0
  fi

  PID="$(cat "$PID_FILE")"
  kill "$PID" 2>/dev/null || true

  i=0
  while kill -0 "$PID" 2>/dev/null && [ "$i" -lt 10 ]; do
    sleep 1
    i=$((i + 1))
  done

  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi

  rm -f "$PID_FILE"
  echo "Centro Server parado."
}

restart_server() {
  stop_server
  start_server
}

status_server() {
  if is_running; then
    echo "Centro Server ACTIVO · PID $(cat "$PID_FILE")"
    if command -v curl >/dev/null 2>&1; then
      curl -fsS http://127.0.0.1:8765/health || true
      echo
    fi
  else
    echo "Centro Server PARADO"
    rm -f "$PID_FILE"
  fi
}

logs_server() {
  touch "$LOG_FILE"
  tail -n 80 -f "$LOG_FILE"
}

token_server() {
  if [ ! -f "$TOKEN_FILE" ]; then
    echo "Token ainda não criado. Arranca primeiro o servidor."
    exit 1
  fi
  echo "Token guardado em: $TOKEN_FILE"
  echo "Não o partilhes."
}

case "${1:-status}" in
  start) start_server ;;
  stop) stop_server ;;
  restart) restart_server ;;
  status) status_server ;;
  logs) logs_server ;;
  token) token_server ;;
  *)
    echo "Uso: centroserver {start|stop|restart|status|logs|token}"
    exit 2
    ;;
esac
