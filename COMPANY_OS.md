# Empresa OS — Centro de Negócios

## Objetivo

Transformar o Centro de Negócios num sistema operativo de uma empresa digital pequena, capaz de crescer sem perder controlo.

O sistema separa quatro realidades:

1. **Dinheiro real** — entradas e saídas efetivamente registadas.
2. **Dinheiro previsto** — pagamentos por receber e custos fixos planeados.
3. **Trabalho real** — tarefas com responsável implícito na operação, prioridade, prazo e estado.
4. **Carteira** — cada cliente/projeto com CRM, site, repositório, dinheiro e próxima ação.

## Regra principal

Nenhum KPI deve ser inventado. Se não existir dado registado, o sistema mostra zero, “sem dados” ou pede registo.

## Fluxo operacional

Pedido ou oportunidade → CRM/Projeto → Tarefa → Execução → validação → Git/produção → conclusão → pagamento → Caixa.

Os agentes e o Telegram continuam como camada de execução e autorização. A área Empresa é a camada de gestão: decide o que interessa fazer e mostra o impacto financeiro e operacional.

## Módulos da primeira versão

### Controlo
- nome da operação;
- objetivo mensal de entradas;
- reserva desejada;
- progresso baseado apenas em entradas registadas.

### Fila única de trabalho
Áreas:
- Site / App
- SEO
- CRM
- Financeiro
- Comercial
- Administração

Estados:
- A fazer
- Em curso
- À espera
- Concluído

Prioridades:
- Normal
- Alta
- Urgente

### Carteira
Para cada projeto:
- etapa do CRM;
- próxima ação;
- tarefas abertas;
- entradas registadas;
- custos registados;
- pagamentos por receber;
- acesso ao site e GitHub quando disponíveis.

### Estrutura financeira
- entradas e saídas do mês;
- margem registada;
- pagamentos por receber;
- custos fixos mensais planeados.

Os custos fixos não são lançados automaticamente no Caixa, para evitar contabilidade duplicada. O pagamento real continua a ser registado no Financeiro.

## Próxima camada

Quando esta base estiver validada em uso real, a evolução natural é persistência remota autenticada no Worker para sincronizar telemóvel/computador, seguida de faturação/documentos e relatórios por cliente. A sincronização não deve expor o Cofre.
