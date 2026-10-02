# 01 — Histórico de construção

## Fase 1 — Ponte Telegram → Operit

Foi criado o `Centro Agent` no telemóvel.

Função:
- emparelhar o telemóvel com o Worker;
- receber tarefas autorizadas;
- executar apenas acções permitidas;
- devolver resultados ao Telegram.

Primeiras acções:
- `system_info`
- `site_check`
- `git_status`
- `git_pull`

Resultado confirmado:
Telegram → Cloudflare → fila → Operit → resultado no Telegram.

## Fase 2 — Webhook Telegram

O bot passou de polling para webhook real.

Endpoint:

`/telegram/webhook`

O webhook foi validado através da API do Telegram e ficou com:
- URL correcta;
- mensagens pendentes = 0;
- sem erro activo.

## Fase 3 — Execução em background

Foi criado:
- `centroctl`
- controlo start / stop / restart / status / logs.

O Centro Agent passou a poder ficar em background.

## Fase 4 — Claude Code

Foi ligado o comando:

`/claude <pedido>`

Fluxo:
Telegram → fila → agente local → Claude Code → resultado.

Foi confirmado que o Claude Code instalado no telemóvel funciona com:
- Claude Code v2.1.287
- modelo `gpt-oss:120b`

A autenticação Ollama ainda exige configuração consistente no ambiente local. A integração não deve depender de login Anthropic pago.

## Fase 5 — Centro Server privado

Foi criado um servidor local em:

`127.0.0.1:8765`

Primeiros endpoints:
- `/health`
- `/status`
- `/execute`
- `/echo`

Foi confirmado via Telegram:

Centro Server ACTIVO  
Privado: sim  
Centro Agent ACTIVO

## Fase 6 — Centro Server como executor

O Centro Agent deixou de ser o executor principal.

Novo fluxo:

Telegram → Cloudflare → Centro Agent → Centro Server → acção local

O Centro Server passou a executar:
- informação de sistema;
- verificações de sites;
- Git status;
- Git pull;
- Claude Code.

## Fase 7 — Estação Centro

Foi acrescentado:
- `centro_station.py`
- `centrostation`
- supervisor automático.

O supervisor vigia:
- Centro Server;
- Centro Agent.

Se algum cair enquanto o ambiente Linux continua vivo, tenta recuperá-lo.

## Fase 8 — Estado actual

A arquitectura já suporta:
- núcleo privado;
- ponte Telegram;
- fila Cloudflare;
- agente local;
- executor central;
- supervisor;
- histórico local;
- diagnóstico;
- política local-first.

Próxima evolução:
Router de agentes + memória SQLite + registo de agentes + scheduler.
