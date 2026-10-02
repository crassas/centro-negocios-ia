#!/usr/bin/env sh
set -eu

RAW="https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent"
HOME_DIR="${HOME:-/root}"
SERVER="$HOME_DIR/centro_server.py"

fetch_to() {
  URL="$1"
  DEST="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$URL" -o "$DEST"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$DEST" "$URL"
  else
    echo "É necessário curl ou wget."
    exit 1
  fi
}

fetch_to "$RAW/centro_server.py" "$SERVER"
chmod 700 "$SERVER"

if [ -w "/usr/local/bin" ]; then
  SERVER_CTL="/usr/local/bin/centroserver"
else
  mkdir -p "$HOME_DIR/.local/bin"
  SERVER_CTL="$HOME_DIR/.local/bin/centroserver"
fi

fetch_to "$RAW/serverctl.sh" "$SERVER_CTL"
chmod 700 "$SERVER_CTL"

echo "Centro Server instalado:"
echo "  $SERVER"
echo "Controlo:"
echo "  $SERVER_CTL"
echo
"$SERVER_CTL" restart
