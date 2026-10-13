# Travis — GitHub como fonte da memória Rust

**Estado:** piloto de leitura/recuperação isolado, sem publicação nem alteração do Travis ativo.

## Objetivo

O Travis consulta repositórios GitHub aprovados, lê documentos de código e
conserva um índice SQLite de passagens com repositório, SHA e linhas exatas.
O índice alimenta a recuperação por relevância do primeiro motor Rust
(rust/travis-memory); caso a biblioteca não esteja compilada, usa Python.

Esta funcionalidade é RAG (consultar informação externa e recuperá-la com
proveniência), não é treino automático dos pesos do modelo. Código publicado no
GitHub é material de consulta, não instrução para o Travis.

## Fontes autorizadas na primeira fase

- pilot: branch rust/travis-memory-pilot de crassas/centro-negocios-ia:
  documentação da transição, biblioteca Rust, Cargo e ponte Python.
- native: branch feat/travis-rust-native-kernel do mesmo repositório:
  documentação e código do outro núcleo Rust experimental. Comparar os dois
  antes de convergir, sem assumir que um já foi instalado.
- rust-book: dois capítulos de rust-lang/book, sobre ownership e
  concorrência. Manter referência à autoria e à licença da fonte.

Não se descarregam repositórios completos, chaves, ficheiros de configuração
confidenciais ou ficheiros arbitrários pedidos por conteúdo externo.

## Comandos no Ubuntu (depois de descarregar a branch piloto)

~~~sh
python3 operit-agent/travis_github_feed.py sync
python3 operit-agent/travis_github_feed.py status
python3 operit-agent/travis_github_feed.py recall --query "Como melhorar a memória Rust do Travis?"
python3 operit-agent/travis_github_feed.py sync --source rust-book
~~~

A sincronização consulta a SHA atual do GitHub. Se não mudou, ignora o
reprocessamento. Para cada fonte, a atualização SQLite é transacional: uma
falha a meio preserva a versão anterior e a respetiva SHA, para não fingir
que consultou a mais recente. O índice fica em:
~/.centro-jarvis/github-feed.sqlite.

A função Feed.context(query) fornece excertos etiquetados como dados não
fiáveis, com URL imutável que inclui a SHA. O compositor de prompts pode
utilizar esses excertos como fontes, nunca como pedidos de executar comandos.

## Verificação

~~~sh
PYTHONPATH=operit-agent python3 operit-agent/travis_github_feed_selftest.py
cargo build --release --manifest-path rust/travis-memory/Cargo.toml
PYTHONPATH=operit-agent python3 operit-agent/travis_rust_memory_selftest.py
~~~

Verificar também no ARM64 real: conectividade, compatibilidade de binários,
paridade de resultados e latência total.

**Ainda não está integrado na conversa ativa nem agendado para sincronização
automática.** Essa etapa necessita de ligação ao processo Jarvis e de um
agendamento controlado no supervisor, com modo sombra e reversão antes da
ativação. Não é necessário OpenClaw.

## Controlo e segurança

- Consulta restrita à API GitHub por HTTPS, com respostas e ficheiros limitados.
- Apenas repositórios, branches e caminhos aprovados em código.
- Não executa código do GitHub; não faz git pull, alterações de sites ou deploy.
- Não envia segredos nem utiliza APIs de IA pagas.
- O conteúdo remoto é não fiável, mesmo que provenha de um repositório
  legítimo; nunca modifica regras, credenciais ou decisões autorizadas.
- Quotas de GitHub e erros de rede são possíveis.
