#!/usr/bin/env python3
"""Safe public-web tools for Travis: search, read, follow and open."""
from __future__ import annotations
import unicodedata
import base64, html, ipaddress, json, re, socket, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

STATE_ROOT=Path.home()/".centro-jarvis"
LAST_WEB=STATE_ROOT/"last-web.json"
USER_AGENT="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131 Safari/537.36 Travis/1.0"
SITES={
 "youtube":"https://www.youtube.com/","google":"https://www.google.com/",
 "github":"https://github.com/","gmail":"https://mail.google.com/",
 "google maps":"https://www.google.com/maps","maps":"https://www.google.com/maps",
 "wikipedia":"https://pt.wikipedia.org/","chatgpt":"https://chatgpt.com/",
 "whatsapp":"https://wa.me/","instagram":"https://www.instagram.com/",
 "facebook":"https://www.facebook.com/","tiktok":"https://www.tiktok.com/",
 "linkedin":"https://www.linkedin.com/","reddit":"https://www.reddit.com/",
 "spotify":"https://open.spotify.com/","x":"https://x.com/",
 "pentehouse":"https://pentehouse.pt/","best pizza":"https://bestpizzaandkebab.pt/",
 "beatriz":"https://engomadoriabeatriz.pt/",
}
BLOCKED_SUFFIXES=(".local",".internal",".localhost",".home",".lan")

def _resolve_public(host,port=443):
 if not host:raise ValueError("Domínio em falta")
 host=host.rstrip(".").lower()
 if host in {"localhost","localhost.localdomain"} or host.endswith(BLOCKED_SUFFIXES):raise ValueError("Endereço interno recusado")
 try:addresses=socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)
 except socket.gaierror as exc:raise ValueError("Domínio não encontrado") from exc
 if not addresses:raise ValueError("Domínio sem resolução")
 for item in addresses:
  if not ipaddress.ip_address(item[4][0]).is_global:raise ValueError("Endereço privado ou reservado recusado")
 return host

def safe_url(value):
 value=html.unescape(str(value or "")).strip()
 if not re.match(r"^https?://",value,re.I):value="https://"+value
 u=urllib.parse.urlsplit(value)
 if u.scheme not in {"http","https"} or not u.hostname or u.username or u.password:raise ValueError("Endereço não autorizado")
 if u.port not in (None,80,443):raise ValueError("Porta não autorizada")
 _resolve_public(u.hostname,u.port or (443 if u.scheme=="https" else 80))
 return urllib.parse.urlunsplit(u)

class _SafeRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  return super().redirect_request(req,fp,code,msg,headers,safe_url(newurl))

def _opener():return urllib.request.build_opener(_SafeRedirect())

def _fetch(url,max_bytes=1_500_000,timeout=12,user_agent=USER_AGENT):
 url=safe_url(url)
 req=urllib.request.Request(url,headers={"User-Agent":user_agent,"Accept-Language":"pt-PT,pt;q=0.9,en;q=0.7"})
 with _opener().open(req,timeout=timeout) as response:
  final=safe_url(response.geturl());ctype=(response.headers.get("Content-Type") or "").lower()
  if not any(x in ctype for x in ("text/","application/xhtml","application/json","application/xml","application/rss")):raise ValueError("Conteúdo não textual")
  data=response.read(max_bytes+1)
  if len(data)>max_bytes:raise ValueError("Página demasiado grande")
  return final,ctype,data.decode(response.headers.get_content_charset() or "utf-8","replace")

class _TextParser(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.skip=0;self.parts=[];self.title=[];self.in_title=False;self.links=[];self._link=None
 def handle_starttag(self,tag,attrs):
  if tag in {"script","style","noscript","svg","template"}:self.skip+=1;return
  if self.skip:return
  if tag=="title":self.in_title=True
  if tag=="a":
   href=dict(attrs).get("href")
   if href:self._link={"href":href,"text":[]}
  if tag in {"p","li","h1","h2","h3","article","section","br","div"}:self.parts.append("\n")
 def handle_endtag(self,tag):
  if tag in {"script","style","noscript","svg","template"}:
   if self.skip:self.skip-=1
   return
  if self.skip:return
  if tag=="title":self.in_title=False
  if tag=="a" and self._link:
   label=re.sub(r"\s+"," ","".join(self._link["text"])).strip()
   if label:self.links.append((label,self._link["href"]))
   self._link=None
  if tag in {"p","li","h1","h2","h3","article","section","div"}:self.parts.append("\n")
 def handle_data(self,data):
  if self.skip:return
  if self.in_title:self.title.append(data)
  self.parts.append(data)
  if self._link is not None:self._link["text"].append(data)

def _clean_text(value):return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",value or ""))).strip()

def _decode_bing(url):
 url=html.unescape(url)
 try:
  u=urllib.parse.urlsplit(url)
  if u.hostname and u.hostname.endswith("bing.com"):
   encoded=urllib.parse.parse_qs(u.query).get("u",[""])[0]
   if encoded.startswith("a1"):
    raw=encoded[2:]+"="*((4-len(encoded[2:])%4)%4)
    decoded=base64.urlsafe_b64decode(raw).decode("utf-8","replace")
    if decoded.startswith(("http://","https://")):return safe_url(decoded)
  return safe_url(url)
 except Exception:return ""

def _remember(payload):
 STATE_ROOT.mkdir(parents=True,exist_ok=True)
 tmp=LAST_WEB.with_suffix(".tmp");tmp.write_text(json.dumps(payload,ensure_ascii=False)[:100000],encoding="utf-8");tmp.replace(LAST_WEB)

def _last():
 try:return json.loads(LAST_WEB.read_text(encoding="utf-8"))
 except Exception:return {}

SEARCH_STOPWORDS={"qual","quais","que","quem","como","onde","quando","porque","porquê","para","com","sem","uma","umas","uns","dos","das","do","da","de","em","no","na","nos","nas","mais","hoje","agora","actual","atual","actualmente","atualmente","recente","recentes","versão","versao","última","ultima","últimas","ultimas","notícia","noticia","notícias","noticias","the","and","for","from","what","which","who","how","latest","version","news"}
def _norm_token(value):
 return "".join(c for c in __import__("unicodedata").normalize("NFD",str(value).lower()) if not __import__("unicodedata").combining(c))
def _key_terms(query):
 terms=[]
 for token in re.findall(r"[A-Za-zÀ-ÿ0-9_.+-]+",str(query)):
  n=_norm_token(token)
  if len(n)>=3 and n not in SEARCH_STOPWORDS:terms.append((token,n))
 return terms[:8]
def _search_variant(query):
 q=_norm_token(query);intent=[]
 if ("versao" in q and any(x in q for x in ("recente","ultima","atual","hoje"))):intent=["latest","version"]
 elif any(x in q for x in ("noticia","noticias")) and any(x in q for x in ("recente","ultima","hoje","atual")):intent=["latest","news"]
 elif "preco" in q or "preços" in q:intent=["price"]
 elif "documentacao" in q:intent=["documentation"]
 elif "lancamento" in q:intent=["release"]
 elif q.startswith("como "):intent=["how","to"]
 terms=[token for token,_ in _key_terms(query)]
 variant=" ".join(terms+intent).strip()
 return variant[:300] if variant and variant.lower()!=str(query).lower().strip() else ""
def _relevant(query,rows):
 keys=[n for _,n in _key_terms(query)]
 if not keys:return bool(rows)
 corpus=_norm_token(" ".join((r.get("title","")+" "+r.get("snippet","")) for r in rows[:3]))
 return any(key in corpus for key in keys)

def _search_once(query,limit=5):
 url="https://www.bing.com/search?"+urllib.parse.urlencode({"q":query,"setlang":"pt-PT","count":max(5,min(int(limit),10))})
 _,_,page=_fetch(url,max_bytes=800_000)
 blocks=re.findall(r'<li class="b_algo"[^>]*>(.*?)</li>',page,re.I|re.S);rows=[]
 for block in blocks:
  m=re.search(r'<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>\s*</h2>',block,re.I|re.S)
  if not m:continue
  target=_decode_bing(m.group(1))
  if not target:continue
  title=_clean_text(m.group(2));sm=re.search(r'<div class="b_caption"[^>]*>.*?<p[^>]*>(.*?)</p>',block,re.I|re.S)
  snippet=_clean_text(sm.group(1)) if sm else ""
  if title:rows.append({"title":title[:240],"url":target,"snippet":snippet[:650]})
  if len(rows)>=limit:break
 return rows

def search(query,limit=5):
 query=re.sub(r"\s+"," ",str(query or "")).strip()[:300]
 if not query:raise ValueError("Pesquisa vazia")
 rows=_search_once(query,limit)
 if not _relevant(query,rows):
  variant=_search_variant(query)
  if variant:
   alternate=_search_once(variant,limit);seen=set();merged=[]
   for row in alternate+rows:
    if row["url"] in seen:continue
    seen.add(row["url"]);merged.append(row)
   rows=merged[:limit]
 _remember({"kind":"search","query":query,"results":rows});return rows

def read(url,max_chars=9000):
 final,ctype,raw=_fetch(url)
 if "html" not in ctype:
  result={"url":final,"title":final,"text":re.sub(r"\s+"," ",raw).strip()[:max_chars],"links":[]};_remember({"kind":"read","url":final});return result
 parser=_TextParser();parser.feed(raw)
 text="\n".join(re.sub(r"[ \t]+"," ",x).strip() for x in "".join(parser.parts).splitlines())
 text=re.sub(r"\n{3,}","\n\n",text).strip();title=re.sub(r"\s+"," ","".join(parser.title)).strip() or final
 links=[]
 for label,href in parser.links:
  try:
   absolute=urllib.parse.urljoin(final,href)
   if absolute.startswith(("http://","https://")):links.append({"text":label[:160],"url":safe_url(absolute)})
  except Exception:pass
  if len(links)>=80:break
 result={"url":final,"title":title[:300],"text":text[:max_chars],"links":links};_remember({"kind":"read","url":final,"title":result["title"]});return result

def research(query,limit=5,page_count=3):
 rows=search(query,limit);targets=rows[:max(0,min(int(page_count),3))]
 def load(row):
  try:
   page=read(row["url"],5000);return {"title":row["title"],"url":page["url"],"snippet":row["snippet"],"text":page["text"]}
  except Exception as exc:return {"title":row["title"],"url":row["url"],"snippet":row["snippet"],"text":"","error":type(exc).__name__}
 with ThreadPoolExecutor(max_workers=3) as pool:pages=list(pool.map(load,targets))
 result={"query":str(query)[:300],"results":rows,"pages":pages};_remember({"kind":"research","query":result["query"],"results":rows});return result

def follow(link_text):
 state=_last();candidates=state.get("results") or [];needle=str(link_text).lower().strip()
 if re.fullmatch(r"(?:primeiro|1|1º)",needle):
  if not candidates:raise ValueError("Não há resultados anteriores")
  return {"action":"open_url","url":safe_url(candidates[0]["url"]),"reply":"I’ll open the first result."}
 for row in candidates:
  if needle and needle in str(row.get("title","")).lower():return {"action":"open_url","url":safe_url(row["url"]),"reply":"I’ll open "+row["title"]+"."}
 raise ValueError("Não encontrei esse resultado na pesquisa anterior")

def classify(text):
 raw=str(text or "").strip();t=re.sub(r"^(?:travis|jarvis)[,:;.!?\s]*","",raw,flags=re.I).strip()
 m=re.fullmatch(r"(?:(?:podes|consegues|poderias|can you|could you|please)\s+)?(?:abre|abrir|open|go to|visit|vai (?:a|ao|à)|visita|mostra)(?:-me)?\s+(?:o |a |os |as |the )?(.+?)(?:\s+(?:por favor|please))?[.!?]*",t,flags=re.I)
 if m:
  target=m.group(1).strip();key="".join(c for c in unicodedata.normalize("NFD",target.lower()) if unicodedata.category(c)!="Mn")
  if key in SITES:return "web_open",{"url":SITES[key]}
  if re.fullmatch(r"(?:https?://)?[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s]*)?",target,re.I):return "web_open",{"url":target}
  if key in {"primeiro resultado","o primeiro resultado","primeiro"}:return "web_follow",{"link":"primeiro"}
 m=re.fullmatch(r"(?:lê|le|ler|consulta|resume|resumir|read|summarize|summarise|inspect)(?:-me)?\s+(?:esta |a |this |the )?(?:página|pagina|page|site)?\s*(https?://\S+)",t,flags=re.I)
 if m:return "web_read",{"url":m.group(1).rstrip(".,;!?")}
 m=re.fullmatch(r"(?:pesquisa|pesquisar|procura|procurar|busca|buscar|investiga|investigar|search|find|research|look up)(?:\s+(?:no google|na internet|na web|sobre|por|online|on the web|about|for))?\s+(.+)",t,flags=re.I)
 if m:return "web_research",{"query":m.group(1).strip()[:300]}
 if re.search(r"\b(?:hoje|agora|actual|atual|actualmente|atualmente|mais recente|últim[oa]s?|recent[ea]s?|notícias|noticias|today|now|current|currently|latest|newest|recent|news)\b",t,re.I):return "web_research",{"query":t[:300]}
 return None

def youtube_search(query,limit=8):
 """Read public YouTube search results; no API key, account or inferred video IDs."""
 query=str(query or "").strip()[:240]
 if not query:raise ValueError("Indica o que queres ver no YouTube")
 url="https://www.youtube.com/results?"+urllib.parse.urlencode({"search_query":query})
 _,_,body=_fetch(url,max_bytes=6_000_000,timeout=15,user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36")
 marker=re.search(r'(?:var\s+ytInitialData\s*=|window\["ytInitialData"\]\s*=|ytInitialData\s*=)\s*(?=\{)',body)
 if not marker:raise RuntimeError("YouTube search is unavailable at the moment.")
 data,_=json.JSONDecoder().raw_decode(body[marker.end():])
 results=[];seen=set()
 def label(value):
  return str(value.get("simpleText") or "".join(str(x.get("text","")) for x in value.get("runs",[])))[:300] if isinstance(value,dict) else ""
 def walk(node):
  if len(results)>=limit:return
  if isinstance(node,dict):
   video=node.get("videoRenderer")
   if isinstance(video,dict):
    key=video.get("videoId","")
    if re.fullmatch(r"[A-Za-z0-9_-]{11}",key) and key not in seen:
     seen.add(key);results.append({"videoId":key,"title":label(video.get("title",{})),"channel":label(video.get("ownerText",{})),"duration":label(video.get("lengthText",{}))})
   for value in node.values():walk(value)
  elif isinstance(node,list):
   for value in node:walk(value)
 walk(data)
 return {"query":query,"videos":results}

def execute(tool,args):
 if tool=="web_open":
  url=safe_url(args["url"]);_remember({"kind":"open","url":url});return {"action":"open_url","url":url,"reply":"I’ll open the requested address."}
 if tool=="web_research":return research(args["query"])
 if tool=="web_read":return read(args["url"])
 if tool=="web_follow":return follow(args["link"])
 raise ValueError("Ferramenta web desconhecida")
