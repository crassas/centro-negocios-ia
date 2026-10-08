#!/usr/bin/env python3
"""Low-latency multilingual Whisper worker optimized for Portuguese/English input."""
import json,sys,wave
from pathlib import Path
import numpy as np
from pywhispercpp.model import Model

PROMPT="Português de Portugal and English. Travis, YouTube, GitHub, bicicletas, bicycles, Beatriz."
model_path=Path(sys.argv[1])
precise_model=model_path.with_name('ggml-small-q5_1.bin')
if precise_model.is_file():model_path=precise_model
model=Model(
 str(model_path),
 params_sampling_strategy=1,
 n_threads=4,
 print_realtime=False,
 print_progress=False,
 no_context=True,
 single_segment=True,
 temperature=0.0,
 temperature_inc=0.0,
 suppress_non_speech_tokens=True,
 beam_search={'beam_size':3,'patience':-1.0},
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
 # Preserve Whisper's full acoustic context: shortened windows corrupted compound
 # commands and project names even when the original audio was intelligible.
 used=language if language in {"pt","en"} else "auto"
 segments=model.transcribe(
  samples,
  language=used,
  audio_ctx=1500,
 )
 text=" ".join(segment.text.strip() for segment in segments).strip()
 return {"text":text,"languageUsed":used,"model":model_path.name}

if sys.argv[2]=="--worker":
 print("TRAVIS_STT:"+json.dumps({"ready":True,"languages":["pt","en"],"mode":"automatic-pt-en","defaultLanguage":"auto"}),flush=True)
 for line in sys.stdin:
  try:
   payload=json.loads(line)
   result=transcribe(payload["path"],payload.get("language"))
  except Exception as exc:result={"error":str(exc)[:300]}
  print("TRAVIS_STT:"+json.dumps(result,ensure_ascii=False),flush=True)
else:
 result=transcribe(sys.argv[2])
 Path(sys.argv[3]).write_text(result["text"],encoding="utf-8")
