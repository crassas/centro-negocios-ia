# Travis — God's Eye View sem chaves (17 camadas)

## Estado e limites

Preparação para o serviço geoespacial oficial:
https://github.com/bilawalsidhu/gods-eye-view

O Travis tem actualmente um globo 3D leve próprio. Esta integração **não o substitui**, não modifica as rotinas de voz nem reinicia Centro Server/Agent/Station. O motor oficial corre à parte, em `127.0.0.1:4173`, e só será ligado visualmente ao Travis após teste no equipamento Android.

O servidor oficial envia `X-Frame-Options: DENY` e `frame-ancestors 'none'`. Assim, o antigo protótipo `travis-world.mjs`, que usa `iframe`, **não é uma solução de incorporação válida** sem um trabalho específico de integração com o projecto upstream. Não remover estas protecções apenas para o fazer aparecer dentro da página.

## Instalação isolada no Ubuntu/Proot (aarch64)

Pré-requisitos: Git, npm, Node.js **24.14+ da linha 24 ou Node 26**, cerca de 1 GB ou mais de espaço livre, Internet, navegador com WebGL. No telefone, o navegador Android utiliza a mesma interface de loopback.

No terminal, a partir da pasta deste repositório:

```bash
bash scripts/travis-gev-keyless.sh install
bash scripts/travis-gev-keyless.sh start
bash scripts/travis-gev-keyless.sh status
```

Abrir no mesmo dispositivo: **http://127.0.0.1:4173/**.

O instalador fixa o commit upstream `591f299d11f38a612629a274463196d57ae3862e` (10-10-2026), faz `npm ci` usando o lockfile, desactiva o download automático de Chromium via Puppeteer e executa o `doctor`. Não cria ficheiro `.env` nem aceita chaves herdadas das variáveis de ambiente relevantes. O código fica em `~/travis-gev-keyless`; os registos em `~/.local/state/travis-gev/app.log`.

O arranque usa `setsid` e o processo Node/Vite directamente, de forma independente da sessão Remote Desktop Commander ou do terminal que emitiu o comando. É idempotente quando a instância existente responde: não encerra processos e recusa ocupar uma porta 4173 já utilizada. Liga apenas ao endereço local, nunca à rede pública. **Após reiniciar o Android ou a sessão Ubuntu/Proot, executar novamente `bash scripts/travis-gev-keyless.sh start`.** Não cria serviço de arranque automático — primeiro confirmar estabilidade e consumo de memória.

### Recuperação automática após queda do serviço

A extensão opcional `scripts/travis-gev-watch.py` foi instalada em `/root/.centro-extensions/travis_gev_watch.py`. O watcher já existente `/root/.centro-extensions/travis-world-watch.py` importa `ensure_keyless_sidecar` e chama-a antes de verificar as reparações CCTV. Não é criado outro supervisor permanente.

A recuperação fica **desactivada por defeito** até existir `/root/.centro-extensions/travis-gev-keyless.enabled`. Sem este ficheiro, o watcher não inicia o Cesium. Com o ficheiro presente, verifica o HTML local a cada 25 segundos (aproximadamente) e, se necessário, pede novo arranque com pelo menos 1024 MiB de memória disponível. Limita novas tentativas a 110 segundos. Se a porta 4173 estiver ocupada por outro serviço, não termina nem substitui esse processo.

O estado pode ser consultado em `/root/.local/state/travis-gev/watch-status.json`, e o registo de arranques em `/root/.local/state/travis-gev/watch.log`. Para impedir futuros arranques automáticos, remover apenas o ficheiro de activação; isso não termina nenhum serviço em curso.

**Teste real de recuperação (10-10-2026):** paragem controlada do processo Vite com PID verificado; o watcher pediu novo arranque, a aplicação voltou a responder com HTTP 200, e o gateway CCTV manteve HTTP 200. Não foi executado um ensaio de reinício completo do Android/PRoot.

### MCP para Claude e Codex (opcional, após o teste HTTP)

```bash
bash scripts/travis-gev-keyless.sh mcp
```

Compila o painel MCP e regista `gods-eye-view` nos clientes disponíveis, se ainda não estiver registado. O Travis não ganha comandos de voz automaticamente com este passo: a aplicação tem o seu próprio controlador de voz e a ligação bidireccional aos comandos do Travis é uma fase distinta.

## 17 caminhos sem chave de API

1. Map Stack: Esri/OSM e terreno básico, não Google 3D fotorrealista.
2. Live Flights: OpenSky/adsb.lol, com limites sem autenticação.
3. Military Flights: dados públicos ADS-B.
4. Satellites: catálogo CelesTrak.
5. Earthquakes: USGS.
6. Traffic: veículos **simulados** sobre estradas OSM; velocidades TomTom reais exigem chave.
7. CCTV Mesh: catálogo de câmaras públicas; algumas são imagens, não vídeo contínuo.
8. Mapped ALPR Cameras: apenas localização, sem matrículas nem imagens de leitura.
9. Radio: estações do Radio Browser.
10. Transit: fontes públicas GTFS-RT onde disponíveis.
11. Bikeshare: disponibilidade GBFS.
12. Directions: OSRM público.
13. Space Missions: Launch Library 2, com limites de acesso.
14. Mapped Installations: dados incompletos de OpenStreetMap.
15. Wind: previsão GFS/ECMWF.
16. Observed Weather: radar, satélite meteorológico e densidade de relâmpagos nos territórios cobertos.
17. Cyclones: NHC/CPHC.

**Não incluídos sem chave:** Live Vessels (AISStream), Street Level (Mapillary) e Active Fires (NASA FIRMS). Isto é **disponibilidade de funcionalidades**, não uma garantia de que todas as fontes externas respondam sempre. As camadas devem ser activadas gradualmente no menu **Data Layers**, devido à carga de GPU/memória num telemóvel.

## Verificação antes de associar ao Travis

- `status` apresenta HTTP OK e o navegador mostra o globo Esri sem credenciais.
- Escolher *Explore Manually* e ligar separadamente Flights, Satellites, Earthquakes e CCTV.
- Confirmar no ecrã que os dados carregam e os controlos funcionam; não deduzir isto apenas de HTTP 200.
- Medir a estabilidade quando o Centro Server (porta 8765) e o serviço GEV (4173) estão activos.
- Verificar que o Travis anterior abre, fala e fecha normalmente, sem que o globo fique sempre activo.
- Só depois decidir como apresentar o globo oficial com transições cinematográficas sem contornar a política de segurança do upstream.

Fontes: [README oficial](https://github.com/bilawalsidhu/gods-eye-view#-whats-on-the-globe),
[MCP_SETUP](https://github.com/bilawalsidhu/gods-eye-view/blob/main/docs/MCP_SETUP.md),
[SECURITY](https://github.com/bilawalsidhu/gods-eye-view/blob/main/SECURITY.md).
