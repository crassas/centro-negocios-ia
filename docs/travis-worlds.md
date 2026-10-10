# Travis: espaço e construção de cenas

A versão `worlds-1` retira a cortina, os anéis e os reflexos dourados do fundo. O rosto mantém o seu material. Um campo de estrelas com profundidade acompanha as projeções astronómicas; nas restantes cenas, a luz do fundo diminui.

## Pedidos que funcionam

- «Mostra um meteorito a passar perto da Terra» — rocha irregular com rotação, Terra, atmosfera e trajetória de aproximação/passagem/afastamento.
- «Adiciona a Lua» / «Retira a Lua» — edita a composição atual, sem reiniciar o relógio da animação.
- «Isola o meteorito» / «Mostra tudo» — destaca um objeto e recupera o conjunto, sem recriar a viagem.
- «Constrói a Terra com a Lua e um satélite» — objetos independentes, órbitas e rotações.
- «Constrói uma casa com uma árvore e chuva» — arquitetura, vegetação e chuva procedural na mesma cena.
- «Pausa a animação», «Continua a animação», «Mais devagar» — controlos partilhados com as restantes projeções.
- «Volta ao Travis» — dissolução para o rosto.

O construtor reconhece 29 tipos: dez corpos celestes, meteoroide, cometa, satélite, foguetão, casa, árvore, montanha, motor, ADN, hidrogénio, chuva, neve, nuvens, fogo, oceano, aurora e três sólidos geométricos. Combina até oito objetos. Continua a existir pesquisa de modelos externos para pedidos individuais sem representação local; não há geração universal de malhas a partir de qualquer descrição.

## Implementação e limites

`travis-scene-blueprint.mjs` interpreta pedidos PT/EN e valida planos de dados. Aceita apenas tipos, posições e escalas limitados. Não executa código produzido por modelos nem URLs incluídos num plano. A composição usa as mesmas superfícies, partículas e mecanismo de transição do rosto. Geometria e texturas ficam prontas à entrada; a animação altera transformações, uniformes e o comprimento visível da trajetória.

As dimensões, órbitas, velocidades e trajetos são ilustrações. Não calculam efemérides, impactos ou uma missão real. Um meteoroide que passa no espaço não recebe uma chama atmosférica. A animação de passagem só regressa automaticamente ao rosto depois do trajeto; pausa e isolamento mantêm a cena aberta. O modo de movimento reduzido deixa os objetos imóveis.

A pesquisa de imagens/modelos e os seus créditos mantêm o comportamento anterior. Nenhuma dependência ou serviço pago novo foi acrescentado.

## Verificação

- `scripts/travis-worlds-selftest.mjs THREE_MODULE`: plano, limites, pedidos literais/privados, objetos desconhecidos, edição, afastamento da trajetória, profundidade geométrica real, isolamento e estabilidade dos buffers.
- `scripts/travis-worlds-browser-selftest.mjs PLAYWRIGHT CHROMIUM THREE_DIRECTORY OUTPUT_DIRECTORY`: interface completa em 390×844 e desktop; animação, pausa, isolamento, edição, regresso ao rosto, controlos sem sobreposição e movimento reduzido.
- O teste do navegador usa respostas de voz simuladas, não mede reprodução física no telemóvel.
- `scripts/travis-client-sync-selftest.py`: pacote completo, repetição sem alterações e preservação da instalação perante um ficheiro inválido.
