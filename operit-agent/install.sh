#!/usr/bin/env sh
set -eu

RAW="https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent"
HOME_DIR="${HOME:-/root}"
AGENT="$HOME_DIR/centro_agent.py"
SERVER="$HOME_DIR/centro_server.py"

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

if [ -w "/usr/local/bin" ]; then
  CTL="/usr/local/bin/centroctl"
  SERVER_CTL="/usr/local/bin/centroserver"
else
  mkdir -p "$HOME_DIR/.local/bin"
  CTL="$HOME_DIR/.local/bin/centroctl"
  SERVER_CTL="$HOME_DIR/.local/bin/centroserver"
fi

fetch_to "$RAW/centroctl.sh" "$CTL"
chmod 700 "$CTL"
fetch_to "$RAW/serverctl.sh" "$SERVER_CTL"
chmod 700 "$SERVER_CTL"

echo "Agente instalado:"
echo "  $AGENT"
echo "Servidor privado:"
echo "  $SERVER"
echo "Controlos:"
echo "  $CTL"
echo "  $SERVER_CTL"
echo
"$CTL" restart
"$SERVER_CTL" restart
