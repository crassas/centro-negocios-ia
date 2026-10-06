# JARVIS LOCAL
Implementação em main. A validação física do microfone e da reprodução no Android está pendente.
## Usar
- http://127.0.0.1:8770 — Falar, terminar gravação, ouvir resposta; botão Parar voz.
- jarvisctl start / stop / restart / doctor
- jarvisctl ask "Jarvis, diz-me o estado da estação."
- jarvisctl llm-start small — modelo operacional Qwen2.5 1.5B Q4_K_M.
- jarvisctl llm-start fallback — Qwen2.5 0.5B Q4_K_M.
- jarvisctl llm-start main — candidato Qwen3 4B Q4_K_M; requer 3800 MB livres e continua por validar.
## Provas realizadas neste dispositivo
- LLM local respondeu LOCAL_OK.
- Piper PT-PT produziu WAV 22050 Hz; frase curta em 1277 ms.
- Áudio sintético local → whisper.cpp → system_status real → áudio Piper, 36,79 s. A transcrição teve erros mas preservou a intenção.
- Fixture Git isolada: modelo gerou plano, esquema restringiu os paths, executor criou note.txt e o teste de conteúdo passou.
- Arranque principal com falha injectada → modelo fallback real → FALLBACK_OK.
- Dez testes automáticos passaram; policy_selftest e resilience_selftest passaram.
- Best Pizza respondeu HTTP 200 sem inferência na verificação inicial.
- O teste de inferência/código bloqueou HTTP externo no cliente do teste. Não equivale a cortar toda a rede Android.
Evidências locais em ~/.centro-jarvis/*-proof.json; não guardar gravações.
## Arquitectura
MediaRecorder no browser local → FFmpeg → whisper.cpp (pywhispercpp ARM64) → router determinístico → tools/Laya/llama.cpp → memória SQLite → Piper → browser.
Sem API cloud obrigatória no fluxo Jarvis. O Telegram e operações Git/Web continuam naturalmente online.
O planeador local substitui o planeador cloud quando planner_enabled existe; falha segura bloqueia fallback cloud de alterações.
Paths do plano ficam limitados ao contexto autorizado por schema, e o executor preserva a validação existente.
## Ecossistema do Centro
A conversa na Sala dos Agentes e em Automação & IA usa o motor seleccionado (Jarvis local por defeito). Os pedidos locais entram na fila persistente existente: Worker → Centro Agent → Centro Server → Jarvis. O resultado aparece na conversa e na actividade do Centro. O contexto actual de sites, CRM, financeiro e SEO acompanha a análise local. Alterações nos repositórios continuam no executor protegido e na política de confirmação existente.
A voz abre no telemóvel a partir do Centro e permite consultar o histórico do mesmo Centro Server. O token permanente nunca sai do servidor. No Telegram, /jarvis seguido do pedido usa a mesma fila; alterações usam o percurso /fazer.
Esta integração exige actualizar o runtime do telemóvel; a ligação Remote estava offline no momento desta publicação. A publicação de código não confirma por si só a versão activa no dispositivo.
A presença ("estás aí?", "Olá") responde por regra, sem carregar o LLM. A interface tem prazo de espera e cancela a espera ao premir Parar voz. Cancelar a espera não reverte uma operação que o executor já tenha iniciado.
## Instalar
bash operit-agent/install_jarvis_local.sh
Binários oficiais ARM64: llama.cpp b11438, Piper 2023.11.14-2. Proveniência e checksums registados localmente.
pywhispercpp 1.5.1 usa wheel ARM64; não exige compilação no PRoot. A compilação Ninja inicial encontrou ENOSYS e foi substituída.
Os modelos ficam em ~/.centro-models, fora do Git. As licenças dos LLM são Apache 2.0; consultar MODEL_CARD da voz.
## Segurança e memória
Router 127.0.0.1:8770; LLM 127.0.0.1:8771; Centro 8765; Laya 18790.
Browser usa chave efémera e same-origin. Tokens do Centro ficam fora do browser e do modelo.
SQLite separa tarefas, projectos, factos, execuções, eventos e resumos. Conversas/áudio não são persistidos por defeito.
Erros HTTP não são automaticamente tratados como prova de indisponibilidade.
## Supervisor
O marcador ~/.centro-jarvis/enabled activa recuperação do router.
OpenClaw deixou de arrancar por centrostation start. O auto-update e a recuperação Remote foram repostos. Actualizações do Jarvis recarregam o router quando não há pedidos activos, sem parar o modelo local.
O filtro do log Remote ignora conteúdo MCP com palavras de erro e preserva a detecção de eventos reais.
## Ainda falta verificar
- Microfone/reprodução físicos, interrupção física de áudio.
- Restart centrostation realizado: Server, Agent, Laya, LLM, router e SQLite íntegros.
- Observação de estabilidade de duas horas: jarvis_soak.py grava resultados, sem inferência.
- Modelo 4B e qualidade em alterações complexas; não activar por tamanho nominal.
## Rollback
jarvisctl stop
Remover apenas ~/.centro-jarvis/enabled e planner_enabled para desligar integração.
Cópias *.before-jarvis do runtime conservam versões anteriores. Preservar modelos, SQLite e credenciais.
