# Travis × God's Eye View — selecção automática de câmaras públicas

## Estado

Integrado **no Travis local do Android**, em `http://127.0.0.1:8770/?travis=1` (não na versão pública do site). Não são necessárias novas chaves de API.

A interface God's Eye View tem agora a opção **AUTO CCTV**. Os comandos escritos e a voz do Travis podem procurar e escolher uma câmara pública sem exigir que o operador seleccione manualmente um identificador ou marcador no globo.

Exemplos:

- «Travis, mostra uma câmara em Londres».
- «Show a public camera in Austin».
- «Travis, abre qualquer câmara».
- «Show a live camera in Delaware».
- «Mostra outra câmara».
- «Fecha a câmara».

## Comportamento e limites

- Utiliza exclusivamente identificadores do catálogo de fontes públicas registadas pelo gateway original `God's Eye View`, através de `window.TravisCctv`. Não pesquisa endereços IP, não tenta descobrir URLs, não contorna autenticação nem acede a câmaras privadas.
- Faz uma selecção **a pedido**. Não faz vigilância contínua, gravação oculta ou exploração automática persistente.
- Interpreta a zona geográfica mencionada e ordena candidatos por cidade, proximidade e tipo de fonte. Pedidos globais distribuem os primeiros candidatos por fornecedores, em vez de repetir o mesmo operador indisponível.
- Se pedir vídeo, tenta fontes HLS registadas, mas considera o vídeo reproduzível apenas quando o leitor emitir `playing`. A reprodução não prova a actualidade do sinal. Uma fotografia só é anunciada após a validação `X-CCTV-Source: upstream-image` efectuada pelo leitor existente.
- O processo tenta no máximo três fontes por pedido e não afirma sucesso sem sinal verificado. A vista God's Eye é orientada para as coordenadas da câmara seleccionada e a camada CCTV é activada.
- Caso uma cidade não tenha fontes registadas, comunica isso; não apresenta automaticamente uma câmara de outra cidade. No catálogo observado em 10-10-2026 havia 3 905 câmaras, 434 classificadas como fontes HLS possíveis. Não havia fontes identificadas para o Porto ou Lisboa.
- Pedidos de câmara frontal/traseira do telemóvel continuam na gestão de permissões do dispositivo, nunca no catálogo público.

## Arquitectura

- `travis-cctv-auto-policy.mjs`: interpretação PT-PT/EN e ordenação determinística do catálogo aprovado.
- `travis-cctv-autopilot.mjs`: ponte orientada pelo pedido do utilizador para `TravisCctvPlayer.openCamera(id)` e para `TravisGevBridge`.
- `travis-3d.mjs` local: chama e aguarda `TravisCctvAutopilot.routeCommand` antes do leitor manual existente; conserva a linha original de encaminhamento para não perturbar as verificações de reparação do Travis.
- `scripts/travis-gev-watch.py` na ramificação de integração: restabelece de modo aditivo o script HTML e o ponto de chamada da voz após uma eventual sincronização da interface. Há cópias de segurança locais, incluindo `travis-3d-before-public-camera-auto.mjs`.
- `scripts/travis-cctv-autopilot-selftest.mjs` e `scripts/travis-cctv-browser-selftest.mjs`: testes da política e da selecção através de fontes simuladas.

## Evidência

Em 10-10-2026, os quatro testes de política e selecção passaram no Android (`node --test`). O HTML local carrega o módulo e `travis-3d.mjs` contém uma única ligação de voz; o gateway de CCTV respondeu com HTTP 200 na rota `/healthz`. As 3 905 entradas foram consultadas no catálogo real, mas **não foram verificadas individualmente** e o funcionamento visual da selecção automática no Chrome ainda requer confirmação com um pedido do utilizador.

## Limitações de cobertura

A selecção só abrange feeds públicos distribuídos pelas fontes disponíveis (por exemplo, Londres/TfL, EUA, Finlândia, Estónia, Noruega, Canadá e Austrália). Para incluir outras zonas, é necessário identificar fornecedores públicos com acesso permitido e incorporar os respectivos dados, respeitando os termos desses fornecedores.
