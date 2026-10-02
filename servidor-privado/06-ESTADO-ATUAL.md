# 06 — Estado actual

## Confirmado em funcionamento

### Telegram
- webhook activo;
- mensagens recebidas em tempo real;
- confirmações por botão;
- resultados devolvidos ao chat.

### Cloudflare
- Worker activo;
- Workers AI activo;
- Durable Object `TASKS`;
- fila persistente;
- emparelhamento;
- resultados.

### Operit / Linux
- Python 3.12;
- Node 24;
- agente local;
- execução em background.

### Centro Server
- activo em `127.0.0.1:8765`;
- privado;
- token local;
- health check;
- status;
- executor local;
- histórico.

### Estação
- supervisor criado;
- comandos unificados;
- diagnóstico.

## Confirmado por teste remoto

Foi executado via Telegram:

`/server`

Resultado devolvido:
- Centro Server ACTIVO;
- privado;
- Centro Agent ACTIVO;
- PIDs válidos.

## Claude Code

Instalado e funcional localmente.

Versão observada:
`Claude Code v2.1.287`

Modelo observado:
`gpt-oss:120b`

A integração via Telegram existe, mas a autenticação Ollama precisa de ficar estabilizada de forma persistente.

## Limitações actuais

- Android pode matar o ambiente Proot.
- Ainda não existe auto-arranque após reboot.
- Ainda não existe router multi-agente.
- Ainda não existe SQLite central.
- Ainda não existe scheduler local completo.
- Ainda não existe dashboard local da estação.
