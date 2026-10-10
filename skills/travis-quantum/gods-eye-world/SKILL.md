---
name: gods-eye-world
description: Controlar o globo oficial Esri/OSM no Travis, por voz PT/EN, com as 17 categorias que têm caminho sem chave.
origin: QUANTUM-TRAVIS-DOMAIN
quantum_built_baseline: "10.73"
authority_granted: false
scope: user_requested
---

# God's Eye View — mundo em 3D
## Quando usar
Perguntas ou comandos explícitos sobre o globo, localizações, voos, satélites, sismos, meteorologia e cartografia.
## Como utilizar
O Travis tem uma ponte local de navegador `window.TravisGevBridge`; responde a comandos em português e inglês. O motor GEV é independente, em `127.0.0.1:4173`, com protocolo oficial `gev:ready`, `gev:view`, `gev:view-applied`. O Travis é aberto em `127.0.0.1:8770/?travis=1`. Só o documento `?embed=1` permite incorporação por origens locais autorizadas.
## Recursos
17 **categorias com caminho sem chave**, não 17 fontes sempre online: cartografia Esri/OSM, voos civis/militares, satélites, sismos, trânsito **simulado**, CCTV, localização ALPR (sem matrículas), rádio, transporte público, bicicletas, rotas, missões espaciais, instalações cartografadas, vento, meteorologia observada e ciclones.
## Verificação
Distinguir: motor HTTP 200, camada configurada, dados recebidos, renderização WebGL real. Nunca afirmar que vê a cena só porque o servidor responde.
## Limites
Navios AIS, Mapillary Street Level e NASA FIRMS exigem credenciais. Algumas áreas não têm câmaras nem dados. Na versão Android existe um fallback de textura estática para a vista planetária, que não é satélite em directo.
