# 05 — Segurança

## Servidor local

O Centro Server escuta apenas em:

`127.0.0.1:8765`

Isto significa que não está directamente acessível a partir da Internet.

## Token do servidor

Guardado localmente em:

`~/.centro-server/token`

Permissão esperada:

`0600`

Não deve ser partilhado.

## Token do Centro Agent

Guardado em:

`~/.centro-agent/token`

Também deve permanecer privado.

## Ollama / Claude

Quando configurado, o segredo fica em:

`~/.centro-agent/ollama_api_key`

Nunca deve:
- aparecer no Telegram;
- ser enviado ao Worker;
- entrar em prompts;
- ser guardado no GitHub.

## Git

`git_pull` usa:

`git pull --ff-only`

Antes do pull o servidor verifica se o remote corresponde ao repositório autorizado.

## Execução

Não existe comando de shell arbitrário via Telegram.

Toda a execução deve passar por uma acção allowlisted.

## Confirmação

Acções remotas passam por:
- ✅ Executar
- ❌ Recusar

O objectivo é manter humano no circuito para alterações sensíveis.
