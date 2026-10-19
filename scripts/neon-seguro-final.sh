#!/usr/bin/env bash
# Quasi Norte: ligação segura Neon -> Centro de Negócios.
# O administrador e a senha nova nunca são mostrados nem publicados.
set -euo pipefail
umask 077
REPO="crassas/centro-negocios-ia"
trap 'unset PG_OWNER_URL PGPASSWORD QN_NEW_PASSWORD QN_DB_URL PGHOST PGUSER PGDATABASE PGPORT PGSSLMODE 2>/dev/null || true' EXIT
command -v gh >/dev/null || { echo "Falta gh. Executa: apt install gh"; exit 1; }
command -v python3 >/dev/null || { echo "Falta python3"; exit 1; }
gh auth status -h github.com >/dev/null 2>&1 || { echo "Inicia sessão: gh auth login --web"; exit 1; }
if ! command -v psql >/dev/null; then
  echo "A instalar cliente PostgreSQL no Ubuntu..."
  apt-get update -qq
  apt-get install -y -qq postgresql-client
fi

echo "QUASI NORTE / Ligação protegida Neon -> Centro"
echo "No Neon: quasi-norte-crm > Connect > main > neondb > neondb_owner."
echo "Copia a connection string PostgreSQL completa."
echo "Será utilizada apenas para ativar a conta de leitura limitada."
printf 'Cola a connection string (texto oculto): '
IFS= read -r -s PG_OWNER_URL
printf '\n'
export PG_OWNER_URL
if ! config="$(python3 - <<'PY'
import os,sys,shlex
from urllib.parse import urlsplit,unquote
value=os.environ.get("PG_OWNER_URL","").strip().strip('"').strip("'")
try: p=urlsplit(value)
except Exception: sys.exit(2)
if p.scheme not in ("postgresql","postgres") or p.username!="neondb_owner" or not (p.hostname or "").endswith(".neon.tech") or p.path!="/neondb" or not p.password:
    print("Usa o endereço PostgreSQL da role neondb_owner e base neondb.",file=sys.stderr)
    sys.exit(2)
env={"PGHOST":p.hostname,"PGPORT":str(p.port or 5432),"PGUSER":p.username,"PGDATABASE":"neondb",
     "PGPASSWORD":unquote(p.password),"PGSSLMODE":"require"}
for k,v in env.items(): print("export "+k+"="+shlex.quote(v))
PY
)"; then
  echo "URL inválido, não foi feita nenhuma alteração."
  exit 1
fi
eval "$config"
unset config PG_OWNER_URL

export QN_NEW_PASSWORD
QN_NEW_PASSWORD="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(40))
PY
)"
echo "A ativar qn_worker_readonly, que só pode consultar o resumo dos sites..."
psql -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
ALTER ROLE qn_worker_readonly LOGIN PASSWORD '$QN_NEW_PASSWORD';
SQL
unset PGPASSWORD

if ! PGPASSWORD="$QN_NEW_PASSWORD" PGUSER="qn_worker_readonly" psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.centro_business_overview" | grep -qx '4'; then
  echo "Erro: a conta limitada não consegue consultar exatamente quatro sites."
  exit 1
fi
if PGPASSWORD="$QN_NEW_PASSWORD" PGUSER="qn_worker_readonly" psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.business_clients" >/dev/null 2>&1; then
  echo "A conta tem permissões excessivas: não será usada."
  exit 1
fi

export PGHOST PGPORT PGDATABASE
QN_DB_URL="$(python3 - <<'PY'
import os
from urllib.parse import quote
pwd=quote(os.environ["QN_NEW_PASSWORD"],safe="")
host=os.environ["PGHOST"]
port=os.environ.get("PGPORT","5432")
db=os.environ.get("PGDATABASE","neondb")
print("postgresql://qn_worker_readonly:"+pwd+"@"+host+(":"+port if port!="5432" else "")+"/"+db+"?sslmode=require")
PY
)"
echo "A guardar NEON_DATABASE_URL como segredo cifrado no GitHub..."
printf '%s' "$QN_DB_URL" | gh secret set NEON_DATABASE_URL --repo "$REPO"
unset QN_DB_URL QN_NEW_PASSWORD

if ! gh secret list --repo "$REPO" | grep -Eq '^NEON_DATABASE_URL[[:space:]]'; then
  echo "A credencial não foi confirmada nos secrets do GitHub."
  exit 1
fi
echo "CREDENCIAL=GUARDADA"
if gh workflow run deploy-ai-worker.yml --repo "$REPO" --ref main; then
  echo "DEPLOY_PEDIDO=SIM"
else
  echo "DEPLOY_PEDIDO=NAO (credencial segura já guardada, basta executar o workflow depois)."
fi
