#!/usr/bin/env bash
set -euo pipefail
JARVIS_ROOT="${HOME}/.centro-jarvis"
MODEL_ROOT="${HOME}/.centro-models"
mkdir -p "$JARVIS_ROOT/bin" "$MODEL_ROOT/llm" "$MODEL_ROOT/stt" "$MODEL_ROOT/tts"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -o DPkg::Lock::Timeout=600 install -y --no-install-recommends curl ffmpeg python3-venv
/usr/bin/python3 - <<'PY'
import hashlib,json,tarfile,urllib.request
from pathlib import Path
root=Path.home()/".centro-jarvis"
provenance=[]
for repo,tag,name,binaries in [
 ("ggml-org/llama.cpp","b11438","llama-b11438-bin-ubuntu-arm64.tar.gz",["llama-server","llama-bench"]),
 ("rhasspy/piper","2023.11.14-2","piper_linux_aarch64.tar.gz",["piper"])]:
 data=json.load(urllib.request.urlopen("https://api.github.com/repos/"+repo+"/releases/tags/"+tag,timeout=30))
 asset=next(a for a in data["assets"] if a["name"]==name)
 archive=root/name
 if not archive.exists():urllib.request.urlretrieve(asset["browser_download_url"],archive)
 sha=hashlib.sha256(archive.read_bytes()).hexdigest()
 if asset.get("digest") and asset["digest"]!="sha256:"+sha:raise RuntimeError("Checksum inválido")
 dest=root/"prebuilt"/repo.split("/")[-1];dest.mkdir(parents=True,exist_ok=True)
 with tarfile.open(archive) as tar:tar.extractall(dest,filter="data")
 for binary in binaries:
  path=next(p for p in dest.rglob(binary) if p.is_file())
  link=root/"bin"/binary;link.unlink(missing_ok=True);link.symlink_to(path)
 provenance.append({"repo":repo,"tag":tag,"asset":name,"sha256":sha,"provider_digest":asset.get("digest")})
(root/"provenance.json").write_text(json.dumps(provenance,indent=2))
PY
[ -x "$JARVIS_ROOT/venv/bin/python" ] || /usr/bin/python3 -m venv "$JARVIS_ROOT/venv"
"$JARVIS_ROOT/venv/bin/python" -m pip install --only-binary=:all: pywhispercpp==1.5.1
fetch() {
 local url="$1" dest="$2"
 if [ ! -f "$dest" ]; then
  curl --fail --location --retry 4 --continue-at - "$url" -o "$dest.part"
  mv "$dest.part" "$dest"
 fi
}
fetch https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf "$MODEL_ROOT/llm/small.gguf"
fetch https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf "$MODEL_ROOT/llm/fallback.gguf"
fetch https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf "$MODEL_ROOT/llm/main.gguf"
fetch https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin "$MODEL_ROOT/stt/ggml-base.bin"
VOICE_BASE='https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_PT/tug%C3%A3o/medium/pt_PT-tug%C3%A3o-medium'
fetch "$VOICE_BASE.onnx" "$MODEL_ROOT/tts/pt_PT-tugao-medium.onnx"
fetch "$VOICE_BASE.onnx.json" "$MODEL_ROOT/tts/pt_PT-tugao-medium.onnx.json"
VOICE_EN_BASE='https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium'
fetch "$VOICE_EN_BASE.onnx" "$MODEL_ROOT/tts/en_GB-northern_english_male-medium.onnx"
fetch "$VOICE_EN_BASE.onnx.json" "$MODEL_ROOT/tts/en_GB-northern_english_male-medium.onnx.json"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for file in travis_core.py travis_genome.py travis_cognitive.py travis_brain.py travis_reflexion.py travis_quantum.py travis_gmail.py travis_web_tools.py travis_dialogue.py travis_semantic.py travis_workflow.py travis_stream.py jarvis_local.py jarvis_whisper.py jarvis_turn.py jarvis_voice.html; do cp "$SCRIPT_DIR/$file" "$HOME/$file"; done
/usr/bin/python3 "$SCRIPT_DIR/install_conversation_voice.py"
chmod +x "$SCRIPT_DIR/jarvisctl.sh"
ln -sf "$SCRIPT_DIR/jarvisctl.sh" /usr/local/bin/jarvisctl
printf 'Componentes instalados. Execute jarvisctl doctor e os testes antes de activar o planeador.\n'
