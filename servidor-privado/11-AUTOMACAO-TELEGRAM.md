# Automação Telegram → Repositório

## Regra operacional

O Telegram do Centro de Negócios funciona em dois modos:

1. **Análise** — perguntas, auditorias, ideias e comparações são respondidas pelo grupo multi-LLM com evidência GitHub ao vivo.
2. **Execução** — pedidos explícitos de alteração num projecto autorizado criam automaticamente uma tarefa `repo_change` para o Centro Agent/Server, sem pedir um segundo clique de confirmação.

Exemplos:

- `/fazer @beatriz reduz o espaço do hero no mobile`
- `/executar @pentehouse corrige o CTA de WhatsApp`
- linguagem natural como `podes alterar a Beatriz para ...`

## Pipeline de execução

Telegram → Cloudflare Worker → fila TASKS → Centro Agent → Centro Server → executor de código → validação → Git commit → Git push → resultado no Telegram.

## Segurança

A automação não edita o checkout principal directamente. Cada alteração é feita num **git worktree isolado** criado a partir de `origin/main`.

Antes de publicar:

- confirma que o repositório pertence à allowlist;
- confirma que o remote corresponde ao repositório autorizado;
- bloqueia alterações a `.env`, secrets, credenciais, chaves, `.git` e `.github/workflows`;
- limita alterações automáticas a 30 ficheiros;
- valida sintaxe JS/MJS/CJS, Python e JSON;
- corre `npm run build --if-present` quando existem dependências locais;
- cria commit apenas depois das verificações;
- tenta push fast-forward para `main`;
- se `main` rejeitar o push, tenta publicar uma branch `centro/telegram-...`.

Nunca usa force-push, `git reset --hard`, `rm -rf` ou deploy externo a partir do executor.

## GitHub ao vivo

Repositórios públicos autorizados são consultados directamente no GitHub em cada pedido que exige evidência técnica. Snapshots servem apenas de fallback quando o GitHub ao vivo está indisponível.

## OpenClaw

O supervisor não inicia OpenClaw automaticamente por defeito. Para o reactivar conscientemente:

```bash
export CENTRO_OPENCLAW_AUTOSTART=1
centrostation restart
```

Sem essa variável, Centro Server + Centro Agent continuam automáticos sem carregar OpenClaw.

## Projectos autorizados

- `crassas/centro-negocios-ia`
- `crassas/pente_houselanding`
- `crassas/best-pizza-kebab`
- `crassas/restaurante-2-irmaos`
- `crassas/engomadoria-beatriz`

## Princípio

**Pedido de análise → analisar. Pedido inequívoco de alteração → executar, validar, publicar e reportar.**
