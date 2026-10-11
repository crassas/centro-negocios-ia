"""Actual local HTTP synthesis, idle eviction and cold reactivation. No audio is played."""
import io
import json
import time
import urllib.request
import wave
from pathlib import Path

OUT=Path('/root/.centro-jarvis/rest-stage/voice-proof.json')
BASE='http://127.0.0.1:8770'
proof={'scope':'actual local voice HTTP + worker residency; no microphone/speaker verification','ok':False}
def health():
    with urllib.request.urlopen(BASE+'/health',timeout=8) as response:return json.load(response)
def speak():
    payload=json.dumps({'text':'Travis resource check. I am ready when you need me.','language':'en'}).encode()
    request=urllib.request.Request(BASE+'/speak',data=payload,headers={'Content-Type':'application/json','Origin':BASE})
    start=time.monotonic()
    with urllib.request.urlopen(request,timeout=65) as response:
        assert response.headers.get_content_type()=='audio/wav'
        audio=response.read()
    with wave.open(io.BytesIO(audio),'rb') as wav:
        assert wav.getnframes()>0
        result={'bytes':len(audio),'seconds':round(wav.getnframes()/wav.getframerate(),2),'sampleRate':wav.getframerate(),'latencySeconds':round(time.monotonic()-start,2)}
    return result
try:
    start=health();assert start['ok'] and not start['busy'];assert 'resources' in start
    proof['startup']=start['resources'];proof['warmOrInitialVoice']=speak()
    proof['beforeIdle']=health()['resources']
    print('VOICE_CHECK initial synthesis passed',json.dumps(proof['warmOrInitialVoice']),flush=True)
    deadline=time.monotonic()+270
    while time.monotonic()<deadline:
        current=health();resources=current['resources']
        en=next(x for x in resources['workers'] if x['name']=='tts-en')
        if not en['resident']:
            proof['afterIdle']=resources
            print('VOICE_CHECK tts-en asleep',json.dumps(resources),flush=True)
            break
        time.sleep(10)
    else:raise RuntimeError('Voice did not become idle within the observation window; check active clients.')
    assert not health()['busy'], 'User activity detected; postpone synthesis probe'
    proof['coldVoice']=speak();proof['afterWake']=health()['resources']
    assert next(x for x in proof['afterWake']['workers'] if x['name']=='tts-en')['resident']
    proof['workerRssReductionKiB']=proof['beforeIdle']['workerRssKiB']-proof['afterIdle']['workerRssKiB']
    proof['ok']=True
except Exception as exc:
    proof['error']=type(exc).__name__+': '+str(exc)
finally:
    OUT.write_text(json.dumps(proof,indent=2));print('VOICE_REST_RESULT',json.dumps(proof),flush=True)
