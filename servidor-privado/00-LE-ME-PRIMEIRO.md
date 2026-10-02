# Servidor Privado — Centro de Negócios

Esta pasta documenta, por ordem, a construção da estação privada no telemóvel.

## Objectivo

Criar um núcleo local, barato e controlado para ligar:

Telegram → Cloudflare → Centro Agent → Centro Server → ferramentas locais

O servidor privado fica em:

`http://127.0.0.1:8765`

Não fica directamente exposto à Internet.

## Regra principal

**Local primeiro. Gratuito sempre que possível. Pago nunca sem autorização.**

Variável de arquitectura:

`PAID_FALLBACK=false`

## Ordem de leitura

1. `01-HISTORICO.md`
2. `02-ARQUITETURA.md`
3. `03-INSTALACAO.md`
4. `04-COMANDOS.md`
5. `05-SEGURANCA.md`
6. `06-ESTADO-ATUAL.md`
7. `07-ROADMAP.md`
8. `08-FICHEIROS-E-ENDPOINTS.md`

## Código executável actual

O código que realmente corre continua em:

`operit-agent/`

Esta pasta é a documentação central para não perdermos o fio à arquitectura nem às decisões.
