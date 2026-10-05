# 07 — Roadmap

## Estado da Estação Máxima

### 1. Router de agentes — PARCIAL / OPERACIONAL
Já existe routing no Worker para grupo multi-LLM, Conselho, repo changes e agentes locais por comando.

Falta:
- política única de escolha entre cloud/local por custo, latência e confiança;
- escalonamento automático para OpenClaw/Laya quando trouxer vantagem comprovada.

### 2. Agent Registry — PARCIAL
`/agents` fornece uma matriz de prontidão operacional.

Falta persistir um registry central com:
- nome;
- função;
- capacidades;
- modelo/ferramenta;
- estado;
- prioridade;
- custo permitido.

### 3. SQLite — POR FAZER
Base local para:
- projectos;
- clientes;
- tarefas;
- decisões;
- histórico;
- leads;
- resultados;
- memória operacional.

### 4. Scheduler / recuperação — PARCIAL / OPERACIONAL
Já existe:
- fila persistente;
- retries;
- lease de tarefas;
- timeouts;
- Operit WorkManager de 15 em 15 minutos;
- recuperação no `app_open`;
- supervisor de serviços.

Falta scheduler local genérico com dependências, prioridades e calendário próprio.

### 5. Auditor — PARCIAL / OPERACIONAL
Já existe:
- worktree isolado;
- allowlist;
- paths protegidos;
- aplicação atómica do plano;
- validação de sintaxe/build;
- CI;
- auditor Llama na Sala de Conselho.

Falta avaliação automática de regressões visuais e testes específicos por projecto.

### 6. Auto-recuperação Android — IMPLEMENTADA EM CAMADAS
- supervisor;
- auto-update;
- `.profile` Ubuntu/PRoot;
- workflow Operit `app_open`;
- WorkManager periódico.

Limite externo: políticas de bateria/background do Android/ColorOS.

### 7. Dashboard local — POR FAZER
Painel único para:
- serviços;
- tarefas;
- agentes;
- logs;
- sites;
- Git;
- memória;
- custo externo.

### 8. Linguagem natural no Telegram — OPERACIONAL PARA ALTERAÇÕES EXPLÍCITAS
Pedidos inequívocos por projecto podem criar `repo_change` automaticamente, validar e publicar sem segundo clique.

Próximo nível:
`Vê a Pentehouse e melhora o que estiver mal.`

Para pedidos abertos deste tipo, o Director deverá decompor o objectivo, recolher evidência, escolher agentes, validar o plano e só publicar alterações dentro da política autorizada.

### 9. Política de custo — ACTIVA

`PAID_FALLBACK=false`

Nenhum fallback pago automático.
