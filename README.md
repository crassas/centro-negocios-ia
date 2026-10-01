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