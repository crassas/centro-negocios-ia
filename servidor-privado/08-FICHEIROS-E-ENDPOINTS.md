# 08 — Ficheiros e endpoints

## Código no repositório

### `operit-agent/centro_agent.py`
Ponte Cloudflare ↔ telemóvel.

### `operit-agent/centro_server.py`
Servidor privado e executor central.

### `operit-agent/centro_station.py`
Supervisor da estação.

### `operit-agent/centroctl.sh`
Controlo do Centro Agent.

### `operit-agent/serverctl.sh`
Controlo do Centro Server.

### `operit-agent/stationctl.sh`
Controlo unificado.

### `operit-agent/install.sh`
Instalador completo.

### `operit-agent/install_server.sh`
Instalador apenas do servidor.

### `cloudflare-ai-worker/src/index.js`
Worker Telegram/IA/fila.

## Ficheiros locais no telemóvel

### Centro Agent
`~/centro_agent.py`

Estado:
`~/.centro-agent/`

### Centro Server
`~/centro_server.py`

Estado:
`~/.centro-server/`

### Centro Station
`~/centro_station.py`

Estado:
`~/.centro-station/`

## Endpoints Centro Server

### Público apenas localmente

`GET /health`

### Autenticados

`GET /status`

`GET /capabilities`

`GET /history`

`POST /execute`

`POST /echo`

## Endpoint principal

`http://127.0.0.1:8765`

## Endpoint Cloudflare

`https://centro-negocios-ai.travisthejarvis.workers.dev`

## Rotas principais Worker

- `/health`
- `/telegram/webhook`
- `/api/operit/pair`
- `/api/operit/pair-status`
- `/api/operit/pull`
- `/api/operit/status`
- `/api/operit/result`
- `/api/telegram/status`
- `/api/telegram/notify`
- `/api/telegram/decision`
- `/api/telegram/poll`
