#!/usr/bin/env python3
import getpass
import os
import shutil
import subprocess
from pathlib import Path

HOME = Path.home()
DEST = HOME / ".centro-agent" / "ollama_api_key"

key = getpass.getpass("Cola a chave Ollama e carrega Enter: ").strip().strip('"').strip("'")
if not key:
    raise SystemExit("Chave vazia.")

claude = shutil.which("claude") or str(HOME / ".local" / "bin" / "claude")
if not Path(claude).exists():
    raise SystemExit("Claude Code não foi encontrado.")

env = os.environ.copy()
env["ANTHROPIC_BASE_URL"] = "https://ollama.com"
env["ANTHROPIC_AUTH_TOKEN"] = key
env["OLLAMA_API_KEY"] = key
env.pop("ANTHROPIC_API_KEY", None)

proc = subprocess.run(
    [claude, "--model", "gpt-oss:120b", "-p", "Responde apenas: OK"],
    text=True,
    capture_output=True,
    env=env,
    timeout=120,
)

if proc.returncode != 0:
    msg = (proc.stderr or proc.stdout or "Falha desconhecida.").strip()
    raise SystemExit("CHAVE NÃO ACEITE PELO CLAUDE CODE\n" + msg[-1200:])

DEST.parent.mkdir(parents=True, exist_ok=True)
DEST.write_text(key, encoding="utf-8")
os.chmod(DEST, 0o600)
print("CHAVE VALIDADA PELO CLAUDE CODE E GUARDADA.")
print((proc.stdout or "").strip()[:300])
