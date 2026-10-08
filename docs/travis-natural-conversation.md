# Conversação natural PT / EN

Esta alteração mantém o servidor Python, o Whisper e o Piper existentes. Reutiliza
[Silero via vad-web](https://github.com/ricky0123/vad) para detetar fala no navegador
e o modelo CPU Smart Turn v3.2 distribuído pelo
[Pipecat](https://github.com/pipecat-ai/pipecat) para estimar o fim de uma frase.
O áudio destes componentes permanece no dispositivo. A inferência de respostas
continua a respeitar o modo local/híbrido já configurado.

## Comportamento

- O idioma acompanha o pedido; «fala inglês», «fala português» e «idioma automático»
  alteram a preferência desta conversa, sem afetar outras sessões.
- Fala sustentada pode interromper a resposta. Uma continuação cancela a decisão
  anterior de fim de frase. Se o detetor semântico falhar, existe um limite de espera.
- «Fica em espera» / «go to sleep» mantêm a escuta para «Travis», «Jarvis», «acorda»
  ou «wake up». «Desliga o microfone» / «stop listening» param a captura: é preciso
  reativar o microfone pela interface para voltar a usar voz.
- A iniciativa partilha hipóteses recentes do diário durante pausas, no máximo uma
  por dez minutos e por sessão. «Sem interrupções» desativa-a. Não envia mensagens
  nem executa ações externas por iniciativa própria.
- Explicações sobre órbitas, átomos, redes e ondas podem usar quatro cenas 3D
  esquemáticas. O rosto regressa após a fala; não são simulações científicas.
- A pesquisa web e a leitura de páginas usam os executores existentes. As fontes
  aparecem na projeção. A presença de OpenClaw, Gmail ou outras contas não é tratada
  como prova de acesso funcional.

## Instalação

Depois de atualizar os ficheiros Python e estáticos, executar no dispositivo:

```sh
/usr/bin/python3 operit-agent/install_conversation_voice.py
jarvisctl reload
```

O instalador fixa as versões, verifica a integridade SHA-512 dos pacotes npm e
guarda a proveniência. Os ficheiros binários ficam no dispositivo, fora do Git.
Usar a interface local `http://127.0.0.1:8770` para estes componentes. Uma página
remota sem estes ficheiros usa o capturador anterior como alternativa.

## Verificação e limites

```sh
python operit-agent/jarvis_selftest.py
python operit-agent/test_dialogue.py
node scripts/travis-voice-input-selftest.mjs
node scripts/travis-media-selftest.mjs
node scripts/travis-presence-selftest.mjs
node cloudflare-ai-worker/queue_selftest.mjs
```

As verificações cobrem idioma por sessão, memória da resposta falada, despertar,
iniciativa, cancelamento de áudio, pausas no meio de uma frase e reprodução integrada.
Os ensaios com áudio sintético no OPPO não substituem a validação de microfone,
cancelamento de eco e latência percebida no navegador real.

O reconhecimento ainda processa a frase terminada; não é transcrição incremental.
Um ensaio isolado com Sherpa/Nemotron reconheceu duas amostras em cerca de 1 segundo,
mas perdeu palavras dos comandos. Por esse motivo não substituiu o Whisper.
O navegador exige a autorização inicial do microfone e pode suspender a página
quando o Android a coloca em segundo plano. A iniciativa não contorna essas regras.
