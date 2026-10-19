# Centro de Negócios — regras de operação e fontes de dados
19 de outubro de 2026 · revisão de higiene e acessibilidade

## O primeiro ecrã
A aplicação abre em **Empresa**. Painel, Sala dos Agentes, Clientes, Sites, SEO, Leads, Caixa, Cofre e Travis continuam disponíveis pela navegação.
Em Android, percorre o menu inferior com o dedo na horizontal. Tocar num módulo não apaga dados nem altera a base de dados.

## Fontes sem duplicação
| Informação | Fonte atualmente usada | Escrita permitida? |
|---|---|---|
| Quatro clientes, quatro websites, valores por receber | Neon `quasi-norte-crm` através do Cloudflare Worker autenticado por Telegram | Não, nesta interface; somente leitura |
| Entradas, despesas, saldo, pendências e custos fixos antigos | `localStorage` deste navegador | Sim, apenas neste dispositivo |
| Fichas CRM, leads e tarefas existentes | `localStorage` deste navegador | Sim, apenas neste dispositivo |
| Auditorias dos sites | `data/sites.json` e `data/live.json` do GitHub | Não, pelo ecrã Empresa |
| Execução, fila e agentes existentes | Cloudflare TaskQueue + Operit/Termux | Sem mudança neste saneamento |
| Credenciais privadas do Cofre | Armazenamento cifrado local, com palavra-passe mestra | Nunca copiar para Neon, GitHub ou conversas |

**Regra:** dinheiro da Neon e dinheiro de um registo local igual não são duas dívidas. Não somar valores de fontes distintas antes de identificar a mesma obrigação e reconciliar.
Apenas marcar um pagamento como recebido quando houver confirmação real. A interface local bloqueia o botão “Recebi” quando encontra uma correspondência provável na Neon; não elimina o registo, porque não se pode garantir que seja duplicado.

## Notas históricas e segurança
- A versão anterior da aplicação preenchia automaticamente registos de exemplo para Engomadoria Beatriz em determinados dispositivos. Este comportamento foi desativado, sem apagar o histórico local já existente.
- O projeto antigo `engomadoria` e o identificador atual `engomadoria-beatriz` representam o mesmo repositório/site para efeitos visuais.
- Os valores e o nome das empresas que aparecem como “Neon ligada” são consultados do servidor; quando a rede falha, o painel avisa que a leitura ficou desatualizada.
- Dados pessoais, NIF, passwords e segredos PostgreSQL não são devolvidos no resumo `centro_business_overview`.
- O dispositivo tem de estar autorizado por Telegram; não transportar o token de autorização para outro aparelho.
- O site `Restaurante 2 Irmãos` tem domínio por confirmar na Neon, apesar de existir uma referência no repositório. Atualizar quando a titularidade e o URL publicado estiverem validados.
- O saneamento atual melhora o uso e os dados apresentados, mas **não é uma auditoria de segurança completa** dos endpoints antigos dos agentes, do cofre ou dos serviços de terceiros.

## Rotina diária
1. Abrir **Empresa** e confirmar “Neon ligada”.
2. Rever valores pendentes e lista de tarefas reais em Foco.
3. Registar leads apenas com dados confirmados e próximos passos explícitos.
4. Preparar propostas e trabalhos; associar ao projeto correto.
5. Registar recebimentos reais na fonte correta; não criar transações de demonstração.
6. Exportar o backup local antes de trocar de navegador, dispositivo ou limpar os dados.
7. Rever o que ficou por fazer.

## Fase seguinte (não implementada neste saneamento)
- Migração de leads/tarefas/pagamentos locais para Neon com exportação, deduplicação e autorização.
- Backend de escrita autenticado, com registos de alterações e validação de donos.
- Revisão abrangente de permissões dos endpoints antigos e dos agentes.
- Auditoria visual em vários dispositivos reais e avaliação formal WCAG.
