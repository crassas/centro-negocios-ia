import json,urllib.request,sqlite3,time,uuid,random,io
from pathlib import Path
import subprocess,shutil
assert shutil.which('ffmpeg') and shutil.which('ffprobe')
root=Path('/root/.centro-jarvis/coordination-stage')
def post(path,body,timeout=80):
 request=urllib.request.Request('http://127.0.0.1:8770'+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Origin':'http://127.0.0.1:8770'})
 return urllib.request.urlopen(request,timeout=timeout)
session='coordination-e2e-20261011';ident=str(uuid.uuid4())
result={'physicalMicrophoneVerified':False,'physicalSpeakerVerified':False,'browserPlaybackVerified':False}
state=json.load(post('/brain/state',{}))['coordination'];result['coordinationBefore']=state
wav=post('/speak',{'text':'Show a random public camera.','language':'en'}).read()
(root/'english-camera-command.wav').write_bytes(wav)
r=urllib.request.Request('http://127.0.0.1:8770/transcribe?language=en',data=wav,headers={'Content-Type':'audio/wav','Origin':'http://127.0.0.1:8770'})
transcript=json.load(urllib.request.urlopen(r,timeout=80))
result['voiceRoundTrip']={'text':transcript.get('text'),'wavBytes':len(wav),'durationMs':transcript.get('durationMs')}
print('ENGLISH_ROUND_TRIP',json.dumps(result['voiceRoundTrip']),flush=True)
assert 'camera' in transcript.get('text','').lower()
result['requestReceipt']=json.load(post('/interaction',{'kind':'coordination','action':'requested','session':session,'id':ident,'text':transcript['text']}))
catalog=json.load(urllib.request.urlopen('http://127.0.0.1:4187/api/cctv/sources',timeout=50))
sources=catalog if isinstance(catalog,list) else catalog.get('sources',catalog.get('cameras',[]))
candidates=[s for s in sources if s.get('feedType')=='image'];random.shuffle(candidates)
attempts=[]
for source in candidates[:3]:
 try:
  req=urllib.request.urlopen('http://127.0.0.1:4187/api/cctv/frame/'+source['id'],timeout=24)
  data=req.read(5*1024*1024+1);assert len(data)<=5*1024*1024
  assert req.headers.get('X-CCTV-Source')=='upstream-image'
  metadata=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=width,height','-of','json','-i','pipe:0'],input=data))['streams'][0];dimensions=[metadata['width'],metadata['height']]
  subprocess.run(['ffmpeg','-v','error','-xerror','-i','pipe:0','-frames:v','1','-f','null','-'],input=data,check=True,timeout=12)
  result['publicSource']={'id':source['id'],'name':source.get('name'),'pack':source.get('pack'),'dimensions':dimensions,'bytes':len(data),'imageDecodedBy':'FFmpeg','feedFreshnessVerified':False}
  (root/'public-camera-check.image').write_bytes(data)
  break
 except Exception as e:attempts.append({'id':source['id'],'error':type(e).__name__})
result['sourceAttempts']=attempts
assert 'publicSource' in result,'No image verified in three attempts'
print('PUBLIC_IMAGE',json.dumps(result['publicSource']),flush=True)
source=result['publicSource']
# Exercise the real receipt contract without claiming browser playback.
result['resultReceipt']=json.load(post('/interaction',{'kind':'coordination','action':'result','session':session,'id':ident,'result':{'verified':False,'kind':'snapshot','sourceId':source['id'],'source':source['name'],'reply':'Test harness decoded a public image; browser playback remains unverified.'}}))
answer=json.load(post('/jarvis',{'session':session,'language':'en','text':'Explain your current runtime and the result of my last public camera request. What is still unverified?'}))
assert answer.get('tool')!='vision_observation','Public camera request was misrouted to phone vision'
result['followup']={k:answer.get(k) for k in ['reply','tool','ok','language','verification']}
print('FOLLOWUP',json.dumps(result['followup']),flush=True)
result['coordinationAfter']=json.load(post('/brain/state',{}))['coordination']
assert result['coordinationAfter']['ticks']>state['ticks']
assert not result['coordinationAfter']['lastError']
with sqlite3.connect('/root/.centro-jarvis/coordination.sqlite') as db:
 row=db.execute('SELECT state,result FROM coordination_goals WHERE session=? AND id=?',(session,ident)).fetchone()
 assert row and row[0]=='unverified'
 result['persistentReceipt']={'state':row[0],'result':json.loads(row[1])}
result['ok']=True
(root/'integration-proof.json').write_text(json.dumps(result,indent=2))
print('INTEGRATION_CONTRACT_OK; physical and browser confirmation remains pending',flush=True)
