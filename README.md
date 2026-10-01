# Centro de Negócios IA

Painel operacional publicado em GitHub Pages.

## O que está real

- Monitorização técnica automática de `pentehouse.pt`, `bestpizzaandkebab.pt` e `restaurantedoisirmaos.pt`.
- Verificação de HTTP, tempo de resposta, title, description, H1, canonical, robots.txt, sitemap.xml e JSON-LD.
- Detecção de alterações através do hash da página comparado com a leitura anterior.
- CRM, notas e leads guardados localmente no navegador.
- Importação de CSV do Google Search Console, sem inventar rankings.
- OCR local de imagens com Tesseract.js.
- Exportação de relatório JSON, CSV e impressão/PDF.

## Monitor

O workflow `.github/workflows/monitor.yml` corre de hora a hora e também quando a configuração do monitor muda.
O resultado mais recente é guardado em `data/live.json`.

## Limites actuais

O site é estático. Credenciais privadas não ficam no repositório.
A API directa do Google Search Console e fontes automáticas de leads exigem um backend/OAuth e ficam para a próxima fase.

## Página

https://crassas.github.io/centro-negocios-ia/
