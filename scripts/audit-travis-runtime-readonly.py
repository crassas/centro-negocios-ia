#!/usr/bin/env python3
"""Auditoria SOMENTE LEITURA do Travis/Centro no Android Ubuntu PRoot.

Sem reinícios, paragens, actualizações, instalação de dependências ou acesso
a ficheiros privados de conversas. Verifica apenas status, /proc, UI e logs
locais (apresenta contagens; nunca conteúdos de mensagens, chaves ou tokens).
Usage: python3 audit-travis-runtime-readonly.py [--watch 45]
"""
import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request

HOME=Path.home()
UI=Path(os.getenv("TRAVIS_UI_DIR",str(HOME/".centro-ui"))).expanduser()
CLOCK_TICKS=os.sysconf("SC_CLK_TCK") if hasattr(os,"sysconf") else 100
PAGE_SIZE=os.sysconf("SC_PAGE_SIZE") if hasattr(os,"sysconf") else 4096
OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}))
HEALTH={
 "centro_server":(8765,"/health"),
 "travis_voz":(8770,"/health"),
 "llm_local":(8771,"/health"),
 "laya":(18790,"/health"),
 "openclaw_desativado":(18789,"/healthz"),
}
PATTERNS={
 "Centro Station":("centro_station.py",),
 "Centro Server":("centro_server.py",),
 "Centro Agent":("centro_agent.py",),
 "Travis voz/router":("jarvis_local.py",),
 "Laya":("laya_server.py","laya.py","laya_server","laya-server"),
 "LLM llama-server":("llama-server",),
 "Ollama":("ollama",),
 "Desktop Commander":("desktop-commander","desktop_commander","desktopcommander","remote_mcp"),
 "Bridge Android":("travis_native_bridge.py","travis-native-bridge","travis_bridge.py","travis-bridge"),
 "Travis World Watch":("travis-world-watch.py",),
 "Soak Monitor":("centro_soak.py",),
}
PID_FILES={
 "Centro Station":HOME/".centro-station/supervisor.pid",
 "Centro Server":HOME/".centro-server/server.pid",
 "Centro Agent":HOME/".centro-agent/agent.pid",
 "Travis voz/router":HOME/".centro-jarvis/router.pid",
 "Desktop Commander":HOME/".centro-remote/remote.pid",
}
LOG_FILES={
 "Station":HOME/".centro-station/supervisor.log",
 "Server":HOME/".centro-server/server.log",
 "Agent":HOME/".centro-agent/agent.log",
 "Travis router":HOME/".centro-jarvis/router.log",
 "Remote":HOME/".centro-remote/remote.log",
 "World watch":HOME/".centro-extensions/travis-world-watch.log",
}

def secs(age):
    if age is None:return "?"
    a=max(0,int(age))
    if a<120:return f"{a}s"
    if a<7200:return f"{a//60}min"
    if a<172800:return f"{a//3600}h"
    return f"{a//86400}d"

def age_mtime(p,now=None):
    try:return (time.time() if now is None else now)-p.stat().st_mtime
    except OSError:return None

def json_file(path,limit=180000):
    try:
        if path.stat().st_size>limit:return None
        data=json.loads(path.read_text("utf-8"))
        return data if isinstance(data,dict) else None
    except (OSError,ValueError,UnicodeError):return None

def sha_file(path):
    try:
        with path.open("rb") as f:
            h=hashlib.sha256()
            for chunk in iter(lambda:f.read(65536),b""):h.update(chunk)
            return h.hexdigest()
    except OSError:return None

def HTTP(port,route="/health",max_bytes=160000,timeout=1.75):
    start=time.monotonic()
    url=f"http://127.0.0.1:{port}{route}"
    req=urllib.request.Request(url,headers={"Cache-Control":"no-store",
             "User-Agent":"Centro-Travis-Audit-ReadOnly/1.0"})
    try:
        with OPENER.open(req,timeout=timeout) as res:
            raw=res.read(max_bytes+1)
            info={"http":res.status,"ms":round((time.monotonic()-start)*1000),
                  "bytesRead":len(raw),
                  "contentType":(res.headers.get("Content-Type") or "").split(";")[0]}
        if len(raw)>max_bytes:info["incomplete"]=True
        if route=="/health" or route=="/healthz":
            try:
                value=json.loads(raw)
                if isinstance(value,dict):
                    info["status"]={key:value.get(key) for key in
                        ("ok","status","service","busy","pid","ui","liveStt","voiceProtocol")
                        if key in value}
            except ValueError:pass
        return info,raw
    except urllib.error.HTTPError as e:
        return {"http":e.code,"ms":round((time.monotonic()-start)*1000)},b""
    except Exception as e:
        return {"http":None,"error":type(e).__name__,
                "ms":round((time.monotonic()-start)*1000)},b""

def healthy(item):
    if item.get("http")!=200:return False
    value=item.get("status") or {}
    if "ok" in value:return value.get("ok") is True
    if "status" in value:return str(value["status"]).lower() in {"ok","ready","healthy"}
    return True

def uptime():
    try:return float(Path("/proc/uptime").read_text().split()[0])
    except (OSError,ValueError,IndexError):return 0.0

def proc(pid,up=None):
    up=uptime() if up is None else up
    try:
        raw=(Path("/proc")/str(pid)/"cmdline").read_bytes().split(b"\0")
        args=[os.fsdecode(s) for s in raw if s]
        if not args:return None
        stat=(Path("/proc")/str(pid)/"stat").read_text()
        info=stat.rsplit(") ",1)[-1].split()
        # field 22 starttime, field 24 RSS (state is field 3 at index 0)
        age=max(0,up-float(info[19])/CLOCK_TICKS)
        rss=max(0,int(info[21]))*PAGE_SIZE/(1024*1024)
        words=[Path(x).name.lower() for x in args[:8]]
        full=" ".join(words)
        kinds=[category for category,tokens in PATTERNS.items()
               if any(t in full for t in tokens)]
        return {"pid":int(pid),"ageSec":int(age),"rssMiB":round(rss,1),
                "kinds":kinds,"firstArg":words[0] if words else ""}
    except (OSError,ValueError,IndexError,UnicodeError,PermissionError):
        return None

def all_procs():
    up=uptime()
    seen={}
    try:folders=[p.name for p in Path("/proc").iterdir() if p.name.isdigit()]
    except OSError:folders=[]
    for pid in folders[:2500]:
        entry=proc(pid,up)
        if entry and entry["kinds"]:seen[entry["pid"]]=entry
    return seen

def safe_pidfile(path):
    try:
        raw=path.read_text().strip()
        return int(raw) if raw.isdecimal() and len(raw)<12 else None
    except (OSError,ValueError):return None

def memory_status():
    try:
        d={}
        for line in Path("/proc/meminfo").read_text().splitlines():
            k,_,v=line.partition(":")
            if k in {"MemTotal","MemAvailable","SwapTotal","SwapFree"}:
                d[k]=int(v.split()[0])//1024
        return d
    except (OSError,ValueError,IndexError):return {}

def log_metrics(path,max_bytes=220000):
    try:
        with path.open("rb") as f:
            f.seek(0,2);total=f.tell()
            f.seek(max(0,total-max_bytes))
            raw=f.read(max_bytes)
    except OSError:return {"exists":False}
    content=raw.decode("utf-8","replace").splitlines()
    names=[
        ("actualizacoes","[auto] autoupdate/"),
        ("reload_travis","[auto] autoupdate/jarvis"),
        ("reinicio_station","[auto] station · REEXEC"),
        ("reinicio_laya","[auto] laya"),
        ("recuperacao_jarvis","[auto] jarvis ·"),
        ("remote_restart","[auto] remote-desktop/"),
        ("loop_error","[auto] cycle · RETRY"),
    ]
    out={"exists":True,"fileSizeKiB":total//1024,
         "lastWrittenAgo":secs(age_mtime(path)),
         "linesRead":len(content),
         "tailContainsOnlyRecentEvents":False}
    for key,pattern in names:
        out[key]=sum(pattern in s for s in content)
    out["tracebacks"]=sum("Traceback (most recent call last)" in x for x in content)
    out["addressBusy"]=sum("Address already in use" in x for x in content)
    out["exceptions"]=sum(bool(re.search(r"\b(?:Exception|ModuleNotFoundError|RuntimeError):",x)) for x in content)
    return out

def UI_inspect():
    files={
       "index":UI/"index.html",
       "travis-main":UI/"travis-3d.mjs",
       "modelo-mj3d":UI/"assets/travis/travis-michael-jackson-3d.glb",
       "material-mj3d":UI/"travis-michael-jackson-3d.mjs",
       "modelo-original":UI/"assets/travis/travis-face-bust.glb",
       "versao-2D-obsoleta":UI/"travis-michael-jackson.mjs",
       "sw":UI/"sw.js"
    }
    present={}
    for key,p in files.items():
        try:present[key]={"exists":p.is_file(),"bytes":p.stat().st_size,
                           "age":secs(age_mtime(p))}
        except OSError:present[key]={"exists":False}
    try:
        main=files["travis-main"].read_text("utf-8")
        html=files["index"].read_text("utf-8")
        sw=files["sw"].read_text("utf-8")
        material=files["material-mj3d"].read_text("utf-8")
    except (OSError,UnicodeError):main=html=sw=material=""
    module_imports=re.findall(r"""(?:import\s+[\s\S]{0,150}?\bfrom\s*|import\s*)['"](\./[^'"]+)['"]""",main)
    missing=[]
    for name in module_imports:
        rel=name.split("?")[0].removeprefix("./")
        p=UI/rel
        if not p.is_file():missing.append(rel)
    swmatch=re.search(r"(?m)^const CACHE\s*=\s*['\"]([^'\"]+)",sw)
    source_match=re.search(r"""src=['"]\./travis-3d\.mjs([^'"]*)['"]""",html)
    config={
      "files":present,
      "mainImportsMJ3D":"travis-michael-jackson-3d.mjs" in main,
      "mainUsesLicensed3D":"loadMJ3DOrOriginal" in main or "MJ3D_ASSET" in main,
      "fallbackHook":"loadMJ3DOrOriginal" in main,
      "oldPhotoHookActive":"createMichaelJacksonHologram" in main,
      "missingDirectImports":sorted(set(missing))[:15],
      "swCache":swmatch.group(1) if swmatch else None,
      "indexModuleVersion":source_match.group(1) if source_match else None,
      "moduleFallback":"loadMJ3DOrOriginal" in material,
    }
    manifest=json_file(UI/".travis-client-sync.json",limit=60000)
    if manifest:
        keys=("travis-3d.mjs","travis-michael-jackson-3d.mjs",
              "assets/travis/travis-michael-jackson-3d.glb","sw.js","index.html")
        config["sync"]={}
        for key in keys:
            if key in manifest:
                digest=sha_file(UI/key)
                config["sync"][key]="match" if manifest[key]==digest else "local-differs"
            else:config["sync"][key]="not-tracked"
    serve_checks={}
    for name,route,signature,limit in (
      ("js","/travis-3d.mjs?audit=1",b"import ",300000),
      ("material","/travis-michael-jackson-3d.mjs?audit=1",b"/**",120000),
      ("model","/assets/travis/travis-michael-jackson-3d.glb?audit=1",b"glTF",12500000),
    ):
        status,data=HTTP(8770,route,max_bytes=limit,timeout=3.5)
        config["server_"+name]={
          "http":status.get("http"),"readBytes":len(data),
          "served":status.get("http")==200 and data.lstrip().startswith(signature),
          "sameAsDisk":hashlib.sha256(data).hexdigest()==sha_file(
              files["travis-main"] if name=="js" else
              files["material-mj3d"] if name=="material" else
              files["modelo-mj3d"]) if status.get("http")==200 and not status.get("incomplete") else None
        }
    return config

def backup_summary():
    root=HOME/".travis-backups"
    try:
        folders=[p for p in root.iterdir() if p.is_dir()]
        return {"folders":len(folders),
                "lastChangedAgo":secs(min([age_mtime(x) for x in folders if age_mtime(x) is not None],default=None))}
    except OSError:return {"folders":0}

def station_state():
    statefile=HOME/".centro-station/status.json"
    state=json_file(statefile)
    out={"fileExists":state is not None,"age":secs(age_mtime(statefile))}
    if not state:return out
    for service in ("server","agent","laya","jarvis","remoteDesktop","openclaw"):
        item=state.get(service) or {}
        if isinstance(item,dict):
            out[service]={key:item[key] for key in
                ("active","healthy","enabled","autostart","state","configured","managed","pid")
                if key in item}
    update=state.get("autoupdate") or {}
    out["autoupdate"]={k:update.get(k) for k in
        ("enabled","intervalSeconds","lastAttempt","lastOk","mainSha",
         "pendingServerRestart","pendingAgentRestart","serverBusy")
         if k in update}
    out["autoupdate"]["lastErrorPresent"]=bool(update.get("lastError"))
    out["lastActions"]=[{"service":str(a.get("service",""))[:70],
                         "ok":bool(a.get("ok"))} for a in
                        (state.get("actions") or [])[:12] if isinstance(a,dict)]
    return out

def capture():
    state=station_state()
    checks={}
    for name,(port,route) in HEALTH.items():
        item,_=HTTP(port,route,timeout=1.25,max_bytes=36000)
        checks[name]={k:item[k] for k in ("http","error","ms","status")
                       if k in item}
        checks[name]["online"]=healthy(item)
    processes=all_procs()
    counts=Counter(cat for item in processes.values() for cat in item["kinds"])
    pidfiles={}
    for kind,p in PID_FILES.items():
        pid=safe_pidfile(p)
        info=processes.get(pid) if pid else None
        # Ownership is confirmed by matching the process's service category.
        pidfiles[kind]={"pid":pid,
                        "exists":pid is not None,
                        "owned":bool(info and kind in info["kinds"]),
                        "age":secs(info["ageSec"]) if info else None}
    grouped={}
    for kind in PATTERNS:
        matches=[p for p in processes.values() if kind in p["kinds"]]
        grouped[kind]={"count":len(matches),
                       "pids":sorted(p["pid"] for p in matches)[:8],
                       "youngestAge":secs(min((p["ageSec"] for p in matches),default=None)),
                       "rssMiB":round(sum(p["rssMiB"] for p in matches),1)}
    return {"at":datetime.now().astimezone().isoformat(timespec="seconds"),
            "state":state,"health":checks,"pids":pidfiles,"processes":grouped,
            "memory":memory_status()}

def print_section(header):
    print("\n"+header+"\n"+"-"*min(len(header),78))

def yn(value):
    return "ONLINE" if value is True else "OFFLINE" if value is False else "INDETERMINADO"

def run(wait):
    print("TRAVIS / AUDITORIA SOMENTE LEITURA — SEM REINICIAR NADA")
    print("Dispositivo:",HOME,"· interface:",UI)
    print("A verificar serviços locais e estabilidade dos processos...",flush=True)
    first=capture()
    print_section("1. SERVIÇOS AO VIVO")
    for key,value in first["health"].items():
        detail=value.get("status") or {}
        extras=", ".join(f"{k}={v}" for k,v in detail.items() if k in ("busy","liveStt","ui","status"))
        print(f"  {key:20s} {yn(value['online']):12s} HTTP={value.get('http')} {value.get('ms')}ms {extras}")
    print("  Bridge Android         INDETERMINADO (sem endpoint de saúde confirmado nesta versão)")
    print_section("2. SUPERVISOR, AUTO-UPDATE E RELOAD")
    station=first["state"]
    print("  Estado supervisor:", "presente" if station["fileExists"] else "não encontrado",
          "· gravado há",station["age"])
    update=station.get("autoupdate") or {}
    print("  Auto-update:",update.get("enabled","?"),
          "· intervalo:",update.get("intervalSeconds","?"),"segundos",
          "· erro recente:",update.get("lastErrorPresent","?"))
    print("  Reinício pendente (server/agent):",
          update.get("pendingServerRestart","?"),"/",
          update.get("pendingAgentRestart","?"))
    print("  Laya por desenho:",station.get("laya",{}),
          "· OpenClaw por desenho:",station.get("openclaw",{}))
    print("  Nota: ciclo do supervisor de 3 segundos NÃO equivale a reinício do servidor.")
    print_section("3. PROCESSOS E DUPLICADOS")
    for name,info in first["processes"].items():
        if info["count"] or name in ("Centro Station","Centro Server","Centro Agent",
                                     "Travis voz/router","Laya","Bridge Android","Desktop Commander"):
            warning="  DUPLICADO?" if info["count"]>1 and name in (
               "Centro Station","Centro Server","Travis voz/router") else ""
            print(f"  {name:20s} processos={info['count']} PID={info['pids']}"+
                  f" · mais recente há {info['youngestAge']} · RSS={info['rssMiB']}MiB"+warning)
    print("  Ficheiros PID:")
    for name,pid in first["pids"].items():
        if pid["exists"]:print(f"    {name:20s} PID={pid['pid']} correcto={pid['owned']} idade={pid['age']}")
    print_section("4. HOLOGRAMA, CACHE E PATCHES")
    u=UI_inspect()
    for name,info in u["files"].items():
        print(f"  {name:20s} existe={info['exists']} bytes={info.get('bytes','-')} alterado há={info.get('age','-')}")
    print("  MJ3D importado:",u["mainImportsMJ3D"],
          "· modelo escolhido:",u["mainUsesLicensed3D"],
          "· fallback:",u["fallbackHook"],
          "· foto 2D ligada:",u["oldPhotoHookActive"])
    print("  CACHE SW:",u["swCache"],"· script HTML:",u["indexModuleVersion"])
    if u["missingDirectImports"]:print("  Imports 3D/JS em falta:",u["missingDirectImports"])
    for item in ("js","material","model"):
        print(f"  HTTP UI {item}: "+json.dumps(u["server_"+item],ensure_ascii=False))
    print("  Manifest de sincronização:",u.get("sync","não encontrado"))
    print("  Backups antigos (armazenamento, não processos):",backup_summary())
    print_section("5. REGISTOS HISTÓRICOS — CONTAGENS, SEM MENSAGENS PRIVADAS")
    for name,path in LOG_FILES.items():
        result=log_metrics(path)
        if not result["exists"]:continue
        print(f"  {name:14s} escrito há {result['lastWrittenAgo']}; "+
              f"amostra={result['linesRead']} linhas finais/"+str(result['fileSizeKiB'])+"KiB; "+
              " ".join(f"{key}={result[key]}" for key in
                  ("actualizacoes","reload_travis","reinicio_station",
                   "recuperacao_jarvis","reinicio_laya","remote_restart",
                   "loop_error","tracebacks","addressBusy")))
    print("  NOTA: contagens são de amostras finais dos ficheiros, NÃO eventos por hora.")
    if wait:
        print_section(f"6. OBSERVAÇÃO DE REINÍCIOS DURANTE {wait}s — SEM TOCAR NO SISTEMA")
        time.sleep(wait)
        second=capture()
        changes=[]
        for key in ("Centro Station","Centro Server","Centro Agent","Travis voz/router",
                    "Laya","Desktop Commander","Bridge Android"):
            a=first["processes"][key]["pids"]
            b=second["processes"][key]["pids"]
            if a!=b:changes.append({"service":key,"before":a,"after":b})
        for key in first["health"]:
            a=first["health"][key]["online"];b=second["health"][key]["online"]
            if a!=b:changes.append({"service":key,"beforeOnline":a,"afterOnline":b})
        print("  Processos ou health que mudaram:",json.dumps(changes,ensure_ascii=False)
              if changes else "nenhuns detectados")
        print("  Supervisor snapshot actualizado há",second["state"]["age"])
    print_section("DIAGNÓSTICO AUTOMÁTICO")
    notices=[]
    h=first["health"]
    if not h["centro_server"]["online"]:notices.append("Centro Server 8765 sem saúde confirmada")
    if not h["travis_voz"]["online"]:notices.append("Travis Router 8770 sem saúde confirmada")
    if not h["laya"]["online"]:notices.append("Laya 18790 sem resposta; verificar se é necessário")
    if not h["llm_local"]["online"]:notices.append("LLM local 8771 sem resposta (pode ser opcional)")
    for name in ("Centro Station","Centro Server","Travis voz/router"):
        if first["processes"][name]["count"]>1:notices.append(name+" com possíveis duplicados")
    if not u["server_model"]["served"] or not u["server_model"]["sameAsDisk"]:
        notices.append("GLB 3D não é servido correctamente ou versão HTTP difere do disco")
    if not u["server_material"]["served"]:
        notices.append("Módulo MJ3D não servido via HTTP")
    if u["oldPhotoHookActive"]:
        notices.append("Ainda há chamadas activas à antiga sobreposição 2D")
    if u["missingDirectImports"]:
        notices.append("Há módulos JS referidos que não existem no disco")
    if station.get("fileExists") and (age_mtime(HOME/".centro-station/status.json") or 99999)>90:
        notices.append("Estado do supervisor está desactualizado (>90 segundos)")
    if u.get("sync") and "local-differs" in u["sync"].values():
        notices.append("Alguns ficheiros diferem do manifest: auto-update pode recusar actualizações")
    for item in notices:print("  ATENÇÃO:",item)
    if not notices:print("  Sem anomalias evidentes nas verificações disponíveis.")
    print("  Nenhum serviço foi iniciado, parado, recarregado ou alterado.")
    print("TRAVIS_AUDIT_READONLY_COMPLETE=true")

if __name__=="__main__":
    args=argparse.ArgumentParser(description="Auditoria read-only da instalação local Travis")
    args.add_argument("--watch",type=int,default=12,help="segundos de observação sem qualquer alteração (0..120)")
    options=args.parse_args()
    try:run(max(0,min(120,options.watch)))
    except Exception as exc:
        print("TRAVIS_AUDIT_ERROR="+type(exc).__name__+": "+str(exc)[:180],file=sys.stderr)
        sys.exit(1)
