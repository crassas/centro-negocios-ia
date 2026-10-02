#!/usr/bin/env python3
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://centro-negocios-ai.travisthejarvis.workers.dev"
TOKEN_FILE = Path("/content/.centro-gpu-token")
POLL_SECONDS = 0.8


def api(path, method="GET", payload=None, token=None, timeout=45):
    headers = {"User-Agent": "Centro-Colab-GPU/2.0"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def engine_meta(engine):
    status = engine.status()
    gpu = status.get("gpu", {})
    return {
        "gpuName": gpu.get("name", "Colab GPU"),
        "vramGb": gpu.get("total_gb", 0),
        "computeCapability": gpu.get("compute_capability", ""),
        "model": status.get("profile") or status.get("model") or "Qwen Colab",
    }


def load_token():
    try:
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def save_token(token):
    TOKEN_FILE.write_text(token, encoding="utf-8")
    os.chmod(TOKEN_FILE, 0o600)


def pair(meta):
    result = api("/api/gpu/pair", method="POST", payload=meta)
    pair_id = result["pairId"]
    print("Pedido enviado ao Telegram.")
    print("Carrega em ✅ Autorizar GPU no @furalife_bot.")
    deadline = time.time() + 600
    while time.time() < deadline:
        time.sleep(2)
        status = api("/api/gpu/pair-status?id=" + urllib.parse.quote(pair_id))
        state = status.get("status")
        if state == "approved" and status.get("token"):
            save_token(status["token"])
            print("✅ GPU Node autorizado.")
            return status["token"]
        if state in {"rejected", "expired", "missing"}:
            raise RuntimeError("Emparelhamento GPU: " + str(state))
    raise RuntimeError("Tempo de emparelhamento esgotado.")


def run(engine):
    meta = engine_meta(engine)
    token = load_token() or pair(meta)

    print("\n🟢 GPU NODE 01 ONLINE")
    print("GPU:", meta["gpuName"])
    print("VRAM:", meta["vramGb"], "GB")
    print("Modelo:", meta["model"])
    print("Telegram: /gpu <pedido>")
    print("Estado: /gpu-status")
    print("Ctrl+C nesta célula para desligar o nó.\n")

    gpu_q = urllib.parse.quote(str(meta["gpuName"]))
    model_q = urllib.parse.quote(str(meta["model"]))

    while True:
        try:
            path = (
                "/api/gpu/pull?gpu=" + gpu_q
                + "&vram=" + str(meta["vramGb"])
                + "&model=" + model_q
            )
            response = api(path, token=token, timeout=35)
            task = response.get("task")
            if not task:
                time.sleep(POLL_SECONDS)
                continue

            task_id = task["id"]
            print(f"[{task_id}] recebida", flush=True)
            started = time.time()

            answer = engine.chat(
                task.get("prompt", ""),
                system=task.get("system", "") or (
                    "Responde em português de Portugal, sem gerúndio. "
                    "Sê rigoroso, directo e orientado à execução."
                ),
                max_tokens=int(task.get("maxTokens") or 1200),
                temperature=float(task.get("temperature") or 0.2),
            )

            duration_ms = int((time.time() - started) * 1000)
            api(
                "/api/gpu/result",
                method="POST",
                token=token,
                timeout=45,
                payload={
                    "id": task_id,
                    "text": answer,
                    "durationMs": duration_ms,
                    "meta": {
                        **meta,
                        "backend": "vLLM",
                    },
                },
            )
            print(f"[{task_id}] concluída · {duration_ms} ms", flush=True)

        except KeyboardInterrupt:
            print("\nGPU Node 01 desligado.")
            return
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                print("Token GPU inválido. Apaga /content/.centro-gpu-token e volta a executar.")
                return
            print("HTTP", exc.code, flush=True)
            time.sleep(3)
        except Exception as exc:
            print("Erro:", exc, flush=True)
            time.sleep(3)
