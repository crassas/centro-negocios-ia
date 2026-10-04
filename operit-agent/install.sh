#!/usr/bin/env sh
set -eu

RAW="https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent"
HOME_DIR="${HOME:-/root}"
AGENT="$HOME_DIR/centro_agent.py"
SERVER="$HOME_DIR/centro_server.py"
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
echo

# OpenClaw deixa de fazer parte do arranque normal da estação. Mantém os
# ficheiros/configuração, mas pára o processo para libertar RAM. Para optar
# conscientemente pelo autostart: CENTRO_OPENCLAW_AUTOSTART=1.
if [ "${CENTRO_OPENCLAW_AUTOSTART:-0}" != "1" ] && [ -x "$OPENCLAW_CTL" ]; then
  "$OPENCLAW_CTL" stop >/dev/null 2>&1 || true
fi

"$STATION_CTL" restart
