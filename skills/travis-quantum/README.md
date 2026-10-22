# TRAVIS × QUANTUM UNIFIED AGENT — SKILLS OPERACIONAIS V1

Data: 10 de outubro de 2026 | PT-PT
Drive canónica: QUANTUM UNIFIED AGENT / TRAVIS — Skills Operacionais — Quantum Unified Agent

## Identidade e autoridade
- Última base Quantum construída e instalada: **V10.73**.
- Estado de arquitectura canónica Google Drive: **V10.83 PARTIAL** (não confundir com runtime).
- Biblioteca interna original Quantum V10.73: **79 skills** em `.agents/skills`.
- Extensão local Travis: **6 skills de domínio**, com SKILL.md, registry.json, testes e integração com a resposta do Travis.
- Um Quantum Unified Agent, um estado autoritativo, vários especialistas.
- `CAPABILITY != AUTHORITY`; nenhuma skill concede acesso às contas ou autoridade para modificar repositórios, pagamentos, câmaras privadas ou dados pessoais.

## Índice dos seis documentos na Drive
1. Quantum Governance — https://docs.google.com/document/d/1SnbRQ01_xeZ1rAcSgPmY9OCHtevMZKaDSf93Ec_6nYU/edit
2. God's Eye View — https://docs.google.com/document/d/1APuiWeADl53QWGvEZYEPM0DcabZWBO6hopBp4ETAWjE/edit
3. Selecção de câmaras públicas — https://docs.google.com/document/d/1xV3E-58Y43AN62sxVyFve-ouWy4FVyVO_r8EdGdCWPQ/edit
4. Voz PT/EN e visão — https://docs.google.com/document/d/1tonLU9khJ6xkxTcwHVYRAWNZxsTPI2eYEsf2wkhlvmE/edit
5. Memória e aprendizagem — https://docs.google.com/document/d/19OdrBBUnFn9VPNOZ9pU-tbsEbhlwoXhsMM4HICUNK4M/edit
6. Microsites, SEO/AEO/GEO — https://docs.google.com/document/d/1hMLVX4Es6igs-Tod43jXGaTOyvtlaWcB0qAkawR9KG8/edit

## Fonte executável e continuidade
GitHub: https://github.com/crassas/centro-negocios-ia/tree/feature/travis-gev-17-keyless/skills/travis-quantum
Integração: https://github.com/crassas/centro-negocios-ia/pull/35
Código do índice: operit-agent/travis_skillbook.py
Instalador reversível: scripts/travis-skillbook-install.py

O Travis carrega os documentos **a partir do índice local** `~/.centro-jarvis/skills/travis-quantum`; o Drive é a biblioteca documental e cópia de segurança, **não uma ligação directa de execução** do Travis. Não precisa de ir à Drive a cada pergunta. O índice local não é memória falsa: verifica os ficheiros necessários e, quando explicitamente solicitado, consulta a saúde dos serviços públicos locais.

## Testes executados
- 5/5 testes de segurança, correspondência semântica e registo do skillbook aprovados no Android.
- `python3 /root/travis_skillbook.py status`: catálogo carregado, seis skills, autoridade falsa para todas.
- Após reinício controlado do Jarvis, o pedido real `Travis, que skills tens?` devolveu a enumeração das seis skills em português, com `skillsCount: 6` e processamento governado pelo Quantum.
- `QuantumTravisBridge.health()`: `ok: true`, V10.73, relatório original PASS. Não foi criada outra instância do Quantum.
- O serviço de voz Jarvis 8770 reiniciou, mantendo separados os serviços Centro 8765 e GEV 4173.
- A biblioteca não prova que todos os equipamentos ou feeds estejam disponíveis; uma câmara precisa de permissão (dispositivo) ou fonte pública válida (CCTV).

## Recuperação e procedimento futuro
1. Consultar primeiro o 00 — READ FIRST — QUANTUM UNIFIED AGENT na Drive canónica.
2. Recuperar ou actualizar o GitHub `skills/travis-quantum` e `operit-agent/travis_skillbook.py` sem modificar o runtime Quantum V10.73 original.
3. Validar `python3 /root/travis_skillbook_selftest.py`; ver `python3 /root/travis_skillbook.py status` e `probe`.
4. Aplicar o instalador com backup e validar o código antes de reiniciar apenas Jarvis. `python3 /root/.centro-jarvis/travis-skillbook-install.py apply`.
5. Testar as respostas reais e o estado do serviço; actualizar o índice da Drive e confirmar a leitura de volta. Em regressão, `rollback` restaura `jarvis_local.py` anterior.
6. Não criar uma nova versão Quantum sem build, validação, compatibilidade, rollback e actualização do documento 00.

## Próxima fase opcional
Criar um sincronizador Drive → staging local com permissões e comparação de versões, sem executar automaticamente conteúdo descarregado ou permitir que uma descrição se faça passar por uma capacidade.

**Estado:** Skills V1 instaladas localmente, resposta do Travis testada, documentos de referência gravados e verificados na Drive. A integração de sincronização automática a partir da Drive não foi feita.


## Verificação final e persistência — 10-Out-2026
- Google Drive canónica: https://drive.google.com/drive/folders/14NC80jFV7VxumocEGmXAnj2kFinlwlkg
- Pasta auditada: 8 documentos (00 índice, 01 manifesto, 6 skills), todos sob QUANTUM UNIFIED AGENT; conteúdo das skills e índice confirmado por leitura de volta.
- `travis-skillbook-guard.py` executa-se pelo watcher existente, sem criar outro agente. O gancho em `jarvisctl start` volta a aplicar a integração local se o Centro substituir o ficheiro do servidor; a rotina não reinicia Jarvis automaticamente nem executa skills a partir da Drive.
- `python3 /root/travis_skillbook.py probe`: 6 skills; GEV, CCTV, memória e microsites com serviço local confirmado; voz/visão exige permissão da câmara; governo Quantum instalado.
- `QuantumTravisBridge.health()`: `ok: true`, V10.73. `jarvisctl ask "Travis, que skills tens?"` devolveu as 6 skills e foi processado pelo Quantum.
- Os testes não provam que cada feed CCTV ou mapa está visível no browser, só o funcionamento do registo, os serviços e o encaminhamento da pergunta.
- O assistente não tem sincronização automática Drive → runtime. Actualizações passam por controlo de versões, comparação, testes e aprovação.
