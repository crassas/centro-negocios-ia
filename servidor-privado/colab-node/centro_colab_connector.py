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
    req = urllib.request.Request(
        BASE + path,
        data=data,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def engine_meta(engine):
    info = getattr(engine, "info", {}) or {}
    profile = getattr(engine, "profile", None)
    label = getattr(profile, "label", None) or getattr(profile, "model", None) or "Colab Model"
    return {
        "gpuName": str(info.get("name", "Colab GPU")),
        "vramGb": float(info.get("total_gb", 0) or 0),
        "computeCapability": str(info.get("compute_capability", "")),
        "model": str(label),
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
    print("A pedir autorização ao @furalife_bot...", flush=True)
    result = api("/api/gpu/pair", method="POST", payload=meta)
    pair_id = result["pairId"]
    print("No Telegram carrega em ✅ Autorizar GPU.", flush=True)

    deadline = time.time() + 600
    while time.time() < deadline:
        time.sleep(2)
        status = api(
            "/api/gpu/pair-status?id=" + urllib.parse.quote(pair_id)
        )
        state = status.get("status")
        if state == "approved" and status.get("token"):
            save_token(status["token"])
            print("✅ GPU Node autorizado.", flush=True)
            return status["token"]
        if state in {"rejected", "expired", "missing"}:
            raise RuntimeError("Emparelhamento GPU: " + str(state))

    raise RuntimeError("Tempo de emparelhamento esgotado.")


def connect(engine):
    meta = engine_meta(engine)
    token = load_token()

    if not token:
        token = pair(meta)

    print("\n🟢 CENTRO GPU NODE ONLINE")
    print("GPU:", meta["gpuName"])
    print("VRAM:", meta["vramGb"], "GB")
    print("Modelo:", meta["model"])
    print("Telegram: /gpu <pedido>")
    print("Estado: /gpu-status")
    print("Ctrl+C para desligar este nó.\n")

    encoded_gpu = urllib.parse.quote(meta["gpuName"])
    encoded_model = urllib.parse.quote(meta["model"])

    while True:
        try:
            path = (
                "/api/gpu/pull?gpu="
                + encoded_gpu
                + "&vram="
                + str(meta["vramGb"])
                + "&model="
                + encoded_model
            )
            response = api(path, token=token, timeout=35)
            task = response.get("task")

            if not task:
                time.sleep(POLL_SECONDS)
                continue

            task_id = str(task.get("id", ""))
            prompt = str(task.get("prompt", ""))
            system = str(task.get("system", ""))
            max_tokens = int(task.get("maxTokens", 1200) or 1200)
            temperature = float(task.get("temperature", 0.2) or 0.2)

            print(f"[{task_id}] tarefa recebida", flush=True)
            started = time.time()

            answer = engine.chat(
                prompt,
                system=system or (
                    "Responde em português de Portugal, sem gerúndio. "
                    "Sê rigoroso, directo e orientado à execução."
                ),
                max_tokens=max_tokens,
                temperature=temperature,
            )

            duration = int((time.time() - started) * 1000)

            api(
                "/api/gpu/result",
                method="POST",
                token=token,
                timeout=45,
                payload={
                    "id": task_id,
                    "text": answer,
                    "durationMs": duration,
                    "inputTokens": 0,
                    "outputTokens": 0,
                    "meta": {
                        **meta,
                        "backend": "vLLM",
                    },
                },
            )

            print(f"[{task_id}] concluída · {duration} ms", flush=True)

        except KeyboardInterrupt:
            print("\nGPU Node desligado.")
            return
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                print(
                    "Token GPU inválido. "
                    "Executa: !rm -f /content/.centro-gpu-token"
                )
                return
            print("HTTP", exc.code, flush=True)
            time.sleep(2)
        except Exception as exc:
            print("Ligação/execução:", exc, flush=True)
            time.sleep(2)
