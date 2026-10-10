# Travis: núcleo contínuo, versão 2

O Travis mantém um ciclo operacional: observar → recuperar contexto → agir →
verificar → guardar experiência. Esta versão liga a conversa, as cenas locais
do holograma e o estado de entrega da voz. Reutiliza o supervisor, a memória
episódica e o ciclo de reflexão existentes; não cria outro agente isolado.

## O que muda

- As ações visuais locais entram na memória da sessão, mesmo quando dispensam
  o modelo de linguagem. “Mostra um avião” passa a deixar contexto para
  “Porque é que as asas têm esta forma?”. Os capítulos de uma viagem também
  deixam observações. O estado atual do ecrã acompanha o pedido seguinte.
- Os registos incluem origem e estado. Uma descrição do navegador não comprova
  uma ação no mundo real. Uma cena antiga não se apresenta como observação ao vivo.
- As correções explícitas de significado persistem: “Quando digo plane,
  refiro-me a um avião” ou “When I say plane, I mean an aircraft”. Uma nova
  definição substitui a definição ativa anterior, sem apagar o registo antigo.
- Os pedidos têm identificadores e estados: em processamento, resposta gerada,
  entrega interrompida ou reprodução concluída segundo o navegador. O contexto
  permite pedir “continua” após uma falha. Não repete automaticamente ferramentas.
- O orçamento do contexto preserva registos completos, o pedido atual e as
  referências recentes; deixa de cortar JSON a meio de um registo.
- A receção do texto e a preparação de áudio usam uma fila limitada e ordenada.
  A síntese de uma frase deixa de bloquear a receção de cada fragmento do modelo.
- Pedidos de voz abandonados deixam de ocupar a fila até ao prazo de espera.
  O reconhecedor adicional Sherpa só recebe fragmentos se `TRAVIS_LIVE_STT=1`
  estiver configurado no servidor e anunciado no estado de saúde. O caminho
  Whisper existente continua disponível. Uma fila live lenta recua para esse
  caminho, sem acumular fragmentos indefinidamente.

## Continuidade e aprendizagem

O ciclo existente de `BrainRuntime` mantém um heartbeat a cada 10 segundos.
A consolidação e reflexão respeitam pausa, atividade do utilizador, memória,
disco, intervalo e limite diário. Resultados verificáveis e avaliações explícitas
ajustam a utilidade das experiências pela regra já existente
`q ← q + 0,2 × (recompensa − q)`. Uma hipótese do modelo não se torna um facto
só porque o modelo a repetiu. As correções desta versão mudam o contexto
recuperado; não retreinam os pesos do modelo.

`POST /continuity` inclui contagens por estado, restritas à sessão.
`POST /interaction` recebe observações locais idempotentes e confirmações de
entrega. Nenhum destes eventos concede autorização para executar ferramentas.
Os dados acrescentam tabelas à base existente; preservam as conversas anteriores.

## Verificação

- `python3 operit-agent/travis_continuity_selftest.py`: persistência, isolamento,
  deduplicação, correções, contexto visual, estados e orçamento do prompt.
- `python3 operit-agent/jarvis_selftest.py`: encaminhamento, permissões,
  aprendizagem existente e cancelamento do reconhecimento.
- `python3 operit-agent/travis_stream_selftest.py`: receção de texto durante
  síntese, ordem, limites, falhas e cancelamento sem repetição.
- `node scripts/travis-live-stt-selftest.mjs`: fila de fragmentos limitada.
- `scripts/travis-live-voice-browser-selftest.mjs`: conversa no navegador,
  interrupção, proteção contra eco e passagem da cena para uma pergunta seguinte.

## Limites reais

Não é um organismo nem uma demonstração de consciência. Não possui toda a
sabedoria, não modifica o próprio código autonomamente e não controla veículos.
A execução contínua depende do dispositivo, do supervisor e das permissões do
Android. A voz física, os ruídos e o comportamento com o ecrã bloqueado exigem
ensaios no aparelho. A geração de texto mantém o fornecedor já configurado;
esta alteração não ativa um serviço pago nem treina um novo modelo de base.

## Referências públicas estudadas

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762): arquitetura Transformer.
- [Generative Agents](https://arxiv.org/abs/2304.03442): memória, recuperação e reflexão.
- [ReAct](https://arxiv.org/abs/2210.03629): coordenação entre raciocínio, ações e observações.

Estas referências inspiram a organização funcional. O código não reproduz os
internos privados de outro assistente nem implementa integralmente esses artigos.
