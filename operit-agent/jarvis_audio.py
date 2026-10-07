"""Conservative edge trimming and level normalisation for local Portuguese ASR."""
import numpy as np
import wave

def prepare_audio(path):
 with wave.open(str(path),'rb') as wav:
  if wav.getsampwidth()!=2 or wav.getnchannels()!=1 or wav.getframerate()!=16000:
   raise ValueError('Expected mono PCM16 at 16 kHz')
  samples=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(np.float32)/32768
 if not samples.size:return samples
 frame=320
 count=len(samples)//frame
 if count:
  rms=np.sqrt(np.mean(samples[:count*frame].reshape(count,frame)**2,axis=1))
  threshold=max(.0025,min(.012,float(np.percentile(rms,95))*.055))
  active=np.flatnonzero(rms>threshold)
  if not active.size:return np.empty(0,dtype=np.float32)
  # Preserve consonants and natural pauses. Trim only outside the utterance.
  first=max(0,int(active[0])*frame-4800)
  last=min(len(samples),(int(active[-1])+1)*frame+4800)
  samples=samples[first:last]
 peak=float(np.max(np.abs(samples)))
 if peak>0:samples*=min(3.0,.85/peak)
 return samples
