# 06 — Estado actual

## Confirmado na arquitectura e no repositório

### Telegram / Cloudflare
- webhook Telegram;
- Worker Cloudflare;
- Durable Object `TASKS`;
- fila persistente;
- emparelhamento do Centro Agent;
- resultados devolvidos ao Telegram;
- grupo multi-LLM e Sala de Conselho;
- retry automático de tarefas recuperáveis;
- lease de execução para recuperar tarefas presas após queda do Android/PRoot.

### Operit / Linux
- Centro Agent;
- Centro Server privado em `127.0.0.1:8765`;
- supervisor Centro Station;
- execução em background;
- worktrees Git isolados;
- actualização automática do runtime a partir de `main`;
- workflow nativo do Operit para recuperação no `app_open` e de 15 em 15 minutos;
- fallback adicional no `.profile` do Ubuntu/PRoot.

### Execução de alterações
A cadeia actual é:

`Telegram → Worker → TASKS → Centro Agent → Centro Server → worktree isolado → planeador → validação → commit → push → Telegram`

O planeador tenta vários modelos Workers AI. Se não produzir um plano aplicável, o Centro Server pode usar Claude Code ligado ao Ollama como segundo executor, mantendo `PAID_FALLBACK=false`.

Os planos estruturados são validados integralmente em memória antes de qualquer ficheiro ser escrito. Uma edição inválida não deixa uma alteração parcial no worktree.

### Resiliência
- timeout longo para alterações de repositório;
- retry automático de falhas transitórias;
- recuperação de tarefas cuja lease expirou;
- supervisor para Server, Agent, OpenClaw e Laya;
- auto-update do Server/Agent/Supervisor;
- reinícios de auto-update adiados enquanto uma tarefa está em execução;
- CI valida Python, shell e JavaScript antes de considerar a alteração saudável.

## Comandos de diagnóstico

- `/server` — Server + Agent + Supervisor;
- `/station` — estado da estação;
- `/doctor` — diagnóstico do núcleo e extras;
- `/agents`, `/agentes` ou `/autonomia` — matriz única de agentes, executores e prontidão.

## Claude Code

Integração preparada para:
- Claude Code local;
- endpoint Ollama;
- modelo por defeito `gpt-oss:120b`;
- sem fallback automático para API Anthropic paga.

A chave é lida de `~/.centro-agent/ollama_api_key`.

## Multi-agente

No Worker existem rotas multi-modelo reais:
- GLM;
- Qwen;
- Llama;
- Mistral;
- Gemma;
- GPT-OSS 120B como síntese/director em Conselho.

No telemóvel existem também OpenClaw e Laya como serviços opcionais supervisionados. Manus continua opcional e só é usado quando configurado explicitamente.

## Limitações reais que permanecem

- o Android/ColorOS pode suspender ou matar o processo em background;
- não existe ainda SQLite central para memória operacional;
- não existe ainda dashboard local completo;
- o workflow do Operit reduz a dependência de arranque manual, mas não equivale a um daemon Linux de boot garantido pelo sistema operativo;
- a primeira instalação/actualização do novo mecanismo no telemóvel exige um bootstrap do runtime.
