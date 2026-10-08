#!/usr/bin/env python3
"""Low-latency bilingual Whisper worker for Portuguese/English voice input."""
import json,math,re,sys,wave
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
current_language="pt"
ENGLISH_HINTS={"the","and","open","tell","latest","version","search","please","what","where","when","how","can","you","me","is","are","with","show","find","github","youtube"}
PORTUGUESE_HINTS={"abre","abrir","diz","diga","versao","versão","mais","recente","pesquisa","procura","por","favor","qual","como","onde","quando","esta","está","estou","podes","consegue","tens","tenho","quero","mostra","encontra"}

def prepare_audio(path):
 with wave.open(str(path),"rb") as wav:
  if wav.getnchannels()!=1 or wav.getsampwidth()!=2 or wav.getframerate()!=16000:
   raise ValueError("Expected 16 kHz mono PCM WAV")
  raw=wav.readframes(wav.getnframes())
 return np.frombuffer(raw,dtype=np.int16).astype(np.float32)/32768.0

def next_language(text,used):
 words={w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]+",text)}
 en=len(words & ENGLISH_HINTS);pt=len(words & PORTUGUESE_HINTS)
 if en>=2 and en>pt+1:return "en"
 if pt>=2 and pt>en:return "pt"
 return used

def transcribe(path,language=None):
 global current_language
 samples=prepare_audio(path)
 if len(samples)<1600:return {"text":"","language":current_language}
 duration=len(samples)/16000
 used=language if language in {"pt","en"} else current_language
 segments=model.transcribe(
  samples,
  language=used,
  audio_ctx=min(1500,max(512,math.ceil((duration+1)*50))),
 )
 text=" ".join(segment.text.strip() for segment in segments).strip()
 current_language=next_language(text,used)
 return {"text":text,"languageUsed":used,"nextLanguage":current_language}

if sys.argv[2]=="--worker":
 print("TRAVIS_STT:"+json.dumps({"ready":True,"languages":["pt","en"],"mode":"adaptive","language":current_language}),flush=True)
 for line in sys.stdin:
  try:
   payload=json.loads(line)
   result=transcribe(payload["path"],payload.get("language"))
  except Exception as exc:result={"error":str(exc)[:300]}
  print("TRAVIS_STT:"+json.dumps(result,ensure_ascii=False),flush=True)
else:
 result=transcribe(sys.argv[2])
 Path(sys.argv[3]).write_text(result["text"],encoding="utf-8")
