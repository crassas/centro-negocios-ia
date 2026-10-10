# Travis: figuras de referência (`figures-1`)

Corrige os pedidos «Pessoa», «Corpo humano» e «Astronaut». O desenho antigo com cabeça esférica, tronco cilíndrico e membros em linhas foi removido. Pedidos diretos, interpretação pelo modelo de linguagem e ilustrações devolvidas pelas ferramentas passam pelo mesmo carregamento de referências.

## Conteúdo

- «Mostra uma pessoa»: superfície humana BodyParts3D, FMA7163, 60 000 triângulos. Modelo anatómico adulto de referência; não representa uma pessoa identificada.
- «Corpo humano»: os 21 grupos de anatomia interna existentes, com ossos e órgãos individualizáveis.
- «Esqueleto»: os 13 grupos de ossos existentes, sem substituir a malha por um boneco.
- «Mostra um astronauta»: traje pressurizado ACES, NASA/Michael D. Carbajal, 88 872 triângulos e cores de material. É um traje de lançamento e regresso; não é um traje EVA.

O conteúdo conserva profundidade, normais, rotação lenta, zoom, transição de partículas e regresso ao rosto. As poses das duas novas figuras são estáticas: não há animação de caminhada nem geração universal de pessoas. Um nome próprio ou uma descrição não suportada não recebe uma figura genérica com identidade falsa.

Os ficheiros são locais e limitados a 450 000 bytes por parte. O carregamento usa três pedidos em paralelo, cache e cancelamento. Respostas atrasadas não substituem a cena mais recente. Os créditos permanecem no painel «Fontes» e nos ficheiros de atribuição, sem cobrir a projeção.

Pedidos 3D sem modelo correspondente deixam de apresentar automaticamente uma fotografia. Fotografias explicitamente pedidas mantêm o seu fluxo; a extração de «fotografias» também foi corrigida para não pesquisar a palavra truncada «grafias».

## Verificação

- `scripts/travis-figures-selftest.mjs THREE_MODULE`: aliases PT/EN, pedidos literais/fotográficos, exclusão de identidades específicas, malhas reais, profundidade, normais, cache, cancelamento e limites de ficheiro.
- `scripts/travis-figures-browser-selftest.mjs PLAYWRIGHT CHROMIUM THREE_DIRECTORY OUTPUT_DIRECTORY`: interface completa móvel, figuras, zoom, rotação, resultado de ferramenta, interpretação semântica, pedido escrito pelo fluxo de voz, resposta atrasada, ausência de substituição por fotografia e regresso ao rosto.
- Testes de contexto, continuidade das partículas e sincronização do cliente continuam ativos. A voz do teste de navegador é simulada; não comprova captação ou reprodução física no telemóvel.

Conversão reproduzível: `scripts/prepare_travis_figures.py BODY_PARTS_DIR ACES.glb`. Os SHA-256 dos dois ficheiros originais estão em `assets/travis/figures/manifest.json`. As licenças e alterações constam de `assets/travis/figures/ATTRIBUTION.txt`.
