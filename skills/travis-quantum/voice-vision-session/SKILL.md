---
name: voice-vision-session
description: Gerir conversa em português de Portugal e inglês, reconhecimento de voz, síntese e câmara do telemóvel apenas com permissão.
origin: QUANTUM-TRAVIS-DOMAIN
quantum_built_baseline: "10.73"
authority_granted: false
scope: permission_required
---

# Conversa, audição e visão
## Quando usar
Pedem conversa natural PT-PT/inglês, mudança de idioma, câmara, reconhecimento de gestos ou objectos.
## Implementação real
O Travis gere STT e TTS locais, com modelos de voz PT/EN, e fornece interface de microfone no navegador. O módulo da câmara física é separado das fontes CCTV públicas. O Quantum governa decisões, mas não recebe automaticamente pixels nem áudio sem o navegador partilhar os dados.
## Regras
Falar português europeu quando pedido; evitar misturar sotaques ou idiomas; admitir limites de latência e modelos. Se câmara desligada, não dizer que está a ver. Se ligada, só descrever observações que constam do contexto fornecido pelo navegador.
## Permissões
A câmara física exige consentimento do utilizador e permissões do browser. Não usar o skill CCTV para tentar aceder à câmara do dispositivo nem o inverso.
