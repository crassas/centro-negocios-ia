# Avião e desambiguação de objetos

O pedido «plane» selecionava o modelo Poly Haven `hand_plane_no4` (Hand Plane No4, 8 220 triângulos). O nome inglês correspondia literalmente, mas o significado era uma ferramenta de carpintaria.

O Travis passa a reconhecer «avião», «airplane», «aeroplane» e o pedido genérico «plane» como uma aeronave. A representação local é um avião de passageiros ilustrativo, com fuselagem volumétrica, perfis de asa com espessura, estabilizadores, dois motores, ventoinhas, janelas e cabine. Usa o material e as transições de partículas existentes; não precisa de uma pesquisa externa. Não representa um fabricante ou modelo certificado.

«Hand plane» e «plaina» mantêm o percurso de pesquisa da ferramenta; «mathematical plane» mantém o significado geométrico. Modelos específicos, como Boeing 747, não são substituídos por este avião genérico. Fotografias e texto literal continuam como pedidos explícitos separados. O construtor de cenas também aceita o objeto Airplane.

A pesquisa de modelos normaliza sinónimos para conceitos distintos. Um título explicitamente incompatível prevalece sobre etiquetas vagas. Assim, um catálogo que só contenha uma plaina não fornece esse objeto para um pedido de avião.

Verificações: `scripts/travis-visual-content-selftest.mjs`, `scripts/travis-visual-research-selftest.py`, `scripts/travis-worlds-selftest.mjs` e `scripts/travis-aircraft-browser-selftest.mjs`. O teste de navegador exercita a interface completa, repetição, português/inglês, zoom, rotação, animação, percurso semântico, resultado de ferramenta e regresso ao rosto. Áudio e backend são respostas de teste; não constitui um teste do microfone físico.
