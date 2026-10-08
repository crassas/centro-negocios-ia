#!/usr/bin/env python3
"""Reusable bilingual whisper.cpp worker for Portuguese/English voice input."""
import json,math,sys,wave
from pathlib import Path
import numpy as np
from pywhispercpp.model import Model

PROMPT=(
 "Travis. Mr. Richard. GitHub. Puppeteer. Centro de Negócios. Pentehouse. Best Pizza. "
 "Dois Irmãos. Beatriz. Open GitHub. Latest version. Search the web. Abre o GitHub. Pesquisa na internet."
)
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

def transcribe(path):
 samples=prepare_audio(path)
 if len(samples)<1600:return {"text":"","language":"unknown"}
 duration=len(samples)/16000
 # Empty language lets whisper.cpp detect the spoken language during the same decode.
 segments=model.transcribe(
  samples,
  language="",
  audio_ctx=min(1500,max(512,math.ceil((duration+1)*50))),
 )
 text=" ".join(segment.text.strip() for segment in segments).strip()
 return {"text":text,"language":"auto"}

if sys.argv[2]=="--worker":
 print("TRAVIS_STT:"+json.dumps({"ready":True,"languages":["pt","en"],"mode":"auto"}),flush=True)
 for line in sys.stdin:
  try:result=transcribe(json.loads(line)["path"])
  except Exception as exc:result={"error":str(exc)[:300]}
  print("TRAVIS_STT:"+json.dumps(result,ensure_ascii=False),flush=True)
else:
 result=transcribe(sys.argv[2])
 Path(sys.argv[3]).write_text(result["text"],encoding="utf-8")
