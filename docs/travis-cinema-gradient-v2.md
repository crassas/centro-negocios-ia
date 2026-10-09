# Travis: camada de profundidade cinematográfica v2

Complementa `travis-cinema.css` sem alterar o núcleo cognitivo. Novos degradês âmbar/cobre sobre preto, aura subtil atrás do rosto, feixe de luz lateral, horizonte e reflexos estáticos, com painéis e controlos mais dimensionais.

**Esta ramificação está preparada para instalação, não está activada no telemóvel.** A actualização exige que o Desktop Commander esteja novamente online. Não é necessário reiniciar nem substituir o backend.

Ficheiros alterados: `index.html`, `sw.js`, novo `travis-cinema-depth.css`. O HTML acrescenta apenas um elemento decorativo com `aria-hidden` e `pointer-events:none` para não interceptar toques no rosto, na câmara ou no envio.

A instalar: confirmar a base actual, guardar os três ficheiros anteriores, copiar os novos para `~/.centro-ui` em substituição atómica, verificar por HTTP e testar voz/câmara/estado/memória. Se algum teste falhar, restaurar as cópias anteriores.

Testar offline: `node scripts/travis-cinema-depth-selftest.mjs`.

Limitação: a renderização em WebGL num ecrã Android real ainda exige verificação visual.