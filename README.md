# Centro de Negócios

Aplicação operacional publicada em GitHub Pages. Não usa métricas de demonstração.

## Funções

- Auditoria automática dos sites a cada 15 minutos.
- HTTP, tempo de resposta, title, description, H1, canonical, robots.txt, sitemap e JSON-LD.
- Segunda leitura automática quando title ou H1 falham, para reduzir falsos alertas de cache/deploy.
- Detecção de alteração do HTML por SHA-256.
- Importação de CSV do Google Search Console.
- CRM e leads no armazenamento local do navegador.
- Caixa com entradas, saídas e saldo calculado.
- Cofre local cifrado com PBKDF2-SHA256 + AES-GCM. A palavra-passe mestra não é guardada.
- OCR local com Tesseract.js.
- Relatório JSON, CSV técnico, impressão/PDF e backup/restauro.
- PWA instalável em dispositivos compatíveis.

## Dados

`data/sites.json` define os sites auditados. `data/live.json` contém apenas resultados técnicos públicos da auditoria. CRM, leads, caixa, Search Console importado e cofre não são enviados para o repositório.

## Segurança do cofre

O cofre usa PBKDF2-SHA256 (250.000 iterações) para derivar uma chave e AES-GCM 256 para cifrar os dados. O backup contém apenas o blob cifrado do cofre. Sem a palavra-passe mestra, não há mecanismo de recuperação.

## Publicação

Página: https://crassas.github.io/centro-negocios-ia/

O workflow `.github/workflows/monitor.yml` executa a auditoria e publica a leitura actualizada. O workflow `.github/workflows/pages.yml` publica alterações da interface.

## Search Console directo

O painel SEO suporta duas fontes: CSV manual e ligação directa à Search Console API.

A ligação directa usa uma conta de serviço Google com o scope apenas de leitura `webmasters.readonly`. A chave privada nunca é enviada para o browser nem guardada no repositório.

Configuração:

1. Criar um projecto no Google Cloud e activar **Google Search Console API**.
2. Criar uma **Service Account** e gerar uma chave JSON.
3. No Search Console, dar à conta de serviço acesso às propriedades pretendidas.
4. Em **GitHub > Settings > Secrets and variables > Actions**, criar o secret `GSC_SERVICE_ACCOUNT_JSON` com o conteúdo integral do JSON.
5. Executar o workflow **Deploy Cloudflare AI Worker**.
6. No Centro, abrir **SEO > Google Search Console ligado ao Centro**, autorizar o dispositivo pelo Telegram e escolher a propriedade.

O Worker transforma a chave da conta de serviço num token OAuth 2.0 de curta duração e consulta apenas os endpoints de leitura. O browser recebe apenas os dados necessários para o painel.

## Operação autónoma sem OpenClaw

<!-- CENTRO_OPERACAO_SEM_OPENCLAW -->
O OpenClaw está temporariamente desactivado. O Centro mantém o Worker, a fila persistente, o Agent, o Server, o supervisor e o Laya. A publicação automática usa validação local antes de enviar alterações para o Git. O fallback pago automático permanece desactivado.



## Empresa / Business OS

A área **Empresa** transforma o Centro numa camada de gestão operacional, sem métricas fictícias.

Inclui:
- visão mensal de entradas, saídas e margem registadas;
- pagamentos por receber;
- objetivo mensal configurável;
- fila única de tarefas para sites, apps, SEO, CRM, financeiro, comercial e administração;
- prioridade, prazo e estado de cada tarefa;
- visão por projeto com entradas, custos, pendentes e próxima ação do CRM;
- custos fixos mensais planeados, sem os contabilizar automaticamente como despesa;
- inclusão dos dados de Empresa no relatório e no backup existente.

Os dados continuam local-first nesta versão. Credenciais permanecem separadas no Cofre cifrado.
