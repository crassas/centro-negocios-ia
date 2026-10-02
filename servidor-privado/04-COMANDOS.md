# 04 — Comandos

## Centro Station

```sh
centrostation start
centrostation stop
centrostation restart
centrostation status
centrostation doctor
centrostation logs
```

## Centro Server

```sh
centroserver start
centroserver stop
centroserver restart
centroserver status
centroserver logs
centroserver token
```

## Centro Agent

```sh
centroctl start
centroctl stop
centroctl restart
centroctl status
centroctl logs
```

## Telegram

### Estado da estação

`/station`

### Diagnóstico

`/doctor`

### Estado do servidor privado

`/server`

### Informação do sistema

`/operit system`

### Verificação dos sites

`/operit sites`

### Git status

`/operit git-status centro`

`/operit git-status pentehouse`

`/operit git-status pizza`

`/operit git-status doisirmaos`

### Git pull

`/operit git-pull centro`

### Claude Code

`/claude <pedido>`

Exemplo:

`/claude responde apenas: Claude Code ligado ao Telegram.`

Com projecto:

`/claude @pentehouse analisa este projecto`

Aliases actuais:
- `centro`
- `pentehouse`
- `pizza`
- `kebab`
- `doisirmaos`
- `2irmaos`
