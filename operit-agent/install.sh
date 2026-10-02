#!/usr/bin/env sh
set -eu

RAW="https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent"
HOME_DIR="${HOME:-/root}"
AGENT="$HOME_DIR/centro_agent.py"

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

if [ -w "/usr/local/bin" ]; then
  CTL="/usr/local/bin/centroctl"
else
  mkdir -p "$HOME_DIR/.local/bin"
  CTL="$HOME_DIR/.local/bin/centroctl"
fi

fetch_to "$RAW/centroctl.sh" "$CTL"
chmod 700 "$CTL"

echo "Agente instalado:"
echo "  $AGENT"
echo "Controlo:"
echo "  $CTL"
echo
"$CTL" start
