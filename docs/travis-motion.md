# Travis Motion

Adaptação do [claude-motion](https://github.com/whaleyxbt/claude-motion), revisão `e627941543d9988b155dc610bb9cc0115a5e365e`, para o Travis. Licença MIT preservada em `vendor/claude-motion/LICENSE`.

## Dentro do Travis

- Mesma identidade dourada, rosto, câmara e voz. A nuvem sai da geometria visível e regressa ao rosto; uma interrupção começa na posição atual das partículas.
- Movimento: entrada de 1,18 s, regresso de 0,70 s, controlos de 0,38 s. Legendas com máscara e palavras escalonadas, sem animação quando o sistema pede movimento reduzido.
- Modelo didático de motor elétrico: eixo/rotor, estator/bobinas, rolamentos e ventoinha. Corte aberto e peças separadas, com apenas três chamadas de desenho para todas as superfícies. Não representa um modelo comercial nem medidas de engenharia.
- Sons curtos sintetizados no contexto de áudio já autorizado. Não criam microfone nem desbloqueiam áudio. Respeitam pausa, escuta, movimento reduzido e preferência persistente de som. Sem música contínua e sem serviço pago.
- O Estúdio visual surge no menu de capacidades e em `tools/travis-motion/studio.html`. A sequência pública usa os modelos do Travis; não grava conversas nem imagens da câmara.

Comandos PT/EN:

| Pedido | Resultado |
| --- | --- |
| Mostra um motor elétrico / Show an electric motor | Modelo em corte |
| Separa as peças / Separate the parts | Vista com conjuntos separados |
| Junta as peças / Assemble | Montagem do mesmo modelo |
| Roda, aproxima, afasta | Controlos já existentes |
| Explica-me o motor elétrico | Explicação pela conversa, com ilustração |
| Desliga os sons / Disable motion sounds | Silencia os novos efeitos, mantém a voz |
| Liga os sons / Enable motion sounds | Repõe os efeitos |
| Volta ao Travis | Regresso ao rosto |

Pedidos de motores específicos continuam a pedir referências, em vez de fingirem que o modelo genérico é esse produto. Separar peças só se aplica ao motor didático; não inventa peças de fotografias.

## Os quatro guias adaptados

1. **Motion design** — `travis-motion.mjs` centraliza durações, curva de entrada, paleta, leitura e legendas. A interpolação das partículas conserva a mesma curva na CPU e no shader. O rosto e o objeto sobrepõem-se durante a passagem; nunca há um corte para uma cena vazia.
2. **Review loop** — `review.mjs` extrai do MP4 codificado um fotograma a meio da transição e outro estabilizado para cada momento nomeado. Gera folha de contacto, lista de tempos e forma de onda. Rever dimensão no telemóvel, recortes, leitura e regresso ao rosto antes de aprovar uma nova sequência.
3. **Sound design** — efeitos leves via Web Audio para a conversa; `sounds.py` usa os geradores Python originais para a exportação. Semente fixa, silêncio entre ações, volume discreto e margem de pico. Sem elevar efeitos esparsos ao volume de música.
4. **Web sims** — `studio.mjs` usa os materiais, objetos e partículas do Travis. `render(t)` aceita saltos para trás e para a frente; os limites dos eventos são avaliados no tempo exato. A captura verifica que duas visitas ao mesmo instante produzem pixels iguais.

O ficheiro `tools/travis-motion/timeline.json` é a fonte comum dos momentos da cena, efeitos e revisão. Alterar nomes, assuntos e tempos aí; não replicar tempos em scripts. Campos: `name`, `at`, `label`, `scene`/`subject`, `control` ou `action`, e `sound`. A duração máxima aceite pelo exportador é 120 s.

## Exportar vídeo

No computador de renderização, com Node 22+, Python 3 e FFmpeg/ffprobe:

```sh
cd tools/travis-motion
npm install --ignore-scripts --no-audit --no-fund
npx playwright install chromium
node capture.mjs --out out/travis.mp4 --width 1080 --height 1920 --fps 30
```

Suporta 12, 24, 25, 30 ou 60 fps. A velocidade da animação mantém-se igual. Para rever um vídeo já exportado:

```sh
node review.mjs --video out/travis.mp4 --timeline timeline.json
```

Saídas: MP4 com som, JSON com contagem de fotogramas e diagnóstico, folha de contacto JPG, forma de onda PNG e JSON dos tempos revistos. Um destino já existente não é substituído. Os ficheiros temporários pertencem a uma pasta exclusiva e só essa pasta é apagada no fim.

Em ambientes com dependências já instaladas, definir `TRAVIS_PLAYWRIGHT` (caminho do módulo), `TRAVIS_THREE_DIR` e `TRAVIS_CHROMIUM`. O exportador serve tudo localmente e bloqueia pedidos HTTPS durante a captura. A pré-visualização web usa a versão Three 0.180.0 já adotada pelo Travis.

A exportação é uma ferramenta do projeto, não um comando de voz que já produza vídeos no telemóvel. O processo pesado de captura fica fora da conversa e não faz parte do ciclo de animação da aplicação.

## Proveniência

`tools/travis-motion/vendor/synth.py` conserva os geradores de `claude-motion/sfx/synth.py`. O gerador pseudoaleatório vem de `sims/kit/util.js`; os restantes módulos são adaptações novas dos quatro fluxos de trabalho e da vista com peças separadas. Não foram copiados os anúncios, marcas, dossiers fictícios ou media de demonstração. O Travis não precisa de Remotion/React para o seu renderizador Three existente.
