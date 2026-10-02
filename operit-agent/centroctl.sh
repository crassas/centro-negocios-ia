#!/usr/bin/env sh
set -eu

HOME_DIR="${HOME:-/root}"
AGENT="$HOME_DIR/centro_agent.py"
STATE_DIR="$HOME_DIR/.centro-agent"
PID_FILE="$STATE_DIR/agent.pid"
LOG_FILE="$STATE_DIR/agent.log"

mkdir -p "$STATE_DIR"

is_running() {
  [ -f "$PID_FILE" ] || return 1
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$PID" ] || return 1
  kill -0 "$PID" 2>/dev/null
}

start_agent() {
  if is_running; then
    echo "Centro Agent já está activo. PID $(cat "$PID_FILE")"
    exit 0
  fi

  if [ ! -f "$AGENT" ]; then
    echo "Falta $AGENT"
    echo "Instala primeiro o centro_agent.py."
    exit 1
  fi

  nohup python3 "$AGENT" >>"$LOG_FILE" 2>&1 </dev/null &
  PID=$!
  echo "$PID" > "$PID_FILE"
  sleep 1

  if kill -0 "$PID" 2>/dev/null; then
    echo "Centro Agent iniciado em background. PID $PID"
    echo "Log: $LOG_FILE"
  else
    echo "O agente terminou ao arrancar."
    tail -n 30 "$LOG_FILE" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
  fi
}

stop_agent() {
  if ! is_running; then
    echo "Centro Agent já está parado."
    rm -f "$PID_FILE"
    exit 0
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
  echo "Centro Agent parado."
}

status_agent() {
  if is_running; then
    echo "Centro Agent ACTIVO · PID $(cat "$PID_FILE")"
  else
    echo "Centro Agent PARADO"
    rm -f "$PID_FILE"
  fi

  if [ -f "$LOG_FILE" ]; then
    echo
    echo "Últimas linhas:"
    tail -n 12 "$LOG_FILE"
  fi
}

logs_agent() {
  touch "$LOG_FILE"
  tail -n 80 -f "$LOG_FILE"
}

restart_agent() {
  stop_agent || true
  start_agent
}

case "${1:-status}" in
  start) start_agent ;;
  stop) stop_agent ;;
  restart) restart_agent ;;
  status) status_agent ;;
  logs) logs_agent ;;
  *)
    echo "Uso: centroctl {start|stop|restart|status|logs}"
    exit 2
    ;;
esac
