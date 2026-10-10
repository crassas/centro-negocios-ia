#!/usr/bin/env python3
"""Install pinned, local Silero / Pipecat voice components on the existing runtime."""
import base64
import hashlib
import json
import shutil
import subprocess
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path.home() / '.centro-jarvis/conversation-v2-stage'
ASSETS = Path.home() / '.centro-ui/assets/voice'

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    python = ROOT / 'venv/bin/python'
    if not python.exists():
        subprocess.run(['/usr/bin/python3', '-m', 'venv', str(ROOT / 'venv')], check=True)
    subprocess.run([str(python), '-m', 'pip', 'install', '--only-binary=:all:',
                    'numpy==2.5.3', 'onnxruntime==1.30.0', 'loguru==0.7.3'], check=True)
    # Only the upstream CPU turn model and its NumPy feature extractor are used.
    # Installing the whole media/provider framework would add unnecessary services.
    subprocess.run([str(python), '-m', 'pip', 'install', '--no-deps', 'pipecat-ai==1.12.0'], check=True)
    subprocess.run([str(python), '-m', 'pip', 'install', '--only-binary=:all:',
                    '--no-deps', '--target', str(ROOT.parent/'piper-runtime-1.8.0'),
                    'piper-tts==1.8.0'], check=True)
    manifests = []
    for package, version, folder, names in [
        ('onnxruntime-web', '1.22.0', 'ort', {'ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'}),
        ('@ricky0123/vad-web', '0.0.31', 'vad', {'bundle.min.js', 'vad.worklet.bundle.min.js', 'silero_vad_v5.onnx'}),
    ]:
        with urllib.request.urlopen('https://registry.npmjs.org/' + package + '/' + version, timeout=30) as response:
            metadata = json.load(response)
        archive = ROOT / (folder + '-pinned.tgz')
        urllib.request.urlretrieve(metadata['dist']['tarball'], archive)
        integrity = metadata['dist']['integrity']
        algorithm, expected = integrity.split('-', 1)
        if algorithm != 'sha512' or base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode() != expected:
            raise RuntimeError('Package integrity mismatch: ' + package)
        destination = ASSETS / folder
        destination.mkdir(parents=True, exist_ok=True)
        copied = set()
        with tarfile.open(archive) as tar:
            for member in tar:
                name = Path(member.name).name
                if member.isfile() and (name in names or name.upper().startswith('LICENSE')):
                    stream = tar.extractfile(member)
                    with stream, (destination / name).open('wb') as output:
                        shutil.copyfileobj(stream, output)
                    copied.add(name)
        if not names.issubset(copied):
            raise RuntimeError('Missing browser asset: ' + package)
        manifests.append({'package': package, 'version': version, 'integrity': integrity,
                          'source': metadata['dist']['tarball'], 'files': sorted(copied)})
    for name in ['jarvis_turn.py', 'jarvis_piper.py', 'travis_dialogue.py']:
        shutil.copy2(Path(__file__).with_name(name), Path.home() / name)
    (ROOT / 'installed.json').write_text(json.dumps({'browser': manifests, 'pipecat-ai': '1.12.0', 'piper-tts': '1.8.0'}, indent=2))
    print('VOICE_COMPONENTS_INSTALLED: Silero v5, Pipecat Smart Turn v3.2; no speech provider added.')

if __name__ == '__main__':
    main()
