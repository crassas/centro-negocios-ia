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
POLL_SECONDS = 1.0


def http_json(path, method="GET", payload=None, token=None, timeout=60):
    headers = {"User-Agent": "Centro-Colab-GPU-Bridge/1.0"}
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


def load_token():
    try:
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def save_token(token):
    TOKEN_FILE.write_text(token, encoding="utf-8")
    os.chmod(TOKEN_FILE, 0o600)


def pair(meta):
    print("A pedir autorização ao Telegram...", flush=True)
    pair = http_json("/api/gpu/pair", method="POST", payload=meta)
    pair_id = pair["pairId"]

    print("No @furalife_bot carrega em ✅ Autorizar GPU.", flush=True)

    deadline = time.time() + 600
    while time.time() < deadline:
        time.sleep(2)
        status = http_json(
            "/api/gpu/pair-status?id=" + urllib.parse.quote(pair_id)
        )
        state = status.get("status")

        if state == "approved" and status.get("token"):
            save_token(status["token"])
            print("GPU Node autorizado.", flush=True)
            return status["token"]

        if state in {"rejected", "expired", "missing"}:
            raise RuntimeError("Emparelhamento GPU: " + str(state))

    raise RuntimeError("Tempo de emparelhamento esgotado.")


def engine_meta(engine):
    status = engine.status()
    gpu = status.get("gpu", {})
    return {
        "gpuName": gpu.get("name", "Colab GPU"),
        "vramGb": gpu.get("total_gb", 0),
        "model": status.get("profile", status.get("model", "Qwen 72B")),
        "backend": "vLLM",
    }


def run(engine):
    meta = engine_meta(engine)

    print("=== CENTRO GPU BRIDGE ===")
    print("GPU:", meta["gpuName"])
    print("VRAM:", meta["vramGb"], "GB")
    print("Modelo:", meta["model"])

    token = load_token()
    if not token:
        token = pair(meta)

    gpu_q = urllib.parse.quote(str(meta["gpuName"]))
    model_q = urllib.parse.quote(str(meta["model"]))

    print("")
    print("🟢 GPU NODE ONLINE")
    print("No Telegram usa: /gpu <pedido>")
    print("Ctrl+C para desligar.")
    print("")

    while True:
        try:
            path = (
                "/api/gpu/pull?gpu="
                + gpu_q
                + "&vram="
                + str(meta["vramGb"])
                + "&model="
                + model_q
            )

            response = http_json(path, token=token, timeout=40)
            task = response.get("task")

            if not task:
                time.sleep(POLL_SECONDS)
                continue

            task_id = task["id"]
            print("[" + task_id + "] tarefa recebida", flush=True)

            started = time.time()
            answer = engine.chat(
                task.get("prompt", ""),
                system=task.get("system", ""),
                max_tokens=task.get("maxTokens", 1200),
                temperature=task.get("temperature", 0.2),
            )
            duration_ms = int((time.time() - started) * 1000)

            http_json(
                "/api/gpu/result",
                method="POST",
                token=token,
                timeout=60,
                payload={
                    "id": task_id,
                    "text": answer,
                    "durationMs": duration_ms,
                    "inputTokens": 0,
                    "outputTokens": 0,
                    "meta": meta,
                },
            )

            print(
                "[" + task_id + "] concluída · "
                + str(duration_ms)
                + " ms",
                flush=True,
            )

        except KeyboardInterrupt:
            print("\nGPU Node desligado.")
            return
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                print(
                    "Token GPU inválido. "
                    "Apaga /content/.centro-gpu-token e volta a arrancar."
                )
                return
            print("HTTP", exc.code, flush=True)
            time.sleep(3)
        except Exception as exc:
            print("Erro:", exc, flush=True)
            time.sleep(3)
