#!/usr/bin/env bash
# Travis Rust on OPPO / Ubuntu PRoot: STAGE ONLY, no active-service changes.
set -euo pipefail
umask 077

PIN="c88be1bd159cd6b2f55c07fc1d0b9fe1d8bf60a6"
SOURCE="https://raw.githubusercontent.com/crassas/centro-negocios-ia/$PIN"
STAGE="$HOME/travis-rust-stage"
PKG="$STAGE/rust/travis-memory"
PY="$STAGE/operit-agent"
LIB="$PKG/target/release/libtravis_memory.so"
PROOF="$STAGE/.verified-commit"

say() { printf '\n[Travis Rust] %s\n' "$*"; }
fail() { printf '\n[Travis Rust] ERRO: %s\n' "$*" >&2; exit 1; }

verify_device() {
    [ "$(uname -s)" = "Linux" ] || fail "Este script destina-se a Ubuntu/Linux."
    case "$(uname -m)" in
        aarch64|arm64) ;;
        *) fail "CPU não é ARM64 (uname -m). Não vou instalar binários incompatíveis." ;;
    esac
    [ -n "$HOME" ] && [ -d "$HOME" ] || fail "Variável HOME inválida."
    command -v python3 >/dev/null 2>&1 || fail "Python3 não encontrado."
    command -v curl >/dev/null 2>&1 || fail "curl em falta (instala com: apt-get install -y curl)."
}

toolchain() {
    if command -v rustc >/dev/null 2>&1 &&
       command -v cargo >/dev/null 2>&1 &&
       command -v cc >/dev/null 2>&1; then
        say "Ferramentas Rust e compilador C já disponíveis."
        rustc --version
        cargo --version
        return
    fi
    command -v apt-get >/dev/null 2>&1 || fail "apt-get indisponível."
    [ "$(id -u)" -eq 0 ] || fail "Entra no Ubuntu PRoot como root antes de instalar Rust."
    say "A instalar Rust, Cargo e ferramentas de compilação Ubuntu (pacotes gratuitos)..."
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        rustc cargo build-essential pkg-config ca-certificates
    rustc --version
    cargo --version
}

download() {
    rel="$1"
    dest="$STAGE/$rel"
    mkdir -p "$(dirname "$dest")"
    say "A obter $rel na revisão imutável $PIN"
    curl -fL --retry 2 --connect-timeout 15 --max-time 90 \
        "$SOURCE/$rel" -o "$dest.part" || fail "Falha ao obter $rel. Nenhum serviço foi alterado."
    mv "$dest.part" "$dest"
}

prepare() {
    verify_device
    # No modifications to ~/.centro-jarvis, /root/jarvis_local.py or active Git repos.
    say "A preparar um protótipo SEPARADO em $STAGE (sem alterar o Travis ativo)."
    rm -f "$PROOF"
    toolchain
    for rel in \
        rust/travis-memory/Cargo.toml \
        rust/travis-memory/src/lib.rs \
        operit-agent/travis_rust_memory.py \
        operit-agent/travis_rust_memory_selftest.py \
        operit-agent/travis_rust_memory_benchmark.py \
        operit-agent/travis_github_feed.py \
        operit-agent/travis_github_feed_selftest.py \
        operit-agent/travis_github_runtime.py \
        operit-agent/travis_github_runtime_selftest.py \
        operit-agent/travis_github_live_selftest.py
    do download "$rel"; done

    say "A verificar sintaxe Python (não inicia o Jarvis)."
    python3 -m py_compile "$PY"/*.py

    say "A compilar e testar Rust ARM64. A primeira compilação pode demorar vários minutos."
    CARGO_BUILD_JOBS=2 cargo test --manifest-path "$PKG/Cargo.toml"
    CARGO_BUILD_JOBS=2 cargo build --release --manifest-path "$PKG/Cargo.toml"
    [ -s "$LIB" ] || fail "A compilação não produziu libtravis_memory.so"

    say "A testar igualdade com Python e limites de segurança."
    PYTHONPATH="$PY" TRAVIS_RUST_MEMORY_LIB="$LIB" \
        python3 "$PY/travis_rust_memory_selftest.py" -v
    PYTHONPATH="$PY" TRAVIS_RUST_MEMORY_LIB="$LIB" \
        python3 "$PY/travis_github_feed_selftest.py" -v
    PYTHONPATH="$PY" TRAVIS_RUST_MEMORY_LIB="$LIB" \
        python3 "$PY/travis_github_runtime_selftest.py" -v

    say "A verificar leitura de DOCUMENTAÇÃO PÚBLICA real no GitHub e recuperação Rust."
    PYTHONPATH="$PY" TRAVIS_RUST_MEMORY_LIB="$LIB" \
        python3 "$PY/travis_github_live_selftest.py" || \
        fail "Teste GitHub real não passou (verifica ligação, limites da API). O Travis ativo não foi alterado."

    printf '%s\n' "$PIN" > "$PROOF"
    chmod 600 "$PROOF"
    say "RUST_OPPO_PREPARED=PASS"
    say "Arquitetura: $(uname -m); código: $PIN"
    say "Motor Rust: $LIB"
    say "Estado do Travis ATIVO: NÃO ALTERADO."
    say "Envia o resultado RUST_OPPO_PREPARED=PASS para a fase de ativação controlada."
}

status() {
    say "Arquitetura: $(uname -m)"
    if command -v rustc >/dev/null 2>&1; then rustc --version; else say "Rust ainda não instalado."; fi
    if command -v cargo >/dev/null 2>&1; then cargo --version; fi
    if [ -s "$LIB" ]; then say "Biblioteca Rust compilada: $LIB"; else say "Biblioteca Rust ainda não compilada."; fi
    if [ -f "$PROOF" ]; then
        say "RUST_OPPO_PREPARED=PASS; SHA: $(cat "$PROOF")"
    else
        say "RUST_OPPO_PREPARED=PENDING"
    fi
    if [ -f "$HOME/.centro-jarvis/github-feed-enabled" ]; then
        say "Aviso: marcador GitHub ATIVO encontrado, fora deste instalador."
    else
        say "Marcador GitHub: não ativado por este instalador."
    fi
}

case "$1" in
    prepare) prepare ;;
    status) status ;;
    *) printf 'Uso: bash travis-rust-oppo.sh prepare|status\n' >&2; exit 2 ;;
esac
