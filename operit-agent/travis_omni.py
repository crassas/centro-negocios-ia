#!/usr/bin/env python3
"""Zero-key tools for Travis: opening destinations, web research and safe local search."""
from __future__ import annotations
import html, ipaddress, json, re, socket, unicodedata, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

SERVICES={
 "youtube":"https://www.youtube.com/","google":"https://www.google.com/","gmail":"https://mail.google.com/",
 "google maps":"https://maps.google.com/","maps":"https://maps.google.com/","mapas":"https://maps.google.com/",
 "github":"https://github.com/","chatgpt":"https://chatgpt.com/","wikipedia":"https://pt.wikipedia.org/",
 "spotify":"https://open.spotify.com/","linkedin":"https://www.linkedin.com/","facebook":"https://www.facebook.com/",
 "instagram":"https://www.instagram.com/","twitter":"https://x.com/","x":"https://x.com/",
 "outlook":"https://outlook.live.com/","google calendar":"https://calendar.google.com/","calendar":"https://calendar.google.com/",
 "calendario":"https://calendar.google.com/","google drive":"https://drive.google.com/","drive":"https://drive.google.com/",
 "google docs":"https://docs.google.com/","docs":"https://docs.google.com/","google sheets":"https://sheets.google.com/",
 "sheets":"https://sheets.google.com/","canva":"https://www.canva.com/","cloudflare":"https://dash.cloudflare.com/",
 "search console":"https://search.google.com/search-console/","google search console":"https://search.google.com/search-console/",
 "google ai studio":"https://aistudio.google.com/","ai studio":"https://aistudio.google.com/",
}
OPEN_VERBS=("abre","abrir","abre-me","vai para","entra em","entra no","entra na","lanca","lança","inicia")
PROTECTED_PARTS=(".env","token","secret","credential","password","passwd","private.key",".ssh","auth.json","api_key")
TEXT_SUFFIXES={".txt",".md",".json",".csv",".tsv",".py",".js",".mjs",".ts",".tsx",".jsx",".html",".css",".xml",".yaml",".yml",".toml",".ini",".log",".sql"}

def norm(value):
 return "".join(c for c in unicodedata.normalize("NFD",str(value).lower()) if not unicodedata.combining(c))

def _clean_space(value):
 return re.sub(r"\s+"," ",html.unescape(str(value or ""))).strip()

def resolve_open_target(text):
 raw=str(text or "").strip();t=norm(raw)
 if re.search(r"\b(?:nao|não)\s+(?:abras?|abrir|vas? para|entres?)\b",t):return None
 body=re.sub(r"^(?:travis|jarvis)\b[\s,:;.!?-]*","",t).strip()
 match=re.match(r"^(?:"+"|".join(re.escape(v) for v in OPEN_VERBS)+r")\s+(?:o\s+|a\s+)?(.+?)[\s?.!]*$",body)
 if not match:return None
 target=match.group(1).strip(" .?!")
 for name in sorted(SERVICES,key=len,reverse=True):
  if target==name or target.startswith(name+" "):return {"label":name,"url":SERVICES[name],"kind":"service"}
 url_match=re.search(r"(?:(?:https?://)?(?:www\.)?)([a-z0-9][a-z0-9.-]+\.[a-z]{2,})(?:/\S*)?$",target,re.I)
 if url_match:
  url=target if re.match(r"^https?://",target,re.I) else "https://"+target
  return {"label":target,"url":url,"kind":"url"}
 return {"label":target,"url":"https://www.google.com/search?q="+urllib.parse.quote(target),"kind":"search"}

def web_search(query,limit=6,timeout=12):
 q=_clean_space(query)
 if not q:raise ValueError("Pesquisa vazia")
 url="https://www.bing.com/search?format=rss&q="+urllib.parse.quote(q)
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Safari/537.36","Accept":"application/rss+xml,application/xml,text/xml,*/*"})
 with urllib.request.urlopen(req,timeout=timeout) as response:data=response.read(250000)
 root=ET.fromstring(data);rows=[]
 for item in root.findall(".//item"):
  title=_clean_space(item.findtext("title"));link=_clean_space(item.findtext("link"));desc=_clean_space(item.findtext("description"))
  if not title or not link:continue
  rows.append({"title":title[:300],"url":link[:2000],"snippet":re.sub(r"<[^>]+>"," ",desc)[:900]})
  if len(rows)>=max(1,min(int(limit),10)):break
 return rows

def _public_url(url):
 parsed=urllib.parse.urlparse(str(url))
 if parsed.scheme not in {"http","https"} or not parsed.hostname:return False
 host=parsed.hostname.lower()
 if host in {"localhost","127.0.0.1","::1"} or host.endswith(".local"):return False
 try:
  infos=socket.getaddrinfo(host,parsed.port or (443 if parsed.scheme=="https" else 80),type=socket.SOCK_STREAM)
  for info in infos:
   ip=ipaddress.ip_address(info[4][0])
   if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:return False
 except (OSError,ValueError):return False
 return True

class _TextExtractor(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.skip=0
 def handle_starttag(self,tag,attrs):
  if tag in {"script","style","noscript","svg"}:self.skip+=1
 def handle_endtag(self,tag):
  if tag in {"script","style","noscript","svg"} and self.skip:self.skip-=1
 def handle_data(self,data):
  if not self.skip and data.strip():self.parts.append(data)

def fetch_page(url,max_chars=7000,timeout=12):
 if not _public_url(url):raise ValueError("URL não pública ou não autorizada")
 req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Safari/537.36","Accept":"text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.5"})
 with urllib.request.urlopen(req,timeout=timeout) as response:
  ctype=(response.headers.get("Content-Type") or "").lower();data=response.read(350000)
 if "application/json" in ctype:
  try:text=json.dumps(json.loads(data.decode("utf-8","replace")),ensure_ascii=False)
  except Exception:text=data.decode("utf-8","replace")
 elif "html" in ctype or b"<html" in data[:1000].lower():
  parser=_TextExtractor();parser.feed(data.decode("utf-8","replace"));text=" ".join(parser.parts)
 else:text=data.decode("utf-8","replace")
 return _clean_space(text)[:max(500,min(int(max_chars),20000))]

def research(query,limit=6,fetch_top=2):
 results=web_search(query,limit)
 evidence=[]
 for index,row in enumerate(results[:max(0,min(int(fetch_top),3))],1):
  excerpt=""
  try:excerpt=fetch_page(row["url"],3500)
  except Exception:excerpt=row["snippet"]
  evidence.append({"index":index,"title":row["title"],"url":row["url"],"excerpt":excerpt[:3500]})
 context="\n".join(f"[{e['index']}] {e['title']}\nURL: {e['url']}\n{e['excerpt']}" for e in evidence)
 return {"query":_clean_space(query),"results":results,"evidence":evidence,"context":context[:11000]}

def _safe_local_path(path):
 low=str(path).lower()
 return not any(part in low for part in PROTECTED_PARTS)

def local_file_search(query,roots=None,limit=20,max_files=1800):
 q=norm(query).strip()
 if not q:raise ValueError("Pesquisa local vazia")
 tokens=[x for x in re.findall(r"[a-z0-9]{2,}",q) if x not in {"procura","pesquisa","ficheiro","ficheiros","documento","documentos","meus","minha","nas","nos","por","para"}]
 if not tokens:tokens=[q]
 roots=[Path(x) for x in (roots or ["/sdcard/Download","/sdcard/Documents","/sdcard/DCIM","/root/repos"])]
 rows=[];seen=0
 for root in roots:
  if not root.exists():continue
  try:iterator=root.rglob("*")
  except OSError:continue
  for path in iterator:
   if seen>=max_files or len(rows)>=limit:break
   try:
    if not path.is_file() or not _safe_local_path(path):continue
    seen+=1;name=norm(path.name)
    name_score=sum(2 for token in tokens if token in name)
    body_score=0;sample=""
    if path.suffix.lower() in TEXT_SUFFIXES and path.stat().st_size<=2_000_000:
     try:
      text=path.read_text(encoding="utf-8",errors="replace")[:200000];low=norm(text)
      body_score=sum(1 for token in tokens if token in low)
      if body_score:
       pos=min([low.find(token) for token in tokens if token in low] or [0]);sample=_clean_space(text[max(0,pos-120):pos+360])
     except OSError:pass
    score=name_score+body_score
    if score:rows.append({"path":str(path),"name":path.name,"score":score,"sample":sample[:480]})
   except (OSError,UnicodeError):continue
  if seen>=max_files or len(rows)>=limit:break
 rows.sort(key=lambda x:(-x["score"],x["path"]))
 return {"query":query,"scanned":seen,"results":rows[:limit]}

def status():
 return {"webSearch":"bing-rss-zero-key","webRead":True,"localRoots":[p for p in ["/sdcard/Download","/sdcard/Documents","/sdcard/DCIM","/root/repos"] if Path(p).exists()],"services":sorted(SERVICES)}
