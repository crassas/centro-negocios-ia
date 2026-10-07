#!/usr/bin/env python3
"""Public-web tools for Travis. Stdlib-only, local-first and SSRF-resistant."""
from __future__ import annotations
import html, ipaddress, re, socket, urllib.parse, urllib.request
from html.parser import HTMLParser

USER_AGENT="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/152 Safari/537.36 Travis/1.0"
SITE_ALIASES={
 "google":"https://www.google.com/",
 "youtube":"https://www.youtube.com/",
 "gmail":"https://mail.google.com/",
 "google maps":"https://maps.google.com/",
 "maps":"https://maps.google.com/",
 "google drive":"https://drive.google.com/",
 "drive":"https://drive.google.com/",
 "github":"https://github.com/",
 "wikipedia":"https://www.wikipedia.org/",
 "reddit":"https://www.reddit.com/",
 "instagram":"https://www.instagram.com/",
 "facebook":"https://www.facebook.com/",
 "linkedin":"https://www.linkedin.com/",
 "chatgpt":"https://chatgpt.com/",
 "openai":"https://openai.com/",
 "cloudflare":"https://www.cloudflare.com/",
}
QUESTION_PREFIXES=("quem ","qual ","quais ","quando ","onde ","porque ","por que ","o que ","como ","quanto ","quantos ")
FRESH_TERMS=("hoje","agora","actual","atual","recente","mais recente","ultimo","último","noticias","notícias","preco","preço","cotacao","cotação","tempo em","resultado","versao","versão")

def _norm(value):
 value=str(value or "").strip().lower()
 return "".join(c for c in __import__("unicodedata").normalize("NFD",value) if not __import__("unicodedata").combining(c))

def _host_is_public(host):
 if not host:return False
 h=host.strip("[]").lower()
 if h in {"localhost","localhost.localdomain"} or h.endswith(".local"):return False
 try:
  ip=ipaddress.ip_address(h)
  return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified)
 except ValueError:pass
 try:
  infos=socket.getaddrinfo(h,None,type=socket.SOCK_STREAM)
 except OSError:return False
 if not infos:return False
 for info in infos:
  try:
   ip=ipaddress.ip_address(info[4][0])
  except ValueError:return False
  if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:return False
 return True

def validate_public_url(url):
 raw=str(url or "").strip()
 try:parts=urllib.parse.urlsplit(raw)
 except ValueError:raise ValueError("URL inválido")
 if parts.scheme not in {"http","https"} or not parts.hostname or parts.username or parts.password:raise ValueError("URL público http/https obrigatório")
 if not _host_is_public(parts.hostname):raise ValueError("Destino local ou privado recusado")
 return urllib.parse.urlunsplit(parts)

def resolve_open_target(target):
 raw=str(target or "").strip()
 if not raw:raise ValueError("Indica o site ou endereço a abrir")
 explicit=re.search(r'https?://[^\s<>"]+',raw,re.I)
 if explicit:return {"url":validate_public_url(explicit.group(0).rstrip(".,;!?")),"label":explicit.group(0)}
 domain=re.search(r"(?<![@\w])(?:www\.)?[a-z0-9](?:[a-z0-9.-]{0,120}[a-z0-9])?\.(?:com|pt|org|net|io|ai|dev|app|co|eu)(?:/[^\s<>]*)?",raw,re.I)
 if domain:
  url=domain.group(0).rstrip(".,;!?")
  if not url.startswith(("http://","https://")):url="https://"+url
  return {"url":validate_public_url(url),"label":domain.group(0)}
 t=_norm(raw)
 for alias,url in sorted(SITE_ALIASES.items(),key=lambda x:len(x[0]),reverse=True):
  if re.search(r"\b"+re.escape(alias)+r"\b",t):
   return {"url":url,"label":alias}
 raise ValueError("Não reconheci o endereço. Diz o nome do site ou o domínio.")

def search_url(query,engine="google"):
 q=str(query or "").strip()
 if not q:raise ValueError("Pesquisa vazia")
 base="https://www.google.com/search?q=" if engine=="google" else "https://html.duckduckgo.com/html/?q="
 return base+urllib.parse.quote_plus(q)

def _request(url,timeout=10,max_bytes=1500000):
 url=validate_public_url(url)
 req=urllib.request.Request(url,headers={"User-Agent":USER_AGENT,"Accept":"text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.5","Accept-Language":"pt-PT,pt;q=0.9,en;q=0.7"})
 with urllib.request.urlopen(req,timeout=timeout) as response:
  final=validate_public_url(response.geturl())
  ctype=(response.headers.get("Content-Type") or "").lower()
  data=response.read(max_bytes+1)
  if len(data)>max_bytes:raise ValueError("Página excede o limite de leitura")
  charset=response.headers.get_content_charset() or "utf-8"
  return final,ctype,data.decode(charset,errors="replace")

class TextParser(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.skip=0;self.title_depth=0;self.title=[];self.parts=[]
 def handle_starttag(self,tag,attrs):
  if tag in {"script","style","noscript","svg","canvas","template"}:self.skip+=1
  if tag=="title":self.title_depth+=1
  if tag in {"p","div","article","section","li","h1","h2","h3","h4","br","tr"} and not self.skip:self.parts.append("\n")
 def handle_endtag(self,tag):
  if tag in {"script","style","noscript","svg","canvas","template"} and self.skip:self.skip-=1
  if tag=="title" and self.title_depth:self.title_depth-=1
  if tag in {"p","div","article","section","li","h1","h2","h3","h4","tr"} and not self.skip:self.parts.append("\n")
 def handle_data(self,data):
  if self.skip:return
  value=data.strip()
  if not value:return
  if self.title_depth:self.title.append(value)
  self.parts.append(value+" ")

def html_to_text(raw,max_chars=12000):
 parser=TextParser();parser.feed(raw)
 title=" ".join(parser.title).strip()
 text="".join(parser.parts)
 text=re.sub(r"[ \t\r\f\v]+"," ",text)
 text=re.sub(r"\n\s*\n+","\n",text).strip()
 return title,text[:max_chars]

def read_web(url,max_chars=12000,timeout=12):
 final,ctype,raw=_request(url,timeout=timeout)
 if "html" in ctype or "<html" in raw[:500].lower():
  title,text=html_to_text(raw,max_chars=max_chars)
 else:
  title="";text=re.sub(r"\s+"," ",raw).strip()[:max_chars]
 return {"url":final,"title":title,"text":text,"contentType":ctype[:120]}

class DDGParser(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.in_title=False;self.in_snippet=False;self.current=None;self.results=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);cls=a.get("class","")
  if tag=="a" and "result__a" in cls:
   self.current={"url":a.get("href",""),"title":"","snippet":""};self.in_title=True
  elif "result__snippet" in cls and self.current:self.in_snippet=True
 def handle_endtag(self,tag):
  if tag=="a" and self.in_title:
   self.in_title=False
   if self.current and self.current["title"].strip():self.results.append(self.current);self.current=None
  if self.in_snippet and tag in {"a","div","span"}:self.in_snippet=False
 def handle_data(self,data):
  if self.in_title and self.current:self.current["title"]+=data
  elif self.in_snippet and self.current:self.current["snippet"]+=data

def _unwrap_ddg(url):
 raw=html.unescape(str(url or ""))
 if raw.startswith("//"):raw="https:"+raw
 try:
  parts=urllib.parse.urlsplit(raw)
  if parts.hostname and parts.hostname.endswith("duckduckgo.com"):
   target=urllib.parse.parse_qs(parts.query).get("uddg",[""])[0]
   if target:return target
 except ValueError:pass
 return raw

class GenericLinkParser(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.href="";self.text=[];self.results=[]
 def handle_starttag(self,tag,attrs):
  if tag=="a":self.href=dict(attrs).get("href","");self.text=[]
 def handle_data(self,data):
  if self.href:self.text.append(data)
 def handle_endtag(self,tag):
  if tag!="a" or not self.href:return
  title=" ".join("".join(self.text).split());href=self.href;self.href="";self.text=[]
  if href.startswith("/url?"):
   href=urllib.parse.parse_qs(urllib.parse.urlsplit(href).query).get("q",[""])[0]
  if href.startswith(("http://","https://")) and 4<=len(title)<=180:self.results.append({"url":href,"title":title,"snippet":""})

def _clean_result(row):
 url=_unwrap_ddg(row.get("url",""))
 try:
  parts=urllib.parse.urlsplit(url)
  if parts.scheme not in {"http","https"} or not parts.hostname:return None
  if parts.hostname.endswith("duckduckgo.com"):return None
  if parts.hostname in {"127.0.0.1","localhost"}:return None
 except ValueError:return None
 return {"title":" ".join(str(row.get("title","")).split())[:240],"url":url,"snippet":" ".join(str(row.get("snippet","")).split())[:500]}

def search_web(query,limit=6,timeout=12):
 q=str(query or "").strip()
 if not q:raise ValueError("Pesquisa vazia")
 limit=max(1,min(int(limit),10))
 errors=[]
 sources=[
  ("ddg","https://html.duckduckgo.com/html/?q="+urllib.parse.quote_plus(q)),
  ("google","https://www.google.com/search?hl=pt-PT&num=10&q="+urllib.parse.quote_plus(q)),
 ]
 for kind,url in sources:
  try:
   final,ctype,raw=_request(url,timeout=timeout)
   parser=DDGParser() if kind=="ddg" else GenericLinkParser();parser.feed(raw)
   rows=[];seen=set()
   for item in parser.results:
    cleaned=_clean_result(item)
    if not cleaned or cleaned["url"] in seen:continue
    seen.add(cleaned["url"]);rows.append(cleaned)
    if len(rows)>=limit:break
   if rows:return {"query":q,"provider":kind,"results":rows}
  except Exception as exc:errors.append(kind+":"+type(exc).__name__)
 return {"query":q,"provider":"none","results":[],"errors":errors}

def _rank_results(query,rows):
 q=_norm(query)
 stop={"qual","quais","quem","onde","quando","como","porque","versao","versoes","mais","recente","actual","atual","latest","official"}
 tokens={x for x in re.findall(r"[a-z0-9]+",q) if len(x)>=3 and x not in stop}
 fresh=any(term in q for term in ("mais recente","ultimo","versao","release","latest","hoje","agora","actual","atual"))
 scored=[]
 for index,row in enumerate(rows):
  title=_norm(row.get("title",""));snippet=_norm(row.get("snippet",""))
  try:host=(urllib.parse.urlsplit(row.get("url","")).hostname or "").lower()
  except ValueError:host=""
  score=max(0,8-index)*.05
  score+=sum(2.2 for token in tokens if token in title)
  score+=sum(1.4 for token in tokens if token in host)
  score+=sum(.5 for token in tokens if token in snippet)
  if fresh and re.search(r"\b\d+(?:\.\d+){1,3}(?:rc\d+|a\d+|b\d+)?\b",title):score+=3.0
  if any(x in host for x in ("github.com","docs.","developer.","support.","blog.")):score+=.4
  scored.append((score,index,row))
 return [row for _,_,row in sorted(scored,key=lambda x:(-x[0],x[1]))]

def research_context(query,max_sources=3,max_chars_each=4200):
 search=search_web(query,limit=max(8,max_sources))
 merged=list(search["results"]);seen={r["url"] for r in merged}
 qnorm=_norm(query)
 if any(term in qnorm for term in ("mais recente","ultimo","versao","release","latest","hoje","agora","actual","atual")):
  extra=search_web(str(query)+" official latest",limit=8)
  for row in extra["results"]:
   if row["url"] not in seen:seen.add(row["url"]);merged.append(row)
 ranked=_rank_results(query,merged)
 sources=[]
 for row in ranked[:max_sources]:
  item={**row,"text":""}
  try:
   page=read_web(row["url"],max_chars=max_chars_each)
   item["url"]=page["url"];item["pageTitle"]=page["title"];item["text"]=page["text"]
  except Exception as exc:item["readError"]=type(exc).__name__
  sources.append(item)
 return {"query":search["query"],"provider":search["provider"],"sources":sources,"searchResults":ranked}

def should_auto_research(text):
 t=_norm(text)
 if not t or len(t)<8:return False
 if any(t.startswith(x) for x in ("escreve ","cria ","inventa ","traduz ","resume este ","corrige este ","faz um poema","faz uma mensagem")):return False
 if any(term in t for term in FRESH_TERMS):return True
 if t.startswith(QUESTION_PREFIXES):return True
 if "?" in str(text) and len(t.split())>=4:return True
 return False

def capability_snapshot():
 return {
  "webOpen":True,"webSearch":True,"webRead":True,"webResearch":True,
  "siteAliases":sorted(SITE_ALIASES),
  "androidIntentBridge":False,
  "operitExternalApiExpected":"http://127.0.0.1:8094",
 }
