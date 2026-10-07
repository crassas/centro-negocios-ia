#!/usr/bin/env python3
"""Reusable whisper.cpp binding; audio paths stay ephemeral and local."""
import json,math,sys,wave
from pathlib import Path
from pywhispercpp.model import Model
from jarvis_audio import prepare_audio
model=Model(sys.argv[1],n_threads=4,print_realtime=False,print_progress=False,no_context=True,single_segment=True,greedy={'best_of':1},initial_prompt="Travis. Travis, estás aí? Centro de Negócios. Pentehouse. Best Pizza. Dois Irmãos. Beatriz.")
def transcribe(path):
 samples=prepare_audio(path)
 if len(samples)<1600:return ''
 duration=len(samples)/16000
 segments=model.transcribe(samples,language='pt',audio_ctx=min(1500,max(512,math.ceil((duration+1)*50))))
 return ' '.join(segment.text.strip() for segment in segments)
if sys.argv[2]=='--worker':
 print('TRAVIS_STT:'+json.dumps({'ready':True}),flush=True)
 for line in sys.stdin:
  try:result={'text':transcribe(json.loads(line)['path'])}
  except Exception as exc:result={'error':str(exc)[:300]}
  print('TRAVIS_STT:'+json.dumps(result,ensure_ascii=False),flush=True)
else:Path(sys.argv[3]).write_text(transcribe(sys.argv[2]),encoding='utf-8')
