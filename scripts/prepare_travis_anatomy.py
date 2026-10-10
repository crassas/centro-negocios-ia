"""Build bounded geometry assets from official BodyParts3D 4.0 PART-OF OBJ.
Usage: python scripts/prepare_travis_anatomy.py /path/to/bodyparts-source
Offline after download; requires numpy and fast-simplification at build time only.
"""
import base64, collections, csv, hashlib, json, pathlib, re, sys, zipfile
import numpy as np
import fast_simplification
src=pathlib.Path(sys.argv[1]); root=pathlib.Path(__file__).resolve().parents[1]
out=root/'assets/travis/anatomy'; out.mkdir(parents=True,exist_ok=True)
z=zipfile.ZipFile(src/'partof_BP3D_4.0_obj_99.zip')
files={pathlib.Path(n).stem:n for n in z.namelist() if n.endswith('.obj')}
concepts=collections.defaultdict(set)
for r in csv.DictReader((src/'partof_element_parts.txt').open(),delimiter='\t'):
 concepts[r['concept id']].add(r['element file id'])
# Element concepts can be absent from the compound table.
for fid,path in files.items():
 for line in z.read(path).decode().splitlines()[:25]:
  if line.startswith('# Concept ID :'): concepts[line.split(':',1)[1].strip()].add(fid)
def members(ids):return set().union(*(concepts['FMA'+str(i)] for i in ids))&files.keys()
bones=members([23876]); used=set()
# PART-OF Skeleton (in vivo) omits limb meshes. Add explicitly named skeletal
# elements; use this set to filter whole-hand/foot compounds (which also contain
# vessels and muscles). Do not label those soft tissues as bones.
for fid,path in files.items():
 header=z.read(path).decode()[:2200]; match=re.search(r'# English name : (.+)',header)
 name=match[1].lower() if match else ''
 if re.search(r'\b(?:bone|humerus|femur|tibia|fibula|ulna|radius|patella|phalanx|talus|calcaneus)\b',name) and not re.search(r'artery|vein|muscle|ligament|tendon|tract|branch',name): bones.add(fid)

groups=[
 ('jaw','Mandíbula','Jaw',['mandibula','maxilar inferior','jaw','mandible'],[52748],3500,'bone'),
 ('skull','Crânio','Skull',['cranio','cabeca','skull','head'],[46565],20000,'bone'),
 ('spine','Coluna vertebral','Spine',['coluna','coluna vertebral','vertebras','spine','vertebral column'],[13478],18000,'bone'),
 ('ribs','Caixa torácica','Rib cage',['costelas','torax','caixa toracica','ribs','rib cage','thorax'],[7480],13000,'bone'),
 ('pelvis','Bacia','Pelvis',['bacia','pelvis','anca','hip'],[16586,16587],6000,'bone'),
 ('shoulders','Ombros','Shoulders',['ombros','claviculas','omoplatas','shoulders','clavicles'],[24163,24164],4000,'bone'),
 ('arms','Úmeros','Upper arms',['umeros','umero','bracos','humerus','upper arms','arms'],[23130,23131],4000,'bone'),
 ('forearms','Antebraços','Forearms',['antebracos','radio','cubito','forearms','radius','ulna'],[23464,23465,23467,23468],4500,'bone'),
 ('hands','Mãos','Hands',['maos','mao','hands','hand'],[9713,9714],7000,'bone'),
 ('femurs','Fémures','Femurs',['femures','femur','coxas','femurs','thighs'],[24474,24475],5000,'bone'),
 ('shins','Tíbias e fíbulas','Lower legs',['tibias','tibia','fibula','fibulas','pernas','shins','lower legs'],[24477,24478,24480,24481],5000,'bone'),
 ('feet','Pés','Feet',['pes','pe','feet','foot'],[11343,11344],7000,'bone'),
 ('other-bones','Outros ossos e cartilagens','Other bones and cartilage',['outros ossos','cartilagens','other bones','cartilage'],[23876],3500,'bone'),
 ('brain','Cérebro','Brain',['cerebro','encefalo','brain'],[50801],18000,'organ'),
 ('heart','Coração','Heart',['coracao','heart'],[7088],11000,'organ'),
 ('lungs','Pulmões','Lungs',['pulmoes','pulmao','lungs','lung'],[7309,7310],11000,'organ'),
 ('liver','Fígado','Liver',['figado','liver'],[7197],7000,'organ'),
 ('stomach','Estômago','Stomach',['estomago','stomach'],[7148],5000,'organ'),
 ('kidneys','Rins','Kidneys',['rins','rim','kidneys','kidney'],[7204,7205],5000,'organ'),
 ('intestines','Intestinos','Intestines',['intestinos','intestino','intestines','intestine','bowel'],[7200,7201],10000,'organ'),
 ('pancreas','Pâncreas','Pancreas',['pancreas'],[7198],3000,'organ')]
cache={}
def read(fid):
 if fid in cache:return cache[fid]
 v=[];f=[]
 for l in z.read(files[fid]).decode().splitlines():
  if l.startswith('v '):v.append([float(n) for n in l.split()[1:4]])
  elif l.startswith('f '):
   face=[int(n.split('/')[0])-1 for n in l.split()[1:]]
   for j in range(1,len(face)-1):f.append([face[0],face[j],face[j+1]])
 va=np.asarray(v,dtype=np.float64);fa=np.asarray(f,dtype=np.int32)
 # Weld OBJ normal/UV seams before simplification, retaining coordinates.
 unique,inv=np.unique(va,axis=0,return_inverse=True); fa=inv[fa].astype(np.int32)
 cache[fid]=(unique,fa);return cache[fid]
allbone=np.concatenate([read(fid)[0] for fid in sorted(bones)])
low,high=allbone.min(0),allbone.max(0);origin=(low+high)/2; factor=2.6/(high[2]-low[2])
print('Source bounds',low,high,'scale',factor,flush=True)
metadata=[];total=0
for gid,pt,en,aliases,ids,budget,kind in groups:
 selected=bones.copy() if gid=='other-bones' else members(ids)
 if kind=='bone':selected&=bones
 selected-=used;used|=selected
 if not selected:continue
 vertices=[];faces=[];offset=0
 weights={fid:len(read(fid)[1]) for fid in selected}; weight=sum(weights.values())
 for fid in sorted(selected):
  v,f=read(fid); count=min(len(f),max(30,int(budget*weights[fid]/max(1,weight))))
  if len(f)>count:v,f=fast_simplification.simplify(v,f,target_count=count,agg=7)
  vertices.append(v);faces.append(f+offset);offset+=len(v)
 v=np.concatenate(vertices);f=np.concatenate(faces)
 v=(v-origin)*factor;v=v[:,[0,2,1]];v[:,2]*=-1
 q=np.round(v*20000).astype('<i2');assert np.max(np.abs(v))<1.635
 assert len(v)<65536
 # Split by triangle groups if JSON would exceed the phone synchroniser limit.
 paths=[]
 for start in range(0,len(f),24000):
  ff=f[start:start+24000];vi,inv=np.unique(ff.ravel(),return_inverse=True);qq=q[vi];ii=inv.reshape(-1,3).astype('<u2')
  data={'version':1,'id':gid,'divisor':20000,'positions':base64.b64encode(qq.tobytes()).decode(),'indices':base64.b64encode(ii.tobytes()).decode()}
  content=json.dumps(data,separators=(',',':'));assert len(content)<450000
  path=f'{gid}-{len(paths)}.json';(out/path).write_text(content+'\n');paths.append(path)
 metadata.append({'id':gid,'pt':pt,'en':en,'aliases':aliases,'kind':kind,'files':paths,'fma':['FMA'+str(i) for i in ids],'elements':sorted(selected),'triangles':len(f)})
 total+=len(f);print(gid,len(selected),len(v),len(f),flush=True)
license_text='''BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.
https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
https://creativecommons.org/licenses/by/4.0/
Source: BodyParts3D 4.0 PART-OF OBJ, official LATEST archive. Current licence verified 2026-10-10 (licensor update 2025-02-27); original OBJ comments still mention the older licence.
Adaptations for Travis: selected anatomical groups, mesh simplification, common coordinate transform, quantisation, colours and holographic rendering. Source FMA concepts and element IDs are in travis-anatomy-catalog.mjs. Adult male reference anatomy, simplified for educational visualisation; not an individual scan.
'''
(out/'ATTRIBUTION.txt').write_text(license_text)
(root/'travis-anatomy-catalog.mjs').write_text('// Derived from official BodyParts3D 4.0; see assets/travis/anatomy/ATTRIBUTION.txt.\nexport const ANATOMY_PARTS='+json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+';\n')
print('Total',total,'triangles',sum(p.stat().st_size for p in out.glob('*')),'bytes',flush=True)
