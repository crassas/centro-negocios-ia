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
    r"\b(?:apaga(?:r)?|elimina(?:r)?|remove(?:r)?|publica(?:r)?|"
    r"pagar?|comprar?|enviar?|instala(?:r)?|desinstala(?:r)?|"
    r"altera(?:r)?|edita(?:r)?|executa(?:r)?|destr[oó]i|"
    r"delete|erase|destroy|publish|deploy|pay|purchase|buy|"
    r"send|install|uninstall|modify|edit|write|execute|transfer)\b",
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
    if SENSITIVE.search(unaccented(text)):return False
    if len(tokens)>=7:
        from collections import Counter
        if Counter(tokens).most_common(1)[0][1]/len(tokens) >= .55:return False
    if len(str(text))>1300:return False
    return True

def read_pcm(path):
    """Return float32 samples for a validated 16-kHz mono WAV."""
    import numpy as np
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

def worker():
    recognizer=create_recognizer()
    print("TRAVIS_STT:"+json.dumps({
        "ready":True,"engine":"sherpa-nemotron-3.5-streaming",
        "languages":["pt","en"],"role":"candidate_only"}),flush=True)
    for line in sys.stdin:
        try:
            payload=json.loads(line)
            if not isinstance(payload,dict):raise ValueError("payload_must_be_object")
            result=transcribe_audio(recognizer,payload.get("path",""))
        except Exception as exc:
            result={"error":type(exc).__name__,"safeFastCandidate":False}
        print("TRAVIS_STT:"+json.dumps(result,ensure_ascii=False),flush=True)

if __name__=="__main__":
    if len(sys.argv)!=2 or sys.argv[1]!="--worker":
        raise SystemExit("Usage: jarvis_sherpa.py --worker")
    worker()
