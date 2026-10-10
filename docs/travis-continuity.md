# Conversa que continua

A versão `continuity-1` mantém o holograma e a biblioteca 3D. Corrige a ligação
entre histórico, contexto, saudações e reprodução de voz.

- A identidade da conversa fica no armazenamento persistente do navegador.
  O identificador da aba anterior é conservado na primeira atualização.
- O histórico recente deixa de expirar ao fim de 24 horas. Um índice local
  recupera pedidos antigos relevantes; respostas anteriores são contexto,
  nunca prova de execução ou factos pessoais confirmados.
- «Chama-me Alex», «Call me Alex», «Lembra-te que…», «Remember that…» e
  preferências explícitas têm um registo próprio. Uma correção de nome arquiva
  a anterior. O uso reforça a relevância, sem eliminar recordações automaticamente.
- A saudação usa o idioma, tópicos anteriores, nome explicitamente indicado e
  saudações recentes. Há um prazo de 3,5 segundos para a geração; se o modelo
  falhar, uma alternativa breve evita repetir as quatro anteriores. Reabrir em
  menos de 90 segundos não produz nova saudação.
- O início de atividade no microfone já não basta para interromper a voz em
  reprodução. A transcrição confirma uma nova intervenção e rejeita eco do
  próprio texto. «Stop», «espera» e «para» têm prioridade. Isto troca uma pequena
  espera pela confirmação da fala por menos interrupções falsas.
- Se a transmissão falhar, o áudio recebido termina e surge uma indicação de
  resposta incompleta. O pedido não é executado novamente. Uma geração textual
  incompleta fica identificada no contexto para um pedido posterior de continuação.
- Dez fichas originais bilingues ampliam a base de ciência, filosofia,
  espiritualidade e comunicação. Incluem NASA, USGS, NHGRI, Epicteto, Laozi e
  William James. Complementam o conhecimento do modelo e a pesquisa web existente;
  não representam «todo o conhecimento» nem alteram os pesos do modelo.

## Histórico do telemóvel

`Continuity.import_personal_sessions(owner, sessions)` permite uma migração local
explícita do histórico pessoal existente, sem alterar as linhas originais.
Não existe uma operação web para ligar sessões arbitrárias. O ficheiro local
`.centro-jarvis/personal-session` permite ao navegador local recuperar esse âmbito
através de `/continuity` ou `/resume`. Outras origens não recebem essa substituição.
Não usar esta migração num dispositivo partilhado com históricos de várias pessoas.

## Validação

```sh
python3 operit-agent/travis_continuity_selftest.py
python3 operit-agent/travis_stream_selftest.py
python3 operit-agent/jarvis_selftest.py
python3 operit-agent/travis_library_selftest.py
node scripts/travis-continuity-selftest.mjs
node scripts/travis-stream-selftest.mjs
```

O ensaio `travis-live-voice-browser-selftest.mjs` testa áudio antes do fim da
resposta, rejeição de eco, interrupção confirmada, cancelamento da fila antiga e
conservação do áudio após falha de rede. Usa áudio e transcrições sintéticos;
o microfone, altifalante e cancelamento de eco do OPPO exigem uso no aparelho.

Memória persistente e reflexão registada são capacidades de software. Não
demonstram consciência, neurónios biológicos ou experiências espirituais próprias.
