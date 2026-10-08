#!/usr/bin/env python3
"""Low-latency multilingual Whisper worker optimized for Portuguese/English input."""
import json,math,sys,wave
from pathlib import Path
import numpy as np
from pywhispercpp.model import Model

PROMPT="Travis, repositórios, tarefas, projetos, Beatriz, GitHub."
model=Model(
 sys.argv[1],
 n_threads=4,
 print_realtime=False,
 print_progress=False,
 no_context=True,
 single_segment=True,
 greedy={'best_of':1},
 initial_prompt=PROMPT,
)

def prepare_audio(path):
 with wave.open(str(path),"rb") as wav:
  if wav.getnchannels()!=1 or wav.getsampwidth()!=2 or wav.getframerate()!=16000:
   raise ValueError("Expected 16 kHz mono PCM WAV")
  raw=wav.readframes(wav.getnframes())
 return np.frombuffer(raw,dtype=np.int16).astype(np.float32)/32768.0

def transcribe(path,language=None):
 samples=prepare_audio(path)
 if len(samples)<1600:return {"text":"","languageUsed":"pt"}
 duration=len(samples)/16000
 # Keep Portuguese explicit and preserve enough acoustic context for project names.
 # The old 512-frame floor corrupted repositories in the recorded regression sample.
 used=language if language in {"pt","en"} else "pt"
 segments=model.transcribe(
  samples,
  language=used,
  audio_ctx=min(1500,max(768,math.ceil((duration+1)*50))),
 )
 text=" ".join(segment.text.strip() for segment in segments).strip()
 return {"text":text,"languageUsed":used}

if sys.argv[2]=="--worker":
 print("TRAVIS_STT:"+json.dumps({"ready":True,"languages":["pt","en"],"mode":"pt-biased-multilingual","defaultLanguage":"pt"}),flush=True)
 for line in sys.stdin:
  try:
   payload=json.loads(line)
   result=transcribe(payload["path"],payload.get("language"))
  except Exception as exc:result={"error":str(exc)[:300]}
  print("TRAVIS_STT:"+json.dumps(result,ensure_ascii=False),flush=True)
else:
 result=transcribe(sys.argv[2])
 Path(sys.argv[3]).write_text(result["text"],encoding="utf-8")
