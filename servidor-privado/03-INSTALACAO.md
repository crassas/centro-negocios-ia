# 03 — Instalação e actualização

## Instalação completa

No terminal Linux/Operit:

```sh
curl -fsSL https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent/install.sh | sh
```

Este instalador coloca:

- `~/centro_agent.py`
- `~/centro_server.py`
- `~/centro_station.py`
- `/usr/local/bin/centroctl`
- `/usr/local/bin/centroserver`
- `/usr/local/bin/centrostation`

## Instalação apenas do servidor

```sh
curl -fsSL https://raw.githubusercontent.com/crassas/centro-negocios-ia/main/operit-agent/install_server.sh | sh
```

## Verificar estação

```sh
centrostation status
```

## Diagnóstico

```sh
centrostation doctor
```

## Reiniciar tudo

```sh
centrostation restart
```

## Nota Android / Proot

O supervisor consegue recuperar serviços enquanto o ambiente Linux continua activo.

Se o Android matar completamente o processo do Operit/Proot ou o telemóvel reiniciar, será necessário um mecanismo de auto-arranque adicional.
