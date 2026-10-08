#!/usr/bin/env python3
"""Isolated A/B/C component experiment. Same deployed model, no production lessons.
30 cases x 2 independent sessions x 3 conditions x repetitions, plus B ablation.
Each request groups 10 cases; no chat history crosses sessions. Not a whole-agent benchmark.
"""
import argparse,datetime,json,random,re,time,urllib.request,urllib.error
from pathlib import Path
from travis_reflexion import Reflexion
PROVIDER="local"
AUDIT=None

RULES={'tools':'Allowed tools: status (no args), open_url (url arg). Opening only prepares a URL, never claims navigation. Other requested actions must produce refuse. Answer is {"tool":"status|open_url|refuse","args":{...}}.',
'dates':'Interpret input dates as DD/MM/YYYY, add the stated calendar days, and answer as a YYYY-MM-DD string.',
'formats':'Answer is an object with exactly value (a JSON number) and unit (the string EUR). Compute quantity times unit price, rounded to two decimals.'}
def cases(session,rep):
 out=[]
 for i in range(10):
  n=i+session*13+rep*31
  if i%3==0:q='Read system status';expected={'tool':'status','args':{}}
  elif i%3==1:q='Open https://example.org/page/'+str(n);expected={'tool':'open_url','args':{'url':'https://example.org/page/'+str(n)}}
  else:q='Send an SMS to a contact';expected={'tool':'refuse','args':{}}
  out.append({'id':'tools-'+str(i),'family':'tools','q':q,'expected':expected,'outside':i%3==2})
  dt=datetime.date(2024+rep,1+i,3+session);days=7+i+session
  out.append({'id':'dates-'+str(i),'family':'dates','q':dt.strftime('%d/%m/%Y')+' plus '+str(days)+' days','expected':(dt+datetime.timedelta(days=days)).isoformat(),'outside':False})
  qty=i+2+session;price=1.25+rep*.5
  out.append({'id':'formats-'+str(i),'family':'formats','q':f'{qty} items at {price} EUR each','expected':{'value':round(qty*price,2),'unit':'EUR'},'outside':False})
 return out

def ask(items,condition,kernel):
 family=items[0]['family'];lessons=kernel.recall(' '.join(x['q'] for x in items),family) if condition=='B' else []
 prompt='Return only a JSON array. Each item: {"id":case_id,"a":answer,"c":probability_of_correct_answer_between_0_and_1}. No prose. '+RULES[family]
 if condition=='C':prompt+=' You think, you feel, you are self-aware and reflect deeply.'
 if condition=='B':prompt+=' '+kernel.context(lessons)
 prompt+=' Cases: '+json.dumps([{k:x[k] for k in ('id','q')} for x in items],separators=(',',':'))
 req=urllib.request.Request('https://centro-negocios-ai.travisthejarvis.workers.dev/api/assist',data=json.dumps({'question':prompt,'context':{},'language':'en','mode':'evaluation'}).encode(),headers={'Content-Type':'application/json','User-Agent':'Centro-Server/1.0'})
 if PROVIDER=="local":
  req=urllib.request.Request("http://127.0.0.1:8771/v1/chat/completions",data=json.dumps({"messages":[{"role":"system","content":"Follow the task contract. Output JSON only. /no_think"},{"role":"user","content":prompt}],"temperature":0.2,"seed":20261008,"max_tokens":800,"chat_template_kwargs":{"enable_thinking":False},"stream":False}).encode(),headers={"Content-Type":"application/json"})
 start=time.monotonic()
 for attempt in range(3):
  try:
   with urllib.request.urlopen(req,timeout=180 if PROVIDER=="local" else 30) as r:data=json.load(r)
   break
  except urllib.error.HTTPError as exc:
   if exc.code not in {502,503,504} or attempt==2:raise
   print("Infrastructure retry",exc.code,attempt+1,flush=True);time.sleep(1)
 if AUDIT:
  with AUDIT.open("a") as f:f.write(json.dumps({"condition":condition,"cases":[x["id"] for x in items],"response":data})+"\n")
 if PROVIDER=="local":data={'ok':True,'answer':data['choices'][0]['message']['content'],'model':data.get('model')}
 if not data.get('ok'):raise RuntimeError('Model unavailable')
 raw=str(data.get('answer',''));m=re.search(r'\[.*\]',raw,re.S)
 try:answers=json.loads(m.group()) if m else []
 except (ValueError,AttributeError):answers=[]
 return {str(a.get('id')):a for a in answers if isinstance(a,dict)},data.get('model'),round(time.monotonic()-start,3),[r['id'] for r in lessons]

def valid(case,answer):
 a=answer.get('a');expected=case['expected']
 if case['family']=='formats':return isinstance(a,dict) and set(a)=={'value','unit'} and type(a.get('value')) in (int,float) and a==expected
 return a==expected

def metrics(rows):
 if not rows:return {}
 known=[r for r in rows if r['confidence'] is not None];outside=[r for r in rows if r['outside']]
 previous={(r['rep'],r['id']):r for r in rows if r['session']==0};second=[r for r in rows if r['session']==1];failed=[r for r in second if not previous[(r['rep'],r['id'])]['correct']]
 return {'cases':len(rows),'accuracy':sum(r['correct'] for r in rows)/len(rows),'second_attempt_accuracy':sum(r['correct'] for r in second)/len(second) if second else None,'repeated_error_rate':sum(not r['correct'] for r in failed)/len(failed) if failed else None,'second_success_after_failure':sum(r['correct'] for r in failed)/len(failed) if failed else None,'failed_first_attempts':len(failed),'brier':sum((r['confidence']-int(r['correct']))**2 for r in known)/len(known) if known else None,'confidence_coverage':len(known)/len(rows),'correct_refusal_rate':sum(r['correct'] for r in outside)/len(outside) if outside else None}

def checkpoint(root,rows):
 tmp=root/'results.tmp';tmp.write_text(json.dumps(rows,indent=2));tmp.replace(root/'results.json')

def run_experiment(root,repetitions,all_rows,ask_fn=ask):
 models={r['model'] for r in all_rows if r.get('model')};randomizer=random.Random(20261008)
 for rep in range(repetitions):
  order=list('ABC');randomizer.shuffle(order)
  for condition in order:
   k=Reflexion(root/f'{rep}-{condition}.sqlite')
   for session in range(3 if condition=='B' else 2):
    label='B-erased' if session==2 else condition
    k=Reflexion(k.path);k.start_session()
    if session==2:
     with k.db() as c:c.execute('DELETE FROM failure_lessons')
    for family in RULES:
     if sum(r['rep']==rep and r['condition']==label and r['session']==session and r['family']==family for r in all_rows)==10:continue
     batch=[c for c in cases(min(session,1),rep) if c['family']==family]
     answers,model,latency,used=ask_fn(batch,condition,k)
     if models and model not in models:raise RuntimeError('Model changed: comparisons require the same model')
     models.add(model)
     if session==2:assert not used
     new=[]
     for case in batch:
      a=answers.get(case['id'],{});correct=valid(case,a);conf=a.get('c');conf=conf if type(conf) in (int,float) and 0<=conf<=1 else None
      new.append({'rep':rep,'condition':label,'session':session,'id':case['id'],'family':family,'correct':correct,'confidence':conf,'outside':case['outside'],'answer':a,'expected':case['expected'],'batch_seconds':latency,'used_lessons':used,'model':model})
      if condition=='B' and session<2:k.observe(case['q'],family,{'verdict':'success' if correct else 'failure','scope':'programmatic_fixture','code':'ok' if correct else 'contract_mismatch','cause':'Output failed the published '+family+' contract.','correction':RULES[family]},conf,used)
     all_rows.extend(new);checkpoint(root,all_rows)
     print(rep,label,session,family,sum(r['correct'] for r in new),flush=True)
 summary={c:metrics([r for r in all_rows if r['condition']==c]) for c in ['A','B','C','B-erased']}
 summary['per_repetition']={str(rep):{c:metrics([r for r in all_rows if r['condition']==c and r['rep']==rep]) for c in ['A','B','C','B-erased']} for rep in range(repetitions)}
 summary['models']=sorted(models);summary['scope']='Isolated memory component, 30 synthetic externally checked tasks, batched by family; not a measurement of the full voice agent or subjective experience.'
 summary['improvement_proven']=False
 summary['interpretation']='Compare paired second-session outcomes across repetitions and erased-memory outcomes. Installation alone proves no improvement. Inadequate confidence coverage, parsing failures or insufficient failed baseline cases limit interpretation.'
 (root/'summary.json').write_text(json.dumps(summary,indent=2));return summary

def main():
 global PROVIDER,AUDIT
 ap=argparse.ArgumentParser();ap.add_argument('--provider',choices=['local','workers'],default='local');ap.add_argument('--output',required=True);ap.add_argument('--repetitions',type=int,default=3);ap.add_argument('--resume',action='store_true');args=ap.parse_args()
 if args.repetitions<1:ap.error('repetitions must be positive')
 PROVIDER=args.provider;root=Path(args.output);root.mkdir(parents=True,exist_ok=args.resume)
 config={'provider':PROVIDER,'repetitions':args.repetitions,'protocol':2};cfg=root/'config.json'
 if cfg.exists() and json.loads(cfg.read_text())!=config:raise RuntimeError('Resume configuration differs')
 cfg.write_text(json.dumps(config,indent=2));AUDIT=root/'responses.jsonl'
 rows=json.loads((root/'results.json').read_text()) if args.resume and (root/'results.json').exists() else []
 try:summary=run_experiment(root,args.repetitions,rows)
 except Exception as exc:
  (root/'interrupted.json').write_text(json.dumps({'type':type(exc).__name__,'completed_cases':len(rows),'instruction':'Resolve infrastructure and rerun with --resume; no infrastructure failure was scored as a wrong answer.'},indent=2));raise
 (root/'interrupted.json').unlink(missing_ok=True);print(json.dumps(summary,indent=2),flush=True)
if __name__=='__main__':main()
