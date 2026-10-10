#!/usr/bin/env python3
"""Local Sherpa-ONNX STT worker for bounded, low-latency PT/EN transcription.

This component only transcribes; it never executes a command. A locally
installed model is required. Any uncertain or mutation-like transcript must
be validated by the existing Whisper path and permission policy.
No audio, recordings, or transcripts are written to persistent storage.
"""
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
import wave
from pathlib import Path

MODEL_DIR = (
    Path.home() / ".centro-jarvis" / "conversation-v2-stage" /
    "sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-560ms-int8-2026-06-11"
)
MAX_AUDIO_SECONDS = 30
PREFIX_SECONDS = 0.25
SUFFIX_SECONDS = 0.50

# Suspected write commands NEVER bypass the established accurate model and
# mutating-tool authorization. False negatives are still possible; this
# conservative filter cannot replace runtime permission gates.
SENSITIVE = re.compile(
    r"\b(?:apaga(?:r|s|m)?|apague|apagou|elimin\w*|remov\w*|"
    r"publica(?:r|s|m|cao)?|publicou|"
    r"paga(?:r|s|m)?|pague|pagamento|compra(?:r|s|m)?|"
    r"envia(?:r|s|m)?|envie|enviou|"
    r"instal\w*|desinstal\w*|altera(?:r|s|m)?|"
    r"modific\w*|edit\w*|execut\w*|escrev\w*|atualiz\w*|"
    r"mud\w*|guard\w*|grav\w*|substitu\w*|"
    r"cria(?:r|s|m)?|crie|criou|renome\w*|"
    r"delete\w*|eras\w*|destroy\w*|publish\w*|deploy\w*|"
    r"pay|payment|purchas\w*|buy|bought|send|sent|upload\w*|"
    r"install\w*|uninstall\w*|modify\w*|change\w*|"
    r"edit\w*|writ\w*|execute\w*|updat\w*|commit\w*|"
    r"push|merge|rename\w*|transf\w*|post|forward\w*)\b",
    re.I,
)
# A candidate must have a positive, recognisable low-risk intention.
# A syntactically harmless transcript is NOT enough to fast-approve a command.
READ_ONLY_INTENT = re.compile(
    r"\b(?:verific\w*|consult\w*|mostr\w*|explic\w*|"
    r"pesquis\w*|procur\w*|encontr\w*|saber|"
    r"compar\w*|fech\w*|paus\w*|retom\w*|decid\w*|avali\w*|analisa\w*|"
    r"diz|dizer|fala|falar|convers\w*|"
    r"abre|abra|abrir|abro|ler|l[eê]|qual|quais|como|porque|"
    r"o que|quem|quando|onde|ol[aá]|bom dia|boa tarde|"
    r"check|show|explain|search|find|look|read|tell|"
    r"speak|talk|hello|hi|what|how|who|where|when|why|open)\b",
    re.I,
)

def unaccented(text):
    return "".join(
        ch for ch in unicodedata.normalize("NFD", str(text).lower())
        if not unicodedata.combining(ch)
    )

def safe_short_read_transcript(text):
    """Only choose rapid first-pass speech when it is non-empty and non-mutating.

    This does NOT infer tool permission or certify transcript correctness.
    """
    tokens=re.findall(r"[a-z0-9]+",unaccented(text))
    if not 3 <= len(tokens) <= 120:return False
    normalized=unaccented(text)
    if SENSITIVE.search(normalized):return False
    if not READ_ONLY_INTENT.search(normalized):return False
    if len(tokens)>=7:
        from collections import Counter
        if Counter(tokens).most_common(1)[0][1]/len(tokens) >= .55:return False
    if len(str(text))>1300:return False
    return True

def read_pcm(path):
    """Return float32 samples for a validated 16-kHz mono WAV."""
    p=Path(path).resolve()
    if not (p.is_file() and p.suffix==".wav" and
            p.name=="audio.wav" and p.parent.name.startswith("jarvis-stt-")):
        raise ValueError("source_path_not_a_travis_temp_wav")
    with wave.open(str(p),"rb") as f:
        if (f.getnchannels(),f.getsampwidth(),f.getframerate(),f.getcomptype()) != (1,2,16000,"NONE"):
            raise ValueError("audio_must_be_mono_pcm16_at_16khz")
        frames=f.getnframes()
        if not 1600<=frames<=MAX_AUDIO_SECONDS*16000:
            raise ValueError("invalid_audio_length")
        data=f.readframes(frames)
    import numpy as np
    return np.frombuffer(data,dtype=np.int16).astype(np.float32)/32768

def transcribe_audio(recognizer,path):
    import numpy as np
    samples=read_pcm(path)
    zeros_before=np.zeros(int(PREFIX_SECONDS*16000),dtype=np.float32)
    zeros_after=np.zeros(int(SUFFIX_SECONDS*16000),dtype=np.float32)
    audio=np.concatenate((zeros_before,samples,zeros_after))
    stream=recognizer.create_stream()
    stream.accept_waveform(16000,audio)
    stream.input_finished()
    start=time.monotonic()
    steps=0
    while recognizer.is_ready(stream):
        recognizer.decode_stream(stream)
        steps+=1
        if steps>2000:raise RuntimeError("decoder_step_limit")
    reply=str(recognizer.get_result(stream)).strip()
    return {"text":reply,"engine":"sherpa-nemotron-3.5-streaming",
            "durationMs":int((time.monotonic()-start)*1000),
            "safeFastCandidate":safe_short_read_transcript(reply),
            "note":"A transcript candidate, not verified user intent."}

def create_recognizer():
    # Lazy imports keep unit tests usable in CI without heavyweight libraries.
    import sherpa_onnx
    required={
        "tokens":MODEL_DIR/"tokens.txt",
        "encoder":MODEL_DIR/"encoder.int8.onnx",
        "decoder":MODEL_DIR/"decoder.int8.onnx",
        "joiner":MODEL_DIR/"joiner.int8.onnx",
    }
    if not all(path.is_file() for path in required.values()):
        raise RuntimeError("sherpa_model_files_unavailable")
    return sherpa_onnx.OnlineRecognizer.from_transducer(
        **{key:str(val) for key,val in required.items()},
        num_threads=2,provider="cpu",decoding_method="greedy_search")

def live_decode(recognizer,sessions,payload):
    """Decode bounded PCM fragments while the user is still speaking."""
    import base64
    import numpy as np
    now=time.monotonic()
    for key in list(sessions):
        if now-sessions[key]['touched']>45:sessions.pop(key,None)
    key=str(payload.get('id',''))
    if not re.fullmatch(r'[a-zA-Z0-9-]{16,80}',key):raise ValueError('invalid_stream_id')
    if payload.get('cancel'):
        sessions.pop(key,None);return {'cancelled':True}
    seq=payload.get('seq')
    if not isinstance(seq,int) or not 0<=seq<=120:raise ValueError('invalid_sequence')
    data=base64.b64decode(payload.get('pcm',''),validate=True)
    if len(data)>64000 or len(data)%2:raise ValueError('invalid_pcm_fragment')
    if key not in sessions:
        if seq!=0:raise ValueError('missing_stream_start')
        if len(sessions)>=3:raise RuntimeError('too_many_live_streams')
        stream=recognizer.create_stream()
        stream.accept_waveform(16000,np.zeros(4000,dtype=np.float32))
        sessions[key]={'stream':stream,'next':0,'samples':0,'touched':now}
    state=sessions[key]
    if seq!=state['next']:raise ValueError('out_of_order_fragment')
    state['next']+=1;state['touched']=now;state['samples']+=len(data)//2
    if state['samples']>480000:
        sessions.pop(key,None);raise ValueError('live_audio_exceeds_30_seconds')
    stream=state['stream']
    if data:stream.accept_waveform(16000,np.frombuffer(data,dtype=np.int16).astype(np.float32)/32768)
    final=payload.get('final') is True
    if final:
        stream.accept_waveform(16000,np.zeros(8000,dtype=np.float32));stream.input_finished()
    started=time.monotonic()
    while recognizer.is_ready(stream):recognizer.decode_stream(stream)
    text=str(recognizer.get_result(stream)).strip()
    if final:sessions.pop(key,None)
    return {'text':text,'final':final,'accepted':final and safe_short_read_transcript(text),
            'engine':'sherpa-live','durationMs':int((time.monotonic()-started)*1000)}


def worker():
    recognizer=create_recognizer();sessions={}
    print("TRAVIS_STT:"+json.dumps({
        "ready":True,"engine":"sherpa-nemotron-3.5-streaming",
        "languages":["pt","en"],"role":"candidate_only"}),flush=True)
    for line in sys.stdin:
        try:
            payload=json.loads(line)
            if not isinstance(payload,dict):raise ValueError("payload_must_be_object")
            result=live_decode(recognizer,sessions,payload) if payload.get("live") is True else transcribe_audio(recognizer,payload.get("path",""))
        except Exception as exc:
            result={"error":type(exc).__name__,"safeFastCandidate":False}
        print("TRAVIS_STT:"+json.dumps(result,ensure_ascii=False),flush=True)

if __name__=="__main__":
    if len(sys.argv)!=2 or sys.argv[1]!="--worker":
        raise SystemExit("Usage: jarvis_sherpa.py --worker")
    worker()
