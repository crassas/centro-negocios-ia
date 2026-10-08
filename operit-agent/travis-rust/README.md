# Travis / núcleo nativo Rust — v0.1

Primeiro módulo de substituição progressiva do motor Python, sem criar um segundo daemon.

## O que faz

- Lê os nós e as sinapses **reais** de `~/.centro-jarvis/memory.sqlite` através de SQLite read-only, respeitando transacções WAL.
- Lê apenas `id`, `created`, `region` e `phase` dos eventos cognitivos em `~/.centro-jarvis/brain.sqlite`; nunca lê o campo `detail`.
- Expõe um retrato operacional **verificado pela leitura das bases**, sem confundir registo de ferramentas com execução real.
- Devolve exactamente a estrutura esperada por `/brain/graph`; não mostra `summary`, conteúdo privado ou raciocínio interno.
- Não regista memórias novas, não altera pesos do modelo, não inicia tarefas nem altera os serviços existentes.

## Compilar no Ubuntu do telefone (aarch64)

Necessário: Rust/Cargo recente, compilador C e acesso às dependências gratuitas do crates.io no primeiro build. Uma vez presentes na cache, o projecto pode compilar offline.

```sh
cd ~/repos/centro-negocios-ia
cargo test --manifest-path operit-agent/travis-rust/Cargo.toml
cargo build --release --manifest-path operit-agent/travis-rust/Cargo.toml
./operit-agent/travis-rust/target/release/travis-core graph --db ~/.centro-jarvis/memory.sqlite --limit 120
./operit-agent/travis-rust/target/release/travis-core events --db ~/.centro-jarvis/brain.sqlite --limit 80
./operit-agent/travis-rust/target/release/travis-core status --memory-db ~/.centro-jarvis/memory.sqlite --brain-db ~/.centro-jarvis/brain.sqlite
```

**Activação opcional do backend Rust para `/brain/graph`:** configurar a variável de ambiente no processo que lança o servidor Jarvis (a variável deve ser herdada pelo processo Python):

```sh
export TRAVIS_RUST_BIN="$HOME/repos/centro-negocios-ia/operit-agent/travis-rust/target/release/travis-core"
python3 operit-agent/travis_rust_bridge_selftest.py
python3 operit-agent/travis_rust_integration_selftest.py
```

É necessário reiniciar de forma controlada o serviço Jarvis para herdar esta variável; não iniciar um segundo servidor na mesma porta. Se o binário não existir, demorar mais de 1,5 s, devolver JSON inválido ou falhar, o endpoint mantém o gráfico Python e devolve `engine: python-fallback`. Sem activar a variável, `engine: python`.

## Fronteiras de prova

- `verified` em `status` significa que as tabelas SQLite foram lidas naquele instante — não prova que um serviço web ou uma ferramenta externa funciona.
- Registos históricos de capacidades adquiridas, sem testes actuais, não são prova de disponibilidade.
- Partículas 3D representam acontecimentos registados no software, não neurónios biológicos nem consciência subjectiva.
- O comando `events` está preparado para a fase seguinte; ainda não foi ligado à interface de partículas.
- Este branch não se publica automaticamente no telefone nem no site. Confirmar build, regressões e observação real antes de activar.
