#!/usr/bin/env sh
set -eu

RAW="https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent"
HOME_DIR="${HOME:-/root}"
AGENT="$HOME_DIR/centro_agent.py"
SERVER="$HOME_DIR/centro_server.py"
TRAVIS_CORE="$HOME_DIR/travis_core.py"
SUPERVISOR="$HOME_DIR/centro_station.py"

if command -v curl >/dev/null 2>&1; then
  FETCH="curl -fsSL"
elif command -v wget >/dev/null 2>&1; then
  FETCH="wget -qO-"
else
  echo "É necessário curl ou wget."
  exit 1
fi

fetch_to() {
  URL="$1"
  DEST="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$URL" -o "$DEST"
  else
    wget -qO "$DEST" "$URL"
  fi
}

fetch_to "$RAW/centro_agent.py" "$AGENT"
chmod 700 "$AGENT"

fetch_to "$RAW/centro_server.py" "$SERVER"
chmod 700 "$SERVER"

fetch_to "$RAW/travis_core.py" "$TRAVIS_CORE"
chmod 600 "$TRAVIS_CORE"

fetch_to "$RAW/centro_station.py" "$SUPERVISOR"
chmod 700 "$SUPERVISOR"

if [ -w "/usr/local/bin" ]; then
  CTL="/usr/local/bin/centroctl"
  SERVER_CTL="/usr/local/bin/centroserver"
  STATION_CTL="/usr/local/bin/centrostation"
  OPENCLAW_CTL="/usr/local/bin/openclawctl"
  LAYA_CTL="/usr/local/bin/layactl"
  LAYA_INSTALL="/usr/local/bin/layainstall"
else
  mkdir -p "$HOME_DIR/.local/bin"
  CTL="$HOME_DIR/.local/bin/centroctl"
  SERVER_CTL="$HOME_DIR/.local/bin/centroserver"
  STATION_CTL="$HOME_DIR/.local/bin/centrostation"
  OPENCLAW_CTL="$HOME_DIR/.local/bin/openclawctl"
  LAYA_CTL="$HOME_DIR/.local/bin/layactl"
  LAYA_INSTALL="$HOME_DIR/.local/bin/layainstall"
fi

fetch_to "$RAW/centroctl.sh" "$CTL"
chmod 700 "$CTL"
fetch_to "$RAW/serverctl.sh" "$SERVER_CTL"
chmod 700 "$SERVER_CTL"
fetch_to "$RAW/stationctl.sh" "$STATION_CTL"
chmod 700 "$STATION_CTL"
fetch_to "$RAW/openclawctl.sh" "$OPENCLAW_CTL"
chmod 700 "$OPENCLAW_CTL"
fetch_to "$RAW/layactl.sh" "$LAYA_CTL"
chmod 700 "$LAYA_CTL"
fetch_to "$RAW/install_laya.sh" "$LAYA_INSTALL"
chmod 700 "$LAYA_INSTALL"

# Recuperação fora do próprio supervisor:
# 1) workflow nativo do Operit (app_open + WorkManager a cada 15 min);
# 2) hook de login do Ubuntu/PRoot.
WORKFLOW_LOCAL="$HOME_DIR/centro-station-resilience.json"
fetch_to "$RAW/operit-workflows/centro-station-resilience.json" "$WORKFLOW_LOCAL"
chmod 600 "$WORKFLOW_LOCAL"
WORKFLOW_DEST=""
for STORAGE_ROOT in /sdcard /storage/emulated/0; do
  if [ -d "$STORAGE_ROOT/Download" ]; then
    DEST_DIR="$STORAGE_ROOT/Download/Operit/workflow"
    if mkdir -p "$DEST_DIR" 2>/dev/null && cp "$WORKFLOW_LOCAL" "$DEST_DIR/centro-station-resilience.json" 2>/dev/null; then
      WORKFLOW_DEST="$DEST_DIR/centro-station-resilience.json"
      break
    fi
  fi
done

PROFILE="$HOME_DIR/.profile"
touch "$PROFILE"
if ! grep -q "CENTRO_STATION_AUTOSTART_V1" "$PROFILE" 2>/dev/null; then
  cat >>"$PROFILE" <<'EOF'

# CENTRO_STATION_AUTOSTART_V1
# Segunda linha de recuperação quando o Ubuntu/PRoot volta a abrir.
if [ -x /usr/local/bin/centrostation ]; then
  (/usr/local/bin/centrostation start >/dev/null 2>&1 || true) &
elif [ -x "$HOME/.local/bin/centrostation" ]; then
  ("$HOME/.local/bin/centrostation" start >/dev/null 2>&1 || true) &
fi
EOF
fi

echo "Agente instalado:"
echo "  $AGENT"
echo "Servidor privado:"
echo "  $SERVER"
echo "Supervisor:"
echo "  $SUPERVISOR"
echo "Controlos:"
echo "  $CTL"
echo "  $SERVER_CTL"
echo "  $STATION_CTL"
echo "  $OPENCLAW_CTL"
echo "  $LAYA_CTL"
echo "  $LAYA_INSTALL"
echo "Recuperação automática:"
if [ -n "$WORKFLOW_DEST" ]; then
  echo "  Workflow Operit: $WORKFLOW_DEST"
else
  echo "  Workflow Operit: guardado em $WORKFLOW_LOCAL (storage Android não acessível nesta sessão)"
fi
echo "  Hook Ubuntu: $PROFILE"
echo

# A Estação Centro arranca todos os componentes já instalados.
# OpenClaw/Laya são best-effort: uma falha neles não derruba Server/Agent.
"$STATION_CTL" restart

echo
echo "Verificação após bootstrap:"
sleep 2
"$STATION_CTL" doctor || true

echo
if [ -n "$WORKFLOW_DEST" ]; then
  echo "Bootstrap concluído. Fecha e volta a abrir o Operit uma vez para recarregar o workflow de recuperação."
else
  echo "Bootstrap do núcleo concluído. O workflow ficou em $WORKFLOW_LOCAL; copia-o para Download/Operit/workflow se o storage Android não aparecer automaticamente."
fi
echo "Depois confirma no Telegram com: /selftest"
