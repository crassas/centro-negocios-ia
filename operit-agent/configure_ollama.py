#!/usr/bin/env python3
import getpass
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

URL = "https://ollama.com/api/chat"
MODEL = "gpt-oss:120b"
DEST = Path.home() / ".centro-agent" / "ollama_api_key"

key = getpass.getpass("Cola a chave Ollama e carrega Enter: ").strip().strip('"').strip("'")
if not key:
    raise SystemExit("Chave vazia.")

payload = json.dumps({
    "model": MODEL,
    "messages": [{"role": "user", "content": "Responde apenas OK"}],
    "stream": False,
}).encode("utf-8")

req = urllib.request.Request(
    URL,
    data=payload,
    method="POST",
    headers={
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "User-Agent": "Centro-Negocios-Key-Test/1.0",
    },
)

try:
    with urllib.request.urlopen(req, timeout=60) as res:
        res.read(512)
        status = res.status
except urllib.error.HTTPError as exc:
    status = exc.code
    if status in (401, 403):
        raise SystemExit(f"CHAVE RECUSADA PELO OLLAMA · HTTP {status}")
    if status == 429:
        raise SystemExit("CHAVE ACEITE, MAS A CONTA ESTÁ SEM CAPACIDADE/CRÉDITO NESTE MOMENTO · HTTP 429")
    raise SystemExit(f"OLLAMA DEVOLVEU HTTP {status}")
except Exception as exc:
    raise SystemExit("Não foi possível testar a chave: " + str(exc))

if status != 200:
    raise SystemExit(f"Teste inesperado · HTTP {status}")

DEST.parent.mkdir(parents=True, exist_ok=True)
DEST.write_text(key, encoding="utf-8")
os.chmod(DEST, 0o600)
print("CHAVE OLLAMA VALIDADA E GUARDADA.")
print("Agora executa: centroctl restart")
