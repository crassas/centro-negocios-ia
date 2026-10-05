# Automação Telegram → Repositório

## Regra operacional

O Telegram do Centro de Negócios funciona em dois modos:

1. **Análise** — perguntas, auditorias, ideias e comparações podem usar o grupo multi-LLM / Conselho com evidência real.
2. **Execução** — pedidos explícitos de alteração num projecto autorizado criam automaticamente uma tarefa `repo_change`, sem segundo clique de confirmação.

Exemplos:

- `/fazer @beatriz reduz o espaço do hero no mobile`
- `/executar @pentehouse corrige o CTA de WhatsApp`
- linguagem natural como `podes alterar a Beatriz para ...`

## Pipeline

`Telegram → Cloudflare Worker → TASKS → Centro Agent → Centro Server → worktree isolado → planeador/executor → validação → Git commit → Git push → Telegram`

### Camada 1 — planeador Workers AI

O planeador tenta fornecedores/modelos em sequência. JSON Schema só é usado no modelo em que a compatibilidade foi validada; os restantes devolvem JSON textual.

Os planos usam operações limitadas:
- `replace`;
- `append`;
- `create`.

O plano inteiro é validado antes de qualquer escrita.

### Camada 2 — fallback Claude/Ollama

Se o planeador cloud falhar, devolver zero edições ou produzir um plano que o validador rejeita, o Centro Server tenta Claude Code ligado ao Ollama dentro do mesmo worktree isolado.

Este fallback:
- não usa automaticamente a API Anthropic paga;
- não pode tocar em secrets, `.git` ou workflows;
- não faz commit/push por conta própria;
- deixa validação e publicação ao Centro Server.

## Recuperação automática

Uma tarefa pode ser repetida uma vez quando falha de forma transitória. A fila também usa uma lease: se o Android/PRoot desaparecer depois de receber a tarefa, uma execução abandonada pode voltar à fila em vez de ficar presa para sempre.

O supervisor:
- mantém Server e Agent;
- tenta manter OpenClaw e Laya;
- actualiza o runtime;
- não reinicia Server/Agent a meio de uma execução.

O Operit tem ainda um workflow de recuperação:
- `app_open`;
- intervalo de 15 minutos via WorkManager.

## Segurança

Antes de publicar:
- confirma allowlist do repositório;
- confirma o remote Git;
- bloqueia `.env`, secrets, credenciais, chaves, `.git` e `.github/workflows`;
- limita o volume de alterações;
- valida JS/MJS/CJS, Python e JSON;
- corre build quando aplicável;
- cria commit só depois das verificações;
- tenta push fast-forward para `main`;
- se necessário, publica a branch `centro/telegram-...`.

Nunca usa force-push, `git reset --hard`, `rm -rf` ou deploy externo a partir do executor.

## Diagnóstico

- `/station`
- `/doctor`
- `/agents` ou `/autonomia`
- `/openclaw`
- `/laya`

## Projectos autorizados

- `crassas/centro-negocios-ia`
- `crassas/pente_houselanding`
- `crassas/best-pizza-kebab`
- `crassas/restaurante-2-irmaos`
- `crassas/engomadoria-beatriz`

## Princípio

**Pedido de análise → analisar. Pedido inequívoco de alteração → executar, validar, publicar e reportar.**
