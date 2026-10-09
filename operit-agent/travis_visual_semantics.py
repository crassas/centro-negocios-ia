"""Read-only optional LLM interpreter for unfamiliar cinematic requests.

It does not execute commands, create real-world geometry or open a camera.
If the local model is sleeping, the regular no-cost intent parser still works.
"""
import json
import re
import unicodedata

SCENES={"planet","map","house","person","vehicle","landscape","diagram","object"}
SENSITIVE=re.compile(
    r"\b(?:youtube|github|gmail|bank|conta bancaria|password|senha|email|"
    r"camera|camara|my face|a minha cara|repositorio|repository|"
    r"pagamento|payment|website|webpage|browser|internet)\b",re.I)
NEGATIONS=re.compile(r"\b(?:don't|do not|never|nao|nunca|sem)\b.{0,45}"
                     r"\b(?:show|see|display|visual|mostrar|ver|projetar|imagine|imagina|draw|desenha|create|cria)\b",re.I)
CANDIDATE=re.compile(
    r"\b(?:imagine|imaginava|imagina|imaginar|what would|how would|"
    r"como seria|what if|i wonder|wondering|could we|poderiamos|"
    r"would love|fancy|apetece|gostava|queria|desenha|draw|"
    r"picture|illustrate|ilustra|hologram|holograma|"
    r"transforma|transform|metamorph|morph)\b",re.I)

def plain(text):
    return "".join(c for c in unicodedata.normalize("NFD",str(text).lower())
                   if not unicodedata.combining(c))

def candidate(text):
    if not isinstance(text,str) or not 6<=len(text)<=600:return False
    t=plain(text)
    return bool(CANDIDATE.search(t) and not SENSITIVE.search(t)
                and not NEGATIONS.search(t))

def validate(raw,user_text):
    if not candidate(user_text):return None
    if isinstance(raw,str):
        try:raw=json.loads(raw)
        except ValueError:
            match=re.search(r"\{[^{}]{1,1500}\}",raw,re.S)
            if not match:return None
            try:raw=json.loads(match.group())
            except ValueError:return None
    if not isinstance(raw,dict) or raw.get("intent")!="visual":return None
    try:confidence=float(raw.get("confidence",0))
    except (ValueError,TypeError):return None
    if not .76<=confidence<=1:return None
    scene=raw.get("scene")
    if scene not in SCENES:return None
    subject=raw.get("subject")
    if not isinstance(subject,str) or not 2<=len(subject)<=120:return None
    subject=" ".join(subject.split())
    if SENSITIVE.search(subject) or any(ch in subject for ch in "<>{}"):return None
    if len(subject)<2:return None
    return {"ok":True,"scene":scene,"title":subject[:100],
            "source":"on-device-semantic-intent","schematic":True}

SYSTEM=(
 "You classify a user's request into one visual intent. Return ONLY a JSON "
 "object with keys intent,scene,subject,confidence. intent is visual or none. "
 "A visual intent is a desire to VIEW/IMAGINE a conceptual 3D scene, "
 "including indirect, informal and colloquial English or Portuguese. "
 "scene must be one of planet,map,house,person,vehicle,landscape,diagram,object. "
 "subject is a SHORT noun phrase actually requested by the user. "
 "When the subject is unfamiliar but the request is clearly a visual concept, "
 "use scene object and preserve the requested noun. "
 "Do NOT classify an explanation, a question about facts, an instruction to "
 "open an app, a private photo/camera request, a negated instruction or a real "
 "business tool task as a 3D visualization. "
 "Never infer private identity or scene data. No tools or side effects. "
 "Confidence from 0 to 1. /no_think"
)

def resolve(text,request_model=None):
    if not candidate(text):return {"ok":False,"reason":"not-a-visual-request"}
    if request_model is None:return {"ok":False,"reason":"semantic-model-unavailable"}
    try:raw=request_model(SYSTEM,text)
    except Exception:return {"ok":False,"reason":"semantic-model-unavailable"}
    return validate(raw,text) or {"ok":False,"reason":"not-a-confirmed-scene"}
