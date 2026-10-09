# Travis — visão local ligada ao diálogo

A câmara já estava disponível no navegador e o MediaPipe reconhecia posições de rosto e alguns gestos. Contudo, essas observações não chegavam ao diálogo: daí a resposta genérica de que «um LLM não vê».

## Novo funcionamento

A câmara continua a precisar da autorização explícita do utilizador. Quando se faz um pedido ao Travis pela voz ou pelo campo de texto, o navegador anexa somente um pequeno resumo actual de detecção: câmara activa/desligada, contagem de fotogramas analisados, presença de rosto e nome do gesto reconhecido. **Não são enviadas imagens ou vídeo.** A observação é validada por tipo e antiguidade, usada apenas naquele pedido e não guardada em memória.

Perguntas sobre a percepção da câmara têm uma resposta directa, que distingue detecção de rostos/gestos de compreensão completa de cenas. O modelo de linguagem não recebe a imagem, não identifica pessoas e não pode descrever objectos com o detector actual. O relatório de capacidades passa a reconhecer correctamente que existe detecção local autorizada.

## Testes

Executar `PYTHONPATH=operit-agent python3 operit-agent/jarvis_selftest.py` e `node --check travis-3d.mjs`. O teste de integração abrange mensagens de voz e texto através do mesmo endpoint, observações novas/antigas, câmara desligada, dados de imagem não permitidos e origem recusada.

## Produção

Esta PR é uma versão preparada. Deve ser aplicada na instalação Ubuntu do telemóvel apenas depois de criar cópias de segurança dos ficheiros actuais. Reiniciar de forma controlada o servidor da porta 8770, sem afectar o Centro de Negócios na porta 8765. Confirmar um pedido de voz real com a câmara ligada, que detecte efectivamente um rosto, antes de anunciar a activação completa.

O snapshot GitHub não contém necessariamente todos os modelos MediaPipe e ficheiros locais usados pela aplicação Android. Não fundir automaticamente com a main sem resolver as diferenças locais.