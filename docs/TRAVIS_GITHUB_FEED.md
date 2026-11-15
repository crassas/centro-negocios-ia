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

## Fase 2 — integrada na branch piloto, inativa por omissão

A branch piloto inclui agora a ponte para o Jarvis e o controlador
travis_github_runtime.py. Quando explicitamente ativado, o mesmo processo
do Jarvis inicia UMA thread de consulta read-only. Apenas nos períodos
sem pedidos em primeiro plano, verifica as três fontes aprovadas a cada
12 horas (uma por vez); perante falhas volta a tentar após 1 hora.
A última tentativa por fonte fica persistida num ficheiro local.

A pesquisa da biblioteca não faz pedidos de rede durante a conversa.
Consulta o índice SQLite e classifica até 500 passagens em memória
através do motor Rust; se não estiver compilado, utiliza Python.
Para perguntas técnicas, acrescenta referências e URLs imutáveis ao
contexto do modelo, claramente identificadas como dados não fiáveis.

### Comandos de voz preparados

- "Travis, estado do GitHub" — lê o estado real, sem efetuar chamadas externas.
- "Travis, sincroniza o GitHub" — agenda uma consulta em segundo plano.
- "Travis, pesquisa no GitHub sobre Rust" — recupera passagens com fontes.
- "Travis, o que aprendeste no GitHub sobre concorrência?" — mostra
  as referências indexadas, não afirma aprendizagem de pesos.

### Ativação controlada APÓS validação no dispositivo

O instalador e o autoupdater passam a incluir os três ficheiros opcionais
do GitHub/Rust. O controlador é desligado por omissão; não há atividade
de rede nem base de dados nova no arranque normal.

~~~sh
# Na instalação ativa, depois de verificar os módulos e realizar backup:
mkdir -p ~/.centro-jarvis
touch ~/.centro-jarvis/github-feed-enabled
jarvisctl reload
jarvisctl doctor
~~~

Para desativar imediatamente as consultas futuras, apagar apenas
o marcador (não apagar a base de dados):
~~~sh
rm -f ~/.centro-jarvis/github-feed-enabled
~~~

Também é possível controlar a opção por variável de ambiente:
TRAVIS_GITHUB_FEED=1 ativa e TRAVIS_GITHUB_FEED=0 desativa (sobrepõe-se ao
marcador). Para garantir a thread em segundo plano após alterar o
marcador, efetuar reload controlado quando o serviço estiver livre.

**Ainda não instalado nem testado no OPPO.** A quota de comandos remotos
impediu executar essa etapa. A branch continua como PR em rascunho,
sem merge em main e sem atualização forçada da instalação ativa.
Não é necessário OpenClaw.

## Controlo e segurança

- Consulta restrita à API GitHub por HTTPS, com respostas e ficheiros limitados.
- Apenas repositórios, branches e caminhos aprovados em código.
- Não executa código do GitHub; não faz git pull, alterações de sites ou deploy.
- Não envia segredos nem utiliza APIs de IA pagas.
- O conteúdo remoto é não fiável, mesmo que provenha de um repositório
  legítimo; nunca modifica regras, credenciais ou decisões autorizadas.
- Quotas de GitHub e erros de rede são possíveis.
