# Travis — transição progressiva para Rust

**Fase 1: protótipo isolado e desligado por omissão.**

Objetivo: usar Rust nas partes de processamento intensivo sem substituir
os serviços Python, JavaScript ou Kotlin e sem afetar memória, voz, SEO,
publicações ou os controlos de segurança em produção.

## Implementação

- Biblioteca nativa Rust em rust/travis-memory (cdylib e rlib).
- Processamento lexical em lote para até 500 candidatos de memória.
- Ponte Python opcional via ctypes, sem alterar travis_core.py.
- Testes Rust e testes de paridade com a fórmula atual em Python.
- Benchmark sintético apenas informativo e workflow de validação.

O protótipo não acede a bases de dados, credenciais, redes ou ferramentas,
nem arranca serviços. Não está instalado no Travis ativo.

## Testar no Ubuntu / PRoot Linux

~~~sh
cargo test --manifest-path rust/travis-memory/Cargo.toml
cargo build --release --manifest-path rust/travis-memory/Cargo.toml
PYTHONPATH=operit-agent python3 operit-agent/travis_rust_memory_selftest.py -v
PYTHONPATH=operit-agent python3 operit-agent/travis_rust_memory_benchmark.py
~~~

Travis procura a biblioteca em rust/travis-memory/target/release.
Opcionalmente configurar TRAVIS_RUST_MEMORY_LIB para outro caminho.
Binários Ubuntu aarch64 não são binários Android/NDK.

## Critérios de futura ativação

1. Paridade completa nas entradas representativas em português e inglês.
2. Benchmark no ARM64 real, com JSON/FFI e latência global com SQLite.
3. Modo sombra no travis_core.RuntimeStore.recall com fallback Python.
4. Só depois: ativação explícita por flag com reversão imediata.

## Websites

Em landing pages estáticas continuar com HTML/CSS/JavaScript, com prioridade
a imagens, acessibilidade, carregamento e SEO. Rust ou WebAssembly só faz
sentido para processamento intensivo no browser, não melhora automaticamente
o Google nem as páginas simples. Rust pode fazer sentido para serviços HTTP
novos, se o benchmark justificar. O ciclo de vida de microfone no Android
continua a depender do serviço Kotlin.

## Segurança

A branch piloto não altera o runtime em produção nem o OpenClaw. Nenhum
módulo passa a Rust automaticamente. Não fazer merge nem publicação antes
dos resultados dos testes e da revisão.
