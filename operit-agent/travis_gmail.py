"""Local Gmail read-only connector. OAuth credentials never reach the renderer."""
import base64, hashlib, json, os, secrets, threading, time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT=Path.home()/'.centro-jarvis'
REDIRECT='http://127.0.0.1:8770/gmail/callback'
SCOPE='https://www.googleapis.com/auth/gmail.readonly'
LOCK=threading.RLock()
PENDING={}

def _read(name):
 try:return json.loads((ROOT/name).read_text())
 except (OSError,ValueError):return {}

def _save(name,data):
 ROOT.mkdir(parents=True,exist_ok=True)
 path=ROOT/name;tmp=path.with_suffix('.tmp')
 fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as f:json.dump(data,f)
 tmp.chmod(0o600);tmp.replace(path)

def configure(data):
 config=data.get('installed',{}) if isinstance(data,dict) else {}
 if not str(config.get('client_id','')).endswith('.apps.googleusercontent.com'):
  raise ValueError('Seleciona o JSON OAuth de aplicação para computador do Google Cloud, com a Gmail API ativa.')
 with LOCK:
  _save('gmail-client.json',{k:config[k] for k in ['client_id','client_secret'] if k in config})
  (ROOT/'gmail-token.json').unlink(missing_ok=True)
 return {'ok':True}

def status():
 return {'configured':bool(_read('gmail-client.json').get('client_id')),
         'authorized':bool(_read('gmail-token.json').get('refresh_token')),
         'scope':'read-only'}

def start():
 with LOCK:
  config=_read('gmail-client.json')
  if not config.get('client_id'):return {'ok':False,'requiresConfiguration':True}
  state=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(48)
  PENDING.clear();PENDING[state]=(verifier,time.time()+600)
  challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
  query={'client_id':config['client_id'],'redirect_uri':REDIRECT,'response_type':'code',
         'scope':SCOPE,'access_type':'offline','prompt':'consent','state':state,
         'code_challenge':challenge,'code_challenge_method':'S256'}
  return {'ok':True,'url':'https://accounts.google.com/o/oauth2/v2/auth?'+urlencode(query)}

def _exchange(payload):
 request=Request('https://oauth2.googleapis.com/token',data=urlencode(payload).encode())
 try:
  with urlopen(request,timeout=15) as response:return json.load(response)
 except Exception:raise ValueError('A autorização Google falhou. Volta a ligar a conta.') from None

def callback(query):
 with LOCK:
  state=query.get('state',[''])[0];pending=PENDING.pop(state,None)
  if not pending or pending[1]<time.time():raise ValueError('Autorização expirada ou inválida. Volta a ligar o Gmail.')
  if query.get('error') or not query.get('code'):raise ValueError('A autorização não foi concluída.')
  config=_read('gmail-client.json')
  data=_exchange({**config,'grant_type':'authorization_code','code':query['code'][0],
                  'redirect_uri':REDIRECT,'code_verifier':pending[0]})
  if not data.get('refresh_token'):raise ValueError('Falta autorização persistente. Volta a ligar o Gmail.')
  data['expires_at']=time.time()+data.get('expires_in',3600)
  _save('gmail-token.json',data)

def _access():
 with LOCK:
  token=_read('gmail-token.json')
  if not token.get('refresh_token'):raise ValueError('Liga primeiro o Gmail na Sala de Comando.')
  if token.get('expires_at',0)<time.time()+60:
   update=_exchange({**_read('gmail-client.json'),'grant_type':'refresh_token','refresh_token':token['refresh_token']})
   token.update(update);token['expires_at']=time.time()+update.get('expires_in',3600)
   _save('gmail-token.json',token)
  return token['access_token']

def _get(path,token):
 request=Request('https://gmail.googleapis.com/gmail/v1/users/me/'+path,headers={'Authorization':'Bearer '+token})
 try:
  with urlopen(request,timeout=12) as response:return json.load(response)
 except Exception:raise ValueError('Não consegui consultar o Gmail. Verifica a Gmail API e a autorização da conta.') from None

def inbox():
 token=_access()
 rows=_get('messages?'+urlencode({'maxResults':5,'labelIds':'INBOX'}),token)
 messages=[]
 for item in rows.get('messages',[]):
  data=_get('messages/'+item['id']+'?format=metadata&metadataHeaders=Subject&metadataHeaders=From',token)
  headers={h['name'].lower():h['value'] for h in data.get('payload',{}).get('headers',[])}
  messages.append({'id':item['id'],'subject':headers.get('subject','Sem assunto')[:240],
                   'from':headers.get('from','')[:240],'unread':'UNREAD' in data.get('labelIds',[])})
 return {'ok':True,'verifiedAt':time.time(),'messages':messages}

def disconnect():
 with LOCK:
  (ROOT/'gmail-token.json').unlink(missing_ok=True);PENDING.clear()
 return {'ok':True}
