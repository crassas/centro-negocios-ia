#!/usr/bin/env python3
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE=os.environ.get("CENTRO_WORKER_URL","https://centro-negocios-ai.travisthejarvis.workers.dev").rstrip("/")
TOKEN_FILE=Path("/content/.centro-gpu-token")

def http_json(path,method="GET",payload=None,token=None,timeout=45):
    headers={"User-Agent":"Centro-Colab-GPU/1.0"}
    data=None
    if payload is not None:
        data=json.dumps(payload).encode("utf-8")
        headers["Content-Type"]="application/json"
    if token:
        headers["Authorization"]="Bearer "+token
    req=urllib.request.Request(BASE+path,data=data,headers=headers,method=method)
    with urllib.request.urlopen(req,timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))

def load_token():
    try:return TOKEN_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:return ""

def pair(meta):
    result=http_json("/api/gpu/pair",method="POST",payload=meta)
    pair_id=result["pairId"]
    print("No @furalife_bot carrega em ✅ Autorizar GPU.")
    deadline=time.time()+600
    while time.time()<deadline:
        time.sleep(2)
        status=http_json("/api/gpu/pair-status?id="+urllib.parse.quote(pair_id))
        state=status.get("status")
        if state=="approved" and status.get("token"):
            token=status["token"]
            TOKEN_FILE.write_text(token,encoding="utf-8")
            os.chmod(TOKEN_FILE,0o600)
            return token
        if state in {"rejected","expired","missing"}:
            raise RuntimeError("Emparelhamento GPU: "+str(state))
    raise RuntimeError("Tempo de emparelhamento esgotado.")

def run(engine):
    meta={
        "gpuName":engine.info["name"],
        "vramGb":engine.info["total_gb"],
        "computeCapability":engine.info["compute_capability"],
        "model":engine.label,
    }
    token=load_token() or pair(meta)
    print("🟢 GPU NODE ONLINE ·",engine.label)
    print("No Telegram usa: /gpu <pedido>")
    while True:
        try:
            path=(
                "/api/gpu/pull?gpu="+urllib.parse.quote(meta["gpuName"])+
                "&vram="+str(meta["vramGb"])+
                "&model="+urllib.parse.quote(meta["model"])
            )
            response=http_json(path,token=token,timeout=35)
            task=response.get("task")
            if not task:
                time.sleep(1)
                continue
            print("Tarefa",task["id"],"recebida")
            started=time.time()
            text=engine.chat(
                task.get("prompt",""),
                system=task.get("system",""),
                max_tokens=task.get("maxTokens",1200),
                temperature=task.get("temperature",.2),
            )
            duration=int((time.time()-started)*1000)
            http_json(
                "/api/gpu/result",method="POST",token=token,timeout=45,
                payload={
                    "id":task["id"],"text":text,"durationMs":duration,
                    "meta":meta
                }
            )
            print("Tarefa",task["id"],"concluída ·",duration,"ms")
        except KeyboardInterrupt:
            print("GPU Node desligado.")
            return
        except urllib.error.HTTPError as exc:
            if exc.code==401:
                print("Token inválido. Apaga /content/.centro-gpu-token e reinicia.")
                return
            print("HTTP",exc.code); time.sleep(3)
        except Exception as exc:
            print("Ligação:",exc); time.sleep(3)
