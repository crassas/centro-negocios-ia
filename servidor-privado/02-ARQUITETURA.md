# 02 — Arquitectura

## Fluxo principal

```
Telegram
   ↓
Cloudflare Worker
   ↓
TaskQueue / Durable Object
   ↓
Centro Agent
   ↓
Centro Server 127.0.0.1:8765
   ↓
Ferramentas locais
```

## Componentes

### Telegram
Interface remota principal.

### Cloudflare Worker
Responsável por:
- webhook Telegram;
- interpretação de comandos;
- fila de tarefas;
- confirmações;
- encaminhamento de resultados.

### TaskQueue
Durable Object usado para:
- emparelhamento;
- fila;
- aprovar/rejeitar;
- estado das tarefas;
- resultados.

### Centro Agent
Ponte entre a Cloudflare e o telemóvel.

Não deve ser o cérebro principal.

### Centro Server
Núcleo privado local.

Responsabilidades:
- executar acções permitidas;
- guardar histórico;
- expor estado;
- centralizar ferramentas;
- servir de base para agentes futuros.

### Centro Station Supervisor
Mantém:
- Centro Server;
- Centro Agent.

## Princípio de segurança

Nada de shell remoto genérico.

As acções são nomeadas e permitidas explicitamente.

Exemplos:
- `system_info`
- `site_check`
- `git_status`
- `git_pull`
- `claude_query`

## Princípio de custo

```
local → gratuito disponível → pago só com autorização explícita
```

Não deve existir fallback pago automático.
