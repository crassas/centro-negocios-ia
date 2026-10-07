#!/usr/bin/env python3
"""Persistent local browser worker for Travis using Selenium + Firefox ARM64."""
from __future__ import annotations
import ipaddress,json,os,re,socket,sys,time
from pathlib import Path
from urllib.parse import urlparse
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import WebDriverException,TimeoutException

SELECTOR='a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]'
RISKY=re.compile(r"\b(pay|buy|purchase|checkout|place order|delete|remove account|send money|transfer|publish|confirm purchase|pagar|comprar|eliminar|transferir|publicar)\b",re.I)

def safe_url(value):
 u=urlparse(str(value or ""))
 if u.scheme not in {"http","https"} or not u.hostname:raise ValueError("Só são permitidos URLs HTTP/HTTPS")
 host=u.hostname.lower()
 if host in {"localhost","127.0.0.1","::1"} or host.endswith(".local"):raise ValueError("Destino local recusado")
 try:
  for info in socket.getaddrinfo(host,u.port or (443 if u.scheme=="https" else 80),type=socket.SOCK_STREAM):
   ip=ipaddress.ip_address(info[4][0])
   if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
    raise ValueError("Destino de rede privada recusado")
 except socket.gaierror as exc:raise ValueError("Não consegui resolver o destino") from exc
 return u.geturl()

def firefox_binary():
 rows=sorted(Path.home().glob(".cache/ms-playwright/firefox-*/firefox/firefox"),reverse=True)
 if not rows:raise RuntimeError("Firefox ARM64 não instalado")
 return str(rows[0])

def make_driver():
 env=os.environ.copy()
 env.update({
  "MOZ_HEADLESS":"1","MOZ_DISABLE_CONTENT_SANDBOX":"1","MOZ_DISABLE_GMP_SANDBOX":"1",
  "MOZ_DISABLE_RDD_SANDBOX":"1","MOZ_DISABLE_GPU_SANDBOX":"1",
  "FONTCONFIG_FILE":"/etc/fonts/fonts.conf","FONTCONFIG_PATH":"/etc/fonts",
 })
 opt=Options();opt.binary_location=firefox_binary();opt.add_argument("-headless")
 for name,value in {
  "security.sandbox.content.level":0,"security.sandbox.gpu.level":0,"security.sandbox.rdd.level":0,
  "media.cubeb.sandbox":False,"browser.tabs.remote.autostart":True,
 } .items():opt.set_preference(name,value)
 log=Path.home()/".centro-jarvis"/"browser-selenium.log";log.parent.mkdir(parents=True,exist_ok=True)
 service=Service(str(Path.home()/".centro-browser"/"geckodriver"),log_output=str(log),env=env)
 driver=webdriver.Firefox(service=service,options=opt)
 driver.set_page_load_timeout(18);driver.implicitly_wait(0.15)
 return driver

def elements(driver):
 try:return driver.find_elements(By.CSS_SELECTOR,SELECTOR)
 except WebDriverException:return []

def snapshot(driver):
 title=driver.title or "";url=driver.current_url or ""
 try:text=re.sub(r"\s+"," ",driver.find_element(By.TAG_NAME,"body").text or "").strip()[:9000]
 except WebDriverException:text=""
 rows=[]
 all_els=elements(driver)
 for index,el in enumerate(all_els[:120]):
  try:
   if not el.is_displayed():continue
   tag=(el.tag_name or "").lower();typ=el.get_attribute("type") or "";role=el.get_attribute("role") or ""
   label=el.get_attribute("aria-label") or "";placeholder=el.get_attribute("placeholder") or ""
   href=el.get_attribute("href") or "";value=""
   if tag in {"input","textarea","select"}:value=el.get_attribute("value") or ""
   visible=(el.text or el.get_attribute("textContent") or "").strip()
   rows.append({"index":index,"tag":tag,"role":role[:80],"type":typ[:80],"text":visible[:180],
                "label":label[:160],"placeholder":placeholder[:160],"href":href[:500],"value":value[:120]})
  except WebDriverException:continue
 return {"ok":True,"engine":"selenium-firefox","title":title[:500],"url":url[:2000],"text":text,"elements":rows}

def get_element(driver,index):
 rows=elements(driver)
 if not isinstance(index,int) or index<0 or index>=len(rows):raise ValueError("Índice de elemento inválido")
 return rows[index]

def command(driver,cmd):
 action=str(cmd.get("action") or "").lower()
 if action=="health":return {"ok":True,"browser":True,"engine":"selenium-firefox","url":driver.current_url}
 if action=="goto":
  driver.get(safe_url(cmd.get("url")));return snapshot(driver)
 if action=="snapshot":return snapshot(driver)
 if action=="back":
  try:driver.back()
  except WebDriverException:pass
  return snapshot(driver)
 if action=="wait":
  time.sleep(max(0,min(float(cmd.get("ms") or 800)/1000,5)));return snapshot(driver)
 index=cmd.get("index")
 if isinstance(index,float) and index.is_integer():index=int(index)
 el=get_element(driver,index)
 if action=="click":
  text=" ".join(filter(None,[el.text,el.get_attribute("aria-label"),el.get_attribute("value")]))[:300]
  if RISKY.search(text) and not cmd.get("confirmed"):
   return {"ok":False,"requiresConfirmation":True,"reason":"Acção potencialmente irreversível","element":{"text":text},**snapshot(driver)}
  el.click()
  try:time.sleep(.35)
  except Exception:pass
  return snapshot(driver)
 if action=="fill":
  typ=(el.get_attribute("type") or "").lower()
  if typ=="password":raise ValueError("Preenchimento automático de password recusado")
  el.clear();el.send_keys(str(cmd.get("value") or "")[:4000]);return snapshot(driver)
 if action=="press":
  key=str(cmd.get("key") or "Enter")
  mapped={"Enter":Keys.ENTER,"Tab":Keys.TAB,"Escape":Keys.ESCAPE,"ArrowDown":Keys.ARROW_DOWN,"ArrowUp":Keys.ARROW_UP}
  el.send_keys(mapped.get(key,key[:30]));time.sleep(.35);return snapshot(driver)
 if action=="select":
  from selenium.webdriver.support.ui import Select
  Select(el).select_by_value(str(cmd.get("value") or "")[:500]);return snapshot(driver)
 raise ValueError("Acção de browser desconhecida")

def send(obj):
 sys.stdout.write("TRAVIS_BROWSER:"+json.dumps(obj,ensure_ascii=False,separators=(",",":"))+"\n");sys.stdout.flush()

driver=None
try:
 driver=make_driver();send({"ready":True,"engine":"selenium-firefox"})
 for line in sys.stdin:
  try:
   payload=json.loads(line);send(command(driver,payload))
  except (ValueError,WebDriverException,TimeoutException) as exc:send({"ok":False,"error":str(exc)[:500]})
  except Exception as exc:send({"ok":False,"error":type(exc).__name__+": "+str(exc)[:450]})
finally:
 try:
  if driver:driver.quit()
 except Exception:pass
