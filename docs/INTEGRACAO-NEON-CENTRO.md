# Centro de Negócios ↔ Neon (QN CRM)

Estado em 2026-10-19: **frontend e Worker publicados; ligação à Neon pendente da configuração do secret do Worker**.

## Componentes já existentes
- Centro de Negócios em https://crassas.github.io/centro-negocios-ia/#empresa
- Worker Cloudflare `centro-negocios-ai`: os agentes, Telegram e fila Operit continuam inalterados.
- Neon PostgreSQL `quasi-norte-crm`, região de Frankfurt.
- Vista `public.centro_business_overview`: só expõe nome de cliente, website, URL/repositório, estado, montante pendente e número de tarefas abertas.
- Utilizador de base de dados `qn_centro_reader`: **só leitura da vista**. Não utilizar o role proprietário da BD em produção.

## Ligar o secret sem expor credenciais
1. Abrir https://console.neon.tech/ e entrar em `quasi-norte-crm`.
2. Em **Connect / Connection Details**, escolher `neondb` e role `qn_centro_reader`. Copiar a string de ligação segura (não guardar em ficheiros do GitHub, issues ou conversas).
3. Abrir https://github.com/crassas/centro-negocios-ia/settings/secrets/actions
4. Criar um **Repository secret** chamado exatamente `NEON_DATABASE_URL` e colar a string.
5. Reexecutar o workflow `Deploy Cloudflare AI Worker` no GitHub Actions ou fazer novo commit num ficheiro de `cloudflare-ai-worker/`. O workflow instala o driver e envia o secret ao Worker, sem publicá-lo em Git.
6. No Centro, **Empresa → Autorizar no Telegram**. Aprovar o pedido no Telegram autorizado e escolher **Atualizar Neon**.

## Verificações obrigatórias
- API pública `GET /api/business/status` devolve apenas se o secret existe e se o dispositivo está autorizado, sem dados financeiros.
- `GET /api/business/overview` **sem** Bearer válido devolve HTTP 401.
- **Com** autenticação no Telegram, devem surgir os quatro sites e **25,00 € pendentes** da Engomadoria Beatriz.
- O separador Empresa inclui uma secção separada de **apenas leitura**. O Caixa/CRM do navegador e os agentes não são migrados nem substituídos por esta primeira integração.
- **Nunca** marcar os 25 € como recebidos por causa da sincronização; é uma pendência.

## Risco operacional
A página GitHub Pages é pública, por isso nunca incluir `NEON_DATABASE_URL` em JavaScript, HTML, Git, issues ou URLs. Os dados só atravessam o Worker mediante uma autorização de dispositivo via Telegram e são consultados com role de leitura. Não adicionar NIF, emails ou contactos pessoais ao endpoint sem desenhar permissões adequadas.

## Testes
Pull request #38 aprovado e integrado no `main`. Workflows `Validate Centro Core`, `Deploy GitHub Pages` e `Deploy Cloudflare AI Worker` concluídos com sucesso.
