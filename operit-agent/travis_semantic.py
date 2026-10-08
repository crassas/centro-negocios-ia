#!/usr/bin/env python3
"""Bounded, evidence-aware natural-language router for the local Travis.

Open vocabulary: the model proposes intent, not permissions. Actions must
pass this independent allowlist, validated arguments and confidence gate.
"""
from __future__ import annotations
import json,re,unicodedata
from dataclasses import dataclass
from typing import Callable,Optional

# Read-only and in-app controls. Repository edits / writes are intentionally
# excluded: the explicit legacy authorization and agent workflow handles them.
INTENTS={
 "conversation":"Open-ended dialogue, explanation, creative text, or a question that requires no real-time tool.",
 "web_search":"Show public web search results for a subject inside Travis, including Google-like searches.",
 "web_research":"Research a subject with supporting web pages; slower than web_search.",
 "web_open":"Display a named, known public website or an explicit URL in Travis without navigating away.",
 "web_read":"Summarise an explicitly supplied public page URL.",
 "open_youtube":"Show the YouTube search/player hologram.",
 "search_youtube":"Search for videos by topic, creator or title in the in-app YouTube viewer.",
 "close_youtube":"Close the video/search player without closing Travis.",
 "pause_youtube":"Pause the current embedded video.",
 "resume_youtube":"Resume the current embedded video.",
 "close_projection":"Close the active projected results, search or hologram.",
 "projects_status":"List or check local project status, not change files.",
 "repo_access":"Show which Git repositories can be accessed.",
 "task_list":"List the existing recorded tasks.",
 "gmail_inbox":"Read latest email subjects from the connected Gmail account.",
 "agent_sessions":"Show execution agents and their running tasks.",
 "site_check":"Check a deployed site's availability, not the search position.",
 "search_positions":"Look up saved SEO/Search Console ranking evidence.",
 "system_status":"Inspect Centro Server health and memory.",
 "brain_status":"Show what the brain-simulation software has actually done.",
 "neural_status":"Show neural-memory graph counts.",
 "neural_recall":"Retrieve known memory for a specific topic.",
 "capabilities_status":"Describe available registered tools, not hypothetical abilities.",
}
NEEDS_QUERY={"web_search","web_research","search_youtube","neural_recall"}
NEEDS_WEBSITE={"web_open","web_read"}
SAFE_EMPTY_ARGS=set(INTENTS)-NEEDS_QUERY-NEEDS_WEBSITE-{"conversation"}
SITE_NAMES={
 "google":"https://www.google.com/",
 "youtube":"https://www.youtube.com/",
 "wikipedia":"https://pt.wikipedia.org/",
 "github":"https://github.com/",
 "gmail":"https://mail.google.com/",
 "google maps":"https://www.google.com/maps",
 "maps":"https://www.google.com/maps",
 "chatgpt":"https://chatgpt.com/",
 "pentehouse":"https://pentehouse.pt/",
 "best pizza":"https://bestpizzaandkebab.pt/",
 "beatriz":"https://engomadoriabeatriz.pt/",
}
INTENT_SCHEMA={
 "type":"object","properties":{
  "intent":{"type":"string","enum":list(INTENTS)},
  "query":{"type":"string"},
  "website":{"type":"string"},
  "confidence":{"type":"number","minimum":0,"maximum":1},
 },
 "required":["intent","query","website","confidence"],
 "additionalProperties":False,
}
def _plain(text):
 return "".join(c for c in unicodedata.normalize("NFD",str(text).lower()) if not unicodedata.combining(c))
def _user_sentence(text):
 t=str(text or "").strip()
 return re.sub(r"^(?:travis|jarvis)[,:;.!?\s]+","",t,flags=re.I).strip()
def _quoted_or_negative(text):
 """Never route a negated instruction as an action."""
 t=_plain(_user_sentence(text))
 if re.search(r"(?:^|\s)(?:nao|nunca|jamais|don't|do not|never|without|sem)\s+(?:[a-z]+\s+){0,3}(?:abr|fech|alter|mex|apag|elimin|public|mand|envi|proc|pesqui|sele|abri|open|close|delete|send|publish|search|find|play|select)",t):
  return True
 return False

def candidates_for(text,projection=""):
 t=_plain(_user_sentence(text))
 if re.search(r"\b(?:youtube|you tube|utube|iutube|videos?|video|musicas?|music|songs?|clipes?|documentarios?|playlist)\b",t):
  return ["conversation","open_youtube","search_youtube","close_youtube","pause_youtube","resume_youtube","close_projection"]
 if re.search(r"\b(?:google|web|internet|browser|navegador|pesquisa|resultados|paginas?)\b",t):
  return ["conversation","web_search","web_open","web_read","web_research","close_projection"]
 if re.search(r"\b(?:emails?|gmail|correio|inbox|caixa de entrada)\b",t):
  return ["conversation","gmail_inbox","capabilities_status"]
 if re.search(r"\b(?:tarefas?|tasks?|to-do|lista de coisas)\b",t):
  return ["conversation","task_list","capabilities_status"]
 if re.search(r"\b(?:agentes?|sessoes?|agents?|equipa)\b",t):
  return ["conversation","agent_sessions","system_status"]
 if re.search(r"\b(?:projetos?|projectos?|repositorios?|github|repositories|sites?|ranking|seo)\b",t):
  return ["conversation","projects_status","repo_access","site_check","search_positions"]
 if re.search(r"\b(?:cerebro|neuronios?|memoria|dream|brain|memory|sistema)\b",t):
  return ["conversation","system_status","brain_status","neural_status","neural_recall"]
 return list(INTENTS)

def prompt_for(text,history=(),active_project=None,projection=""):
 turns=[]
 for item in list(history)[-3:]:
  turns.append({"user":str(item.get("user",""))[:200],"tool":str(item.get("tool",""))[:45]})
 guide="\n".join(k+": "+INTENTS[k] for k in candidates_for(text,projection))
 system=(
  "You are the intent parser of a PRIVATE local assistant. Produce ONE JSON object only. "
  "Choose the SINGLE best action for the CURRENT USER utterance, in European Portuguese or English, "
  "including informal wording, paraphrases, mistakes and follow-ups. "
  "Do not try to match a list of keywords: infer meaning and intent. "
  "Choose conversation for questions about HOW to act, negations, hypotheticals or uncertain requests. "
  "No modifying operations are permitted. History resolves clear references only. "
  "A video topic means search_youtube, never web_search. Generic web results mean web_search. "
  "Use web_research only for deep analysis. No invented websites; use known site name or literal URL. "
  "For *_search or neural_recall, query is the real topic without filler. "
  "For web_open/web_read, website is the known site name or explicit URL; otherwise empty. "
  "Other intents leave both query and website empty. "
  "Confidence >=0.80 ONLY for unambiguous actions. "
  "Return keys intent, query, website, confidence. Choose only from:\n"+guide)
 user=json.dumps({"current":_user_sentence(text)[:700],"currentProject":active_project or "",
   "projection":projection or "","recentHistory":turns},ensure_ascii=False)
 return system,user

def parse_proposal(raw)->Optional[dict]:
 if isinstance(raw,dict):return raw
 value=str(raw or "").strip()
 try:return json.loads(value)
 except (ValueError,TypeError):
  match=re.search(r"\{.*\}",value,re.S)
  if match:
   try:return json.loads(match.group())
   except ValueError:pass
 return None

def validate_proposal(raw,user_text,allowed_websites=SITE_NAMES):
 obj=parse_proposal(raw)
 if not isinstance(obj,dict):return None
 intent=obj.get("intent")
 if intent not in INTENTS or intent=="conversation":return None
 try:confidence=float(obj.get("confidence",0))
 except (ValueError,TypeError):return None
 if not .80<=confidence<=1:return None
 if _quoted_or_negative(user_text):return None
 if intent in NEEDS_QUERY:
  q=obj.get("query")
  if not isinstance(q,str):return None
  q=" ".join(q.split())[:240]
  if len(q)<2 or q.lower() in {"it","that","isto","isso","aquilo"}:return None
  return intent,({"query":q} if intent!="neural_recall" else {"query":q})
 if intent in NEEDS_WEBSITE:
  site=str(obj.get("website") or "").strip()[:1500]
  if not site:return None
  raw=_plain(site).strip().strip(".")
  if raw in allowed_websites:site=allowed_websites[raw]
  else:
   # No hallucinated hostnames. The URL must be explicitly present in the request.
   explicit=re.findall(r"https?://[^\s<>'\\\"\\)]+",user_text,re.I)
   if not any(site.rstrip("/")==url.rstrip(".,!?/") for url in explicit):return None
  if intent=="web_read":return intent,{"url":site}
  return intent,{"url":site}
 if intent in SAFE_EMPTY_ARGS:return intent,{}
 return None

def interpret(text,propose:Callable,history=(),active_project=None,projection=""):
 """Return validated (tool, args) or None; never execute a tool here."""
 if not isinstance(text,str) or not text.strip() or len(text)>1000:return None
 system,user=prompt_for(text,history,active_project,projection)
 try:raw=propose(system,user)
 except Exception:return None
 result=validate_proposal(raw,text)
 if result and result[0] not in candidates_for(text,projection):return None
 return result

# Hot-path intents. These avoid a twenty-second LLM call for everyday phrases;
# unfamiliar phrasing still gets the model-backed interpreter.
def fast_interpret(text,history=(),projection=""):
 if not isinstance(text,str) or not text.strip():return None
 t=_plain(_user_sentence(text)).lower().strip(" .,!?:;")
 t=re.sub(r"\s+"," ",t)
 t=t.replace("-me"," me ")
 t=re.sub(r"\s+"," ",t).strip(" ,")
 if _quoted_or_negative(text):return None
 if re.match(r"^(?:como|porque|por que|what is|why|how do|how can|e se|what if)\b",t):return None
 t=re.sub(r"^(?:(?:olha|entao|bem|travis|amigo|por favor|please)[,\s]+){0,3}","",t)
 t=re.sub(r"^(?:(?:podes|podias|consegues|poderias|can you|could you|please|por favor)\s+){1,2}","",t)
 t=re.sub(r"^(?:(?:eu |i )?(?:quero|queria|gostava de|preciso de|would like to|want to)\s+(?:que |ver |ir |a |to )?){1,2}","",t)
 t=t.strip(" ,")
 if t.startswith(("ao ","no ","na ","para o ")) and t.split(" ",1)[-1] in SITE_NAMES:t=t.split(" ",1)[-1]
 if not t:return None
 current=_plain(projection or "")
 active_media=current=="youtube" or any(item.get("tool") in {"open_youtube","search_youtube","play_youtube"} for item in list(history)[-1:])
 active_web=current.startswith("web-")
 if t in {"youtube","iutube","utube","you tube"} and _plain(_user_sentence(text)).strip()!=t:return "open_youtube",{}
 if t=="google" and _plain(_user_sentence(text)).strip()!=t:return "web_open",{"url":SITE_NAMES["google"]}
 if active_web and re.fullmatch(r"(?:volta|regressa|volta para mim|volta ao travis|fecha|sai|hide|close|back|back to travis)",t):
  return "close_projection",{}
 if re.fullmatch(r"(?:fecha|fechar|tira|sai|sair|esconde|oculta|close|hide|exit|dismiss|volta|regressa)(?:\s+(?:o|a|ao|aqui|para|the|back to|para o))?\s*(?:google|youtube|pesquisa|web|site|browser|navegador|holograma|projecao|projection|painel|janela|travis|isso|isto|it|that|esta pagina|pagina)?",t):
  if "youtube" in t or (active_media and any(x in t for x in ["isso","it","fecha","close","tira"])):return "close_youtube",{}
  if active_web or re.search(r"\b(?:google|web|site|holograma|projecao|painel|browser|navegador|pesquisa|travis)\b",t):return "close_projection",{}
 if re.fullmatch(r"(?:pausa|pausar|suspende|stop|pause)(?:\s+(?:o|the))?\s*(?:video|youtube|reproducao|it|isso)?",t) and active_media:
  return "pause_youtube",{}
 if re.fullmatch(r"(?:continua|continua a reproduzir|retoma|resume|play|despausa)(?:\s+(?:o|the))?\s*(?:video|youtube|reproducao|it|isso)?",t) and active_media:
  return "resume_youtube",{}
 open_verb=r"(?:mostra me|mostra|mostrar|abre|abrir|mete|poe|po|liga|vai|visita|entra|acede|open|show|go to|take me to|bring up|load|launch|start)"
 action=re.match(r"^"+open_verb+r"\b\s*(.*)$",t)
 if action:
  remainder=re.sub(r"^(?:(?:-me|me|o|a|ao|na|no|para|the|my|os|um|uma)\s+){0,4}","",action.group(1)).strip()
  if remainder in {"youtube","iutube","utube","you tube","yt"}:return "open_youtube",{}
  if remainder in SITE_NAMES:return "web_open",{"url":SITE_NAMES[remainder]}
  if remainder.startswith(("youtube ","you tube ")):
   topic=re.sub(r"^(?:youtube|you tube)\s+(?:e\s+)?(?:pesquisa|procura|mostra|videos?|por|de|sobre)?\s*","",remainder).strip()
   if topic:return "search_youtube",{"query":topic[:240]}
  if remainder.startswith(("google ","pesquisa no google ")):
   topic=re.sub(r"^google\s+(?:pesquisa|procura|por|de|sobre|for)?\s*","",remainder).strip()
   if topic:return "web_search",{"query":topic[:240]}
 search=re.match(r"^(?:pesquisa|pesquisar|procura|procurar|buscar|busca|pesquisas|search|find|look up)\s+(.*)$",t)
 if search and not re.search(r"\b(?:youtube|video|videos|musica|musicas|song|songs)\b",t):
  topic=re.sub(r"^(?:o|a|os|as|me|no|na|em|sobre|por|para|for|about|on|the)\s+","",search.group(1).strip())
  topic=re.sub(r"\s+(?:no|na|in|on)\s+(?:google|internet|web)$","",topic).strip()
  if len(topic)>2:return "web_search",{"query":topic[:240]}
 # Natural expressions about video playback/search, without rigid word order.
 if re.search(r"\b(?:youtube|videos?|video-clips?|videoclipes?|clipes?|musicas?|music|songs?|cancoes?|documentarios?)\b",t):
  if re.search(r"\b(?:quero|ver|assistir|quero assistir|procura|pesquisa|mostra|poe|mete|toca|ouve|reproduz|encontra|localiza|find|show|search|watch|play|listen|por|sobre|do|da|dos|de)\b",t):
   topic=re.sub(r"^(?:(?:arranja|encontra|localiza|assiste|assistir|mostra|mostra me|ve|ver|poe|mete|quero ver|quero ouvir|quero|reproduz|ouve|toca|pesquisa|procura|search|find|show|watch|play)\s+){1,3}","",t)
   topic=re.sub(r"^(?:(?:me|no|na|um|uma|uns|alguns|some|the|o|os|a|as)\s+){0,4}","",topic)
   topic=re.sub(r"^(?:(?:youtube|videos?|clipes?|musicas?|songs?|documentarios?)\s*(?:de|do|da|sobre|com|by|from|about|of|por)?\s*){1,2}","",topic).strip()
   topic=re.sub(r"\s+(?:no|on)\s+youtube$","",topic).strip()
   topic=re.sub(r"\s+(?:e\s+)?(?:deixa me escolher|mostra os resultados|para eu escolher)$","",topic).strip()
   if topic and topic not in {"youtube","videos","video","musica","music","songs"}:
    return "search_youtube",{"query":topic[:240]}
  if re.search(r"\b(?:youtube|iutube|utube)\b",t) and any(verb in t for verb in ["entra","liga","abre","abrir","ir","show","open"]):
   return "open_youtube",{}
 if current.startswith("web-") and re.fullmatch(r"(?:volta|regressa|fecha|sai|hide|close|back|back to travis)",t):
  return "close_projection",{}
 # General task/domain recognition independent of a specific command wording.
 observe=bool(re.search(r"\b(?:ve|ver|olha|mostra|mostra me|consulta|confirma|confere|verifica|analisa|espreita|diz me|informa|le|ler|check|show|tell|read|look|see|how are|como andam|como vao|como estao|quais|what|existe|tenho|estado|funcionam|no ar|ponto da situacao|resumo|como vai|como esta|o que ha|que tenho)\b",t))
 observe=observe or bool(re.match(r"^(?:olha|ve|mostra)[,\s]",_plain(_user_sentence(text))))
 if observe:
  if re.search(r"\b(?:correio|emails?|mails?|gmail|inbox|caixa de entrada)\b",t):return "gmail_inbox",{}
  if re.search(r"\b(?:tarefas?|tasks?|to-do|trabalhos pendentes)\b",t):return "task_list",{}
  if re.search(r"\b(?:agentes?|equipa|agent sessions|agents)\b",t):return "agent_sessions",{}
  if re.search(r"\b(?:repositorios?|repositories|repos?|github)\b",t):return "repo_access",{}
  if re.search(r"\b(?:sites?|paginas? publicadas)\b",t) and re.search(r"\b(?:ar|online|disponiveis|funcionam|disponibilidade|vivos|ativos|activo|ativo|estado|check|verifica|confirma)\b",t):
   return "site_check",{"target":None}
  if re.search(r"\b(?:posicoes?|ranking|seo|search console)\b",t):return "search_positions",{"target":None}
  if re.search(r"\b(?:memoria|lembrancas?|neuronios?|cerebro)\b",t):return "neural_status",{}
  if re.search(r"\b(?:servidor|centro server|sistema|estacao)\b",t):return "system_status",{}
 return None

def should_use_model(text):
 """Semantic routing is reserved for likely operational requests."""
 t=_plain(_user_sentence(text)).strip()
 if len(t)>650 or len(t)<5 or _quoted_or_negative(text):return False
 if re.match(r"^(?:explica|explique|ensina|ensina-me|define|traduz|corrige o texto|o que e|quem foi|porque|por que|how does|what is|who was)\b",t):return False
 return bool(re.search(
  r"\b(?:quero|queria|preciso|podes|podias|consegues|mostra|mete|poe|abre|abrir|fecha|"
  r"pesquisa|procura|verifica|consulta|olha|vê|ve|veja|olha|informa|descobre|busca|encontra|"
  r"google|youtube|web|sites?|videos?|musica|tarefas?|trabalhos?|agentes?|emails?|gmail|"
  r"repo(?:sitorios?)?|github|dados|estatisticas?|ranking|posicoes|sistema|cerebro|"
  r"analisa|investiga|equipa|correio|mails?|documentarios?|assiste|assistir|resumo|ponto da situacao|inspect|show|open|find|search|check|close|watch|play|"
  r"read|my|site|task|email|browser|agents?|remember)\b",t))
