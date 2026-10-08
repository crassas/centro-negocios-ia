#!/usr/bin/env python3
"""Resident Smart Turn v3.2 CPU worker; uses the upstream Pipecat model/features."""
import json
import sys
import wave
from pathlib import Path
import numpy as np
import onnxruntime as ort
from pipecat.audio.turn.smart_turn._whisper_features import compute_whisper_log_mel_features
import pipecat

model = Path(pipecat.__file__).parent / 'audio/turn/smart_turn/data/smart-turn-v3.2-cpu.onnx'
options = ort.SessionOptions()
options.intra_op_num_threads = 1
options.inter_op_num_threads = 1
session = ort.InferenceSession(str(model), sess_options=options, providers=['CPUExecutionProvider'])
print('TRAVIS_TURN:' + json.dumps({'ready': True, 'model': model.name}), flush=True)
for line in sys.stdin:
    try:
        payload = json.loads(line)
        with wave.open(payload['path'], 'rb') as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000):
                raise ValueError('Expected mono PCM16 at 16kHz')
            audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        audio = audio[-128000:]
        audio = np.pad(audio, (max(0, 128000 - len(audio)), 0))
        features = compute_whisper_log_mel_features(audio, do_normalize=True)
        probability = float(session.run(None, {'input_features': features[None]})[0][0].item())
        result = {'available': True, 'complete': probability > .5, 'probability': probability, 'engine': 'pipecat-smart-turn-v3.2'}
    except Exception as exc:
        result = {'error': str(exc)[:180]}
    print('TRAVIS_TURN:' + json.dumps(result), flush=True)
