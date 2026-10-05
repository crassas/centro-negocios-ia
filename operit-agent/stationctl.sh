#!/usr/bin/env sh
set -eu

HOME_DIR="${HOME:-/root}"
STATE_DIR="$HOME_DIR/.centro-station"
PID_FILE="$STATE_DIR/supervisor.pid"
LOG_FILE="$STATE_DIR/supervisor.log"
SUPERVISOR="$HOME_DIR/centro_station.py"
RAW="https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent"

pick_ctl() {
  NAME="$1"
  if [ -x "/usr/local/bin/$NAME" ]; then
    printf '%s\n' "/usr/local/bin/$NAME"
  else
    printf '%s\n' "$HOME_DIR/.local/bin/$NAME"
  fi
}

SERVER_CTL="$(pick_ctl centroserver)"
AGENT_CTL="$(pick_ctl centroctl)"
OPENCLAW_CTL="$(pick_ctl openclawctl)"
LAYA_CTL="$(pick_ctl layactl)"

mkdir -p "$STATE_DIR"

is_running() {
  [ -f "$PID_FILE" ] || return 1
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$PID" ] || return 1
  kill -0 "$PID" 2>/dev/null
}

start_station() {
  "$SERVER_CTL" start
  "$AGENT_CTL" start

  if [ -x "$OPENCLAW_CTL" ]; then
    "$OPENCLAW_CTL" start >/dev/null 2>&1 || true
  fi
  if [ -x "$LAYA_CTL" ]; then
    "$LAYA_CTL" start >/dev/null 2>&1 &
  fi

  if is_running; then
    echo "Centro Station já está activo. PID $(cat "$PID_FILE")"
    return 0
  fi

  nohup python3 "$SUPERVISOR" >>"$LOG_FILE" 2>&1 </dev/null &
  PID=$!
  echo "$PID" > "$PID_FILE"
  sleep 1

  if kill -0 "$PID" 2>/dev/null; then
    echo "Centro Station ACTIVA · PID $PID"
  else
    echo "Falha ao arrancar o supervisor."
    tail -n 30 "$LOG_FILE" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
  fi
}

stop_station() {
  if is_running; then
    PID="$(cat "$PID_FILE")"
    kill "$PID" 2>/dev/null || true
    sleep 1
    kill -9 "$PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "Supervisor parado."
  else
    rm -f "$PID_FILE"
  fi

  "$AGENT_CTL" stop || true
  "$SERVER_CTL" stop || true
  echo "Centro Station PARADA"
}

restart_station() {
  stop_station
  start_station
}

status_station() {
  echo "=== CENTRO STATION ==="
  if is_running; then
    echo "Supervisor: ACTIVO · PID $(cat "$PID_FILE")"
  else
    echo "Supervisor: PARADO"
  fi
  "$SERVER_CTL" status || true
  "$AGENT_CTL" status || true
  if [ -x "$OPENCLAW_CTL" ]; then
    echo
    "$OPENCLAW_CTL" status || true
  fi
  if [ -x "$LAYA_CTL" ]; then
    echo
    "$LAYA_CTL" status || true
  fi
  if [ -f "$STATE_DIR/status.json" ]; then
    echo
    echo "Supervisor state:"
    python3 - "$STATE_DIR/status.json" <<'PY' 2>/dev/null || true
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8"))
a=d.get("autoupdate") or {}
print("Auto-update:", "ON" if a.get("enabled") else "OFF",
      "· intervalo", a.get("intervalSeconds","?"), "s",
      "· último OK", a.get("lastOk",0))
if a.get("lastError"):
    print("Auto-update erro:", str(a["lastError"])[:500])
PY
  fi
}

doctor_station() {
  echo "=== DIAGNÓSTICO CENTRO STATION ==="
  printf "Python: "; python3 --version 2>&1 || true
  printf "Node: "; node --version 2>&1 || echo "indisponível"
  printf "Claude: "
  if command -v claude >/dev/null 2>&1; then
    command -v claude
  else
    echo "não encontrado"
  fi
  printf "curl: "
  if command -v curl >/dev/null 2>&1; then
    command -v curl
  else
    echo "não encontrado"
  fi

  echo
  status_station

  echo
  echo "Cloudflare Worker:"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 10 https://centro-negocios-ai.travisthejarvis.workers.dev/health || echo "indisponível"
    echo
  fi

  echo "Credenciais locais:"
  [ -f "$HOME_DIR/.centro-agent/token" ] && echo "Operit token: OK" || echo "Operit token: EM FALTA"
  [ -f "$HOME_DIR/.centro-server/token" ] && echo "Server token: OK" || echo "Server token: EM FALTA"
  [ -f "$HOME_DIR/.centro-agent/ollama_api_key" ] && echo "Claude/Ollama: configurado" || echo "Claude/Ollama: por configurar"
  [ -f "$HOME_DIR/.centro-agent/manus_api_key" ] && echo "Manus: configurado" || echo "Manus: opcional / sem chave"

  echo
  echo "Política: núcleo local-first · auto-reparação activa · sem fallback pago automático"
}

update_station() {
  TMP="${TMPDIR:-/tmp}/centro-install.$$"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$RAW/install.sh" -o "$TMP"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP" "$RAW/install.sh"
  else
    echo "É necessário curl ou wget."
    exit 1
  fi
  chmod 700 "$TMP"
  sh "$TMP"
  rm -f "$TMP"
}

logs_station() {
  touch "$LOG_FILE"
  tail -n 100 -f "$LOG_FILE"
}

case "${1:-status}" in
  start) start_station ;;
  stop) stop_station ;;
  restart) restart_station ;;
  status) status_station ;;
  doctor) doctor_station ;;
  update) update_station ;;
  logs) logs_station ;;
  *)
    echo "Uso: centrostation {start|stop|restart|status|doctor|update|logs}"
    exit 2
    ;;
esac
