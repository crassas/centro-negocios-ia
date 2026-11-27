---
name: public-road-intelligence
description: Distinguir trânsito simulado de ocorrências registadas (Porto, Lisboa, Londres) e velocidades medidas (Finlândia, NYC quando recentes), com fonte e hora.
origin: QUANTUM-TRAVIS-DOMAIN
quantum_built_baseline: "10.73"
authority_granted: false
scope: user_requested
---

# Public Road Intelligence — fontes reais

## Quando usar
O utilizador pede trânsito real, congestionamento, acidentes, condicionamentos, velocidades medidas, tráfego rodoviário ou eventos em estradas.

## Implementação
- O Travis usa a ponte `window.TravisRoadLive` apenas quando o utilizador abre o painel ou pede trânsito por voz, e consulta o gateway privado `http://127.0.0.1:4187/api/road-live/...`.
- `porto` e `lisboa`: ocorrências **registadas** pelo agregador Trânsito Agora, com campo `originalProvider` visível (CMP, CMM, ProCiv, etc.). Não têm velocidades medidas e os registos devem ser classificados como reportes, não uma imagem directa da circulação actual.
- **A API agregadora passará a exigir chave em 14-10-2026; o módulo desactiva automaticamente pedidos keyless nessa data.** Não esconder o fim da disponibilidade, nem pedir credenciais sem autorização. Limite de 20 pedidos/hora/IP anónimos, cache local de 18 minutos por distrito.
- `london`: perturbações rodoviárias publicadas por TfL, sem medição de velocidade.
- `finland`: medições de velocidade média 5-minutos de postos Fintraffic com hora e local real; não são posições de automóveis.
- `nyc`: NYC DOT velocidades em troços apenas quando as observações têm menos de 30 minutos na hora local; se estiverem velhas, não mostrar como actuais.

## Evidência
Estado `GET /api/road-live/status`, resultados tipificados e timestamps da fonte, validação HTTP200 e testes `travis-road-live.test.mjs`, `travis-road-portugal.test.mjs`, `travis-road-live-ui.test.mjs`. A API pode devolver 0 medições recentes e isso é um resultado válido, não uma falha a mascarar.

## Limites explícitos
- A camada de automóveis móveis nativa de God's Eye View é **simulada** e não deve ser descrita como tráfego de veículos reais.
- Ninguém pode inferir que a ausência de ocorrências reportadas significa estrada sem trânsito.
- Não aceder a CCTV do Município do Porto restrito ao Centro de Gestão Integrada, nem tentar contornar autenticação.
- Não gravar ou monitorizar tráfego continuamente; apenas pedidos visíveis, com caches.
- Sem direitos extra: `CAPABILITY != AUTHORITY`. Skills são conhecimento operacional, não tokens nem permissões.

## Comandos de exemplo
- «Travis, mostra trânsito real no Porto».
- «Travis, há condicionamentos em Lisboa?».
- «Show real road disruptions in London».
- «Travis, mostra velocidades medidas na Finlândia».
- «Travis, qual a situação do tráfego em Nova Iorque?»
