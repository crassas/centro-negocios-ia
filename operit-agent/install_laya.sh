#!/usr/bin/env sh
set -eu

HOME_DIR="${HOME:-/root}"
STATE_DIR="$HOME_DIR/.centro-laya"
VENV="$STATE_DIR/venv"
TORCH_VERSION="2.14.0"

mkdir -p "$STATE_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 não encontrado."
  exit 127
fi

echo "A limpar instalação Laya incompleta..."
rm -rf "$VENV"

echo "A criar ambiente isolado do Laya..."
python3 -m venv "$VENV"

"$VENV/bin/python" -m pip install --upgrade pip wheel setuptools

echo
echo "A instalar PyTorch CPU-only (sem CUDA/NVIDIA)..."
"$VENV/bin/python" -m pip install "torch==${TORCH_VERSION}"   --index-url https://download.pytorch.org/whl/cpu

echo
echo "A instalar Laya + servidor..."
"$VENV/bin/python" -m pip install "laya[serve]==0.3.24"

echo
echo "A verificar instalação..."
"$VENV/bin/python" -I -c "import torch,laya; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); print('laya', getattr(laya,'__version__','0.3.24'))"

echo
echo "Laya instalado em $VENV"
echo "A primeira execução descarrega o checkpoint multilingual."
echo
if command -v layactl >/dev/null 2>&1; then
  layactl start
else
  echo "Executa depois: layactl start"
fi
