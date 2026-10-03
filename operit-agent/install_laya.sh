#!/usr/bin/env sh
set -eu

HOME_DIR="${HOME:-/root}"
STATE_DIR="$HOME_DIR/.centro-laya"
VENV="$STATE_DIR/venv"

mkdir -p "$STATE_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 não encontrado."
  exit 127
fi

if [ ! -x "$VENV/bin/python" ]; then
  echo "A criar ambiente isolado do Laya..."
  python3 -m venv "$VENV"
fi

"$VENV/bin/python" -m pip install --upgrade pip wheel setuptools
"$VENV/bin/python" -m pip install "laya[serve]==0.3.24"

echo
echo "Laya instalado em $VENV"
echo "A primeira execução descarrega o checkpoint multilingual."
echo
if command -v layactl >/dev/null 2>&1; then
  layactl start
else
  echo "Executa depois: layactl start"
fi
