# Travis / God's Eye View — planeta preto no Chrome Android

## Evidência no dispositivo (10-10-2026)

- Interface de `127.0.0.1:8770/?travis=1` incorpora `127.0.0.1:4173/?embed=1`; o globo 3D, atmosfera e etiquetas CCTV aparecem, mas a superfície global está preta na captura do operador.
- A mesma aplicação God's Eye View mostrou imagens Esri numa vista próxima de cidade na captura anterior. A falha aparece na vista completa da Terra.
- Em verificação local, a aplicação e o Centro responderam com HTTP 200; Esri metadata e tile nível 0 responderam HTTP 200, OSM e terreno Re:Earth também. Isto não prova que o Chrome tenha recebido os mosaicos.
- O ambiente é Android/Chrome no telemóvel, Ubuntu/PRoot, Node 24 e CesiumJS. O acesso remoto ao dispositivo ficou intermitente durante o diagnóstico; não há alteração ao renderizador confirmada nesta fase.

## Defeito conhecido no CesiumJS

- [CesiumGS/cesium #12936 — Imagery disappears when zooming out on mobile devices - Chrome on Android](https://github.com/CesiumGS/cesium/issues/12936), reportado em 2025-09-30; permanece aberto à data da verificação.
- [Cesium Community — Imagery disappears when zooming out on mobile devices](https://community.cesium.com/t/imagery-disappears-when-zooming-out-on-mobile-devices/43485).
- No relato reproduzível, as texturas ficam pretas quando a câmara se afasta no Chrome Android, mesmo usando OSM ou outros fornecedores. As imagens voltam a aparecer ao aproximar; mosaicos Google Photorealistic 3D são diferentes, mas exigem credenciais.
- Isto é uma hipótese forte para a captura do Travis, não prova definitiva sem teste de aproximação no dispositivo.

## Teste discriminativo

1. Dentro do Travis, escolher PORTO (reduz a altitude do globo de 18 000 000 m para 42 000 m).
2. Confirmar visualmente se a cartografia aparece sobre a cidade.
3. Regressar a EARTH: se desaparecer, é compatível com a falha de imagem em vista distante. Caso permaneça preta em Porto, inspeccionar consola WebGL e política CSP/rede, sem partir da hipótese de zoom.
4. Testar a mesma vista no God's Eye View directo em `http://127.0.0.1:4173/`.

## Arquitectura de possível correcção

- **Vista global**: usar esfera 3D texturizada como primitiva/modelo, não outra camada `ImageryProvider` (o defeito relatado também ocorre no OSM). A textura terrestre já existente no Travis provém das amostras de planetas Three.js; deve ser identificada como referência estática, não vídeo nem imagens satélite em directo.
- **Vista regional/cidade**: regressar aos mosaicos Esri e ao terreno oficial, mantendo os feeds públicos GEV.
- Fazer comutação progressiva com histerese e testes em Android real. A mudança não deve impedir a voz PT/EN nem os comandos de camadas.
- Não desactivar cabeçalhos de segurança nem inventar chaves de API; preservar o fallback para o globo nativo.

## Correcção aplicada localmente (10-10-2026)

A aplicação usa agora o módulo `travis-gev-far-earth.mjs`, instalado no checkout oficial como `src/app/travisFarEarth.js` pelo instalador reversível `scripts/travis-gev-far-earth-apply.py`.

- Apenas em Chrome/Android e documento `?embed=1`, quando a altitude excede **8 000 km**, apresenta uma esfera WGS84 texturizada com a imagem terrestre local já existente no Travis (`earth-day-2048.jpg`). Não usa `ImageryProvider`, evitando a categoria de falha de mosaicos de #12936.
- Ao aproximar para menos de **6 600 km**, restitui o globo oficial Cesium com imagens Esri/OSM e terreno. Há histerese para evitar comutação contínua.
- A esfera usa a cena WebGL existente, sem nova conta ou API, e a textura é identificada como **referência estática**, não satélite em directo.
- O instalador verifica o commit upstream `591f299`, cria cópia de segurança de `src/app/scene.js`, guarda manifesto com checksums e suporta `rollback`.

Comandos de instalação e reversão, no próprio equipamento após copiar os dois ficheiros da ramificação de trabalho:

```sh
python3 /root/.centro-extensions/travis-gev-far-earth-apply.py status
python3 /root/.centro-extensions/travis-gev-far-earth-apply.py rollback
```

**Provas verificadas:** `node --check` dos dois módulos; o Vite serve `src/app/scene.js` e `src/app/travisFarEarth.js` com HTTP 200 e a textura JPEG de 512 606 bytes com HTTP 200. O Cesium gerou uma geometria de elipsóide WGS84 texturizada com 8 777 vértices e 16 384 triângulos. Os serviços Travis 8770 e GEV 4173 conservaram HTTP 200.

**Por confirmar:** aspecto e alinhamento geográfico exactos da nova esfera no Chrome real, alternância de altitude e latência com todas as camadas. Pedir captura visual depois de actualizar o Travis no telemóvel. Não declarar validação gráfica completa antes dela.
