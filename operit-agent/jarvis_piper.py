#!/usr/bin/env python3
"""Persistent Piper 1.8 worker with bounded CPU use and the legacy CLI protocol."""
import json
import os
import sys
import wave
from pathlib import Path

ROOT = Path.home() / '.centro-jarvis'

def load_voice(model):
    sys.path.insert(0, str(ROOT / 'piper-runtime-1.8.0'))
    import onnxruntime as ort
    from piper import PiperVoice
    from piper.config import PiperConfig
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.add_session_config_entry('session.intra_op.allow_spinning', '0')
    options.add_session_config_entry('session.inter_op.allow_spinning', '0')
    return PiperVoice(
        session=ort.InferenceSession(str(model), sess_options=options,
                                    providers=['CPUExecutionProvider']),
        config=PiperConfig.from_dict(json.loads(Path(str(model)+'.json').read_text())),
    )

def output_path(value):
    path = Path(value).resolve()
    if path.suffix != '.wav' or not path.parent.name.startswith('jarvis-tts-'):
        raise ValueError('Voice output must be a Travis temporary WAV')
    return path

def main():
    model = Path(sys.argv[1])
    try:
        voice = load_voice(model)
    except Exception as exc:
        print('Piper Python unavailable: '+type(exc).__name__, file=sys.stderr, flush=True)
        print('TRAVIS_TTS:'+json.dumps({'ready':True,'backend':'legacy'}), flush=True)
        binary = str(ROOT / 'bin/piper')
        os.execv(binary, [binary, '-m', str(model), '--json-input', '-q'])
    print('TRAVIS_TTS:'+json.dumps({'ready':True,'backend':'piper-1.8.0','threads':2}), flush=True)
    for line in sys.stdin:
        try:
            payload = json.loads(line)
            text = payload['text']
            if not isinstance(text, str) or not text.strip() or len(text)>6000:
                raise ValueError('Invalid voice text')
            path = output_path(payload['output_file'])
            with wave.open(str(path), 'wb') as wav:
                voice.synthesize_wav(text, wav)
            print(str(path), flush=True)
        except Exception as exc:
            print('TRAVIS_TTS_ERROR:'+type(exc).__name__, flush=True)

if __name__ == '__main__':
    main()
