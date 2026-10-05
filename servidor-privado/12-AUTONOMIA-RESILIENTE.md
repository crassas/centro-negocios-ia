# 12 — Autonomia resiliente

## Objectivo operacional

O Centro deve continuar a trabalhar sem depender de uma única IA, de um único processo local ou de um único pedido HTTP.

## Cadeia principal

`Telegram → Worker → fila persistente → Agent → Server → worktree → executor → validação → Git → Telegram`

## Redundância de execução

1. planeador Workers AI multi-modelo;
2. Claude Code + Ollama no telemóvel quando o plano cloud não é utilizável;
3. retry único para falhas transitórias;
4. lease para recuperar tarefas abandonadas.

Não existe fallback pago automático.

## Redundância de processo

1. Centro Station supervisiona Server e Agent;
2. OpenClaw e Laya são extras supervisionados;
3. runtime actualiza-se a partir de `main`;
4. reinícios esperam por uma tarefa activa terminar;
5. workflow nativo do Operit volta a chamar `centrostation start`:
   - no cold start da aplicação;
   - de 15 em 15 minutos;
6. `.profile` do Ubuntu/PRoot oferece outra linha de recuperação.

## Bootstrap no telemóvel

Uma instalação existente precisa de receber esta geração de runtime pelo menos uma vez:

```sh
curl -fsSL https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent/install.sh | sh
```

Depois, fechar e abrir o Operit uma vez permite que os workflows em `Download/Operit/workflow` sejam recarregados pelo ciclo normal da aplicação.

## Prova rápida

No Telegram:

```text
/agents
```

O resultado separa:
- núcleo;
- executores/redundância;
- Worker/fila;
- auto-update;
- execução ocupada.

`/doctor` continua disponível para diagnóstico do núcleo.

## Definição de “autónomo”

Autonomia não significa ignorar segurança. O Centro pode analisar, editar, validar, fazer commit, tentar publicar, recuperar tarefas e reiniciar componentes sem intervenção normal.

Continuam fora da autonomia automática:
- force-push;
- remoções destrutivas;
- secrets/credenciais;
- alterações de conta;
- fallback pago;
- permissões do Android/ColorOS que exigem intervenção do utilizador.
