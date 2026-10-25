---
name: public-camera-selection
description: Encontrar automaticamente uma câmara pública registada, confirmar vídeo ou imagem e apresentar no God's Eye sem pedir selecção manual.
origin: QUANTUM-TRAVIS-DOMAIN
quantum_built_baseline: "10.73"
authority_granted: false
scope: user_requested
---

# Selecção de câmaras públicas
## Quando usar
O utilizador pede para ver uma câmara pública numa cidade ou uma câmara aleatória autorizada.
## Percurso
1. A interface do Travis usa `TravisCctvAutopilot.routeCommand` no mesmo fluxo de voz/texto.
2. Pesquisa APENAS os identificadores de `TravisCctv.locations()` e ordena por região, proximidade e tipo de sinal.
3. Tenta até três fontes públicas por pedido, através de `TravisCctvPlayer.openCamera(id)`.
4. Vídeo só é confirmado se o leitor notificar `playing`. Fotografia só é confirmada após o proxy validar `X-CCTV-Source: upstream-image`; pode ser uma imagem periódica, não transmissão contínua.
5. O Globo pode aproximar-se da posição publicada da fonte, mas isso não prova a orientação exacta da câmara.
## Não fazer
Não pesquisar IPs, adivinhar URLs, contornar credenciais, aceder a câmaras privadas, gravar ou vigiar em segundo plano. Uma lista de 3905 fontes observada em 10-Out-2026 não significa 3905 vídeos activos; cobertura limitada por operador e zona.
## Falsificação
Se a fonte estiver indisponível, dizer precisamente que não houve imagem confirmada. Se o Porto não tiver fontes no catálogo, não mostrar Londres fingindo ser Porto.

## Optimização para vídeo público HLS (11-Out-2026)
O botão **LIVE VIDEO** tenta apenas fontes públicas HLS registadas, com espera acrescida para o Chrome Android e uma única recuperação limitada. Não converte câmaras de fotografias em vídeo.
Foi verificado por descarga um manifesto DelDOT e um segmento MPEG-TS com vídeo H.264 a 800×450. **Isto demonstra vídeo real na fonte, mas não prova a reprodução final no Chrome nem garante emissão em directo sem atraso.**
O leitor só deve afirmar «vídeo a reproduzir» depois do evento real `playing`; em pedidos explícitos de vídeo não substituir silenciosamente por uma fotografia. Se só houver imagens periódicas, identificá-las como imagens.
Não aceder a câmaras privadas ou não autorizadas, não procurar IPs nem activar vigilância sem pedido do utilizador.
