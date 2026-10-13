#!/usr/bin/env python3
"""Controlled OPPO activation of the staged Travis GitHub/Rust feed.

Preserves custom local Jarvis changes via exact, fail-closed patch anchors.
Pauses Centro auto-update while the branch is experimental. Reversible.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
ROOT = HOME / ".centro-jarvis"
STAGE = HOME / "travis-rust-stage"
BRIDGE = STAGE / "operit-agent"
COMPILED_LIB = STAGE / "rust/travis-memory/target/release/libtravis_memory.so"
LIB_DEST = ROOT / "bin/libtravis_memory.so"
JARVIS = HOME / "jarvis_local.py"
MAINTENANCE = HOME / ".centro-station/maintenance"
ENABLED = ROOT / "github-feed-enabled"
LATEST = ROOT / "rust-github-activation.json"
BACKUP_ROOT = HOME / ".travis-backups"
PIN = "c88be1bd159cd6b2f55c07fc1d0b9fe1d8bf60a6"
BASE = "112714aeb7e3ef3a7d5921659551d95b0f115b29"
SOURCE = "https://raw.githubusercontent.com/crassas/centro-negocios-ia"
MODULES = ("travis_github_feed.py", "travis_github_runtime.py", "travis_rust_memory.py")
FILES = [JARVIS, *(HOME / item for item in MODULES), LIB_DEST, ENABLED]
EXPECTED_ANCHORS = (
    "TRAVIS_GITHUB=travis_github_runtime.KnowledgeController",
    'if tool=="github_knowledge_search"',
    'TRAVIS_GITHUB.start(idle=',
    "travis_github_runtime.classify",
    "TRAVIS_GITHUB.context(",
)


class Abort(RuntimeError):
    pass


def note(message):
    print("[TRAVIS RUST] " + message, flush=True)


def safe_bytes(path, limit=700000):
    data = path.read_bytes()
    if len(data) > limit:
        raise Abort("Ficheiro inesperadamente grande: " + path.name)
    return data


def fetch_at(ref, relpath, max_bytes=500000):
    # Fixed immutable Git commit, first-party public source only.
    url = f"{SOURCE}/{ref}/{relpath}"
    request = urllib.request.Request(url, headers={"User-Agent": "Travis-Rust-Activation/1"})
    with urllib.request.urlopen(request, timeout=18) as response:
        if response.geturl() != url or response.status != 200:
            raise Abort("Referência Git não verificada: " + relpath)
        body = response.read(max_bytes + 1)
    if len(body) > max_bytes:
        raise Abort("Ficheiro Git fora do limite: " + relpath)
    return body.decode("utf-8")


def http_json(url, payload=None):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json",
                 "Origin": "http://127.0.0.1:8770"} if payload is not None else {},
    )
    with urllib.request.urlopen(request, timeout=12) as response:
        return json.load(response)


def health(url):
    try:
        response = http_json(url)
        return response if isinstance(response, dict) else {}
    except (OSError, ValueError, TimeoutError):
        return {}


def active_router_path(report):
    try:
        pid = int(report.get("pid", -1))
        if pid <= 0:
            return None
        parts = (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0")
        commands = [p.decode("utf-8", "replace") for p in parts if p]
        if "serve" not in commands:
            return None
        matches = [Path(arg).resolve() for arg in commands if arg.endswith("jarvis_local.py")]
        return matches[0] if len(matches) == 1 else None
    except (OSError, ValueError):
        return None


def writable_target(path):
    if path.is_symlink():
        raise Abort("Alvo é um link simbólico, alteração recusada: " + str(path))
    if path.exists() and not path.is_file():
        raise Abort("Alvo não é ficheiro regular: " + str(path))
    if path.exists() and path.stat().st_nlink > 1:
        raise Abort("Alvo tem múltiplos hardlinks: " + str(path))


def patch_source(base_text, candidate_text, live_text):
    """Apply only upstream's additive pilot edits to *this* customised file.

    Each original fragment must match exactly once. Never replace entire
    live source or silently overwrite local customisations.
    """
    original = base_text.splitlines(keepends=True)
    target = candidate_text.splitlines(keepends=True)
    different = difflib.SequenceMatcher(None, original, target, autojunk=False).get_opcodes()
    changes = [(tag, i1, i2, j1, j2) for tag, i1, i2, j1, j2 in different if tag != "equal"]
    if not 3 <= len(changes) <= 24:
        raise Abort(f"Patch fora do intervalo esperado: {len(changes)} blocos")
    if sum(j2 - j1 for _, _, _, j1, j2 in changes) > 180:
        raise Abort("Patch com demasiadas linhas alteradas")

    def apply(text):
        for tag, i1, i2, j1, j2 in reversed(changes):
            new = "".join(target[j1:j2])
            if tag == "insert":
                preceding = "".join(original[max(0, i1 - 2):i1])
                following = "".join(original[i1:i1 + 2])
                needle = preceding + following
                replacement = preceding + new + following
            else:
                needle = "".join(original[i1:i2])
                replacement = new
            if not needle or text.count(needle) != 1:
                raise Abort("Conflito com código local: alteração não aplicada em " +
                            str(i1 + 1) + " (" + tag + ")")
            text = text.replace(needle, replacement, 1)
        return text

    # Assert our reconstruction is byte-for-byte the audited GitHub pilot.
    if apply(base_text) != candidate_text:
        raise Abort("Falha na reconstrução do patch de referência")
    updated = apply(live_text)
    if updated == live_text or not all(x in updated for x in EXPECTED_ANCHORS):
        raise Abort("Integração GitHub incompleta ou já presente")
    compile(updated, str(JARVIS), "exec")
    return updated, len(changes)


def preflight():
    if platform.system() != "Linux" or platform.machine().lower() not in {"arm64", "aarch64"}:
        raise Abort("Necessário Linux ARM64")
    if not (STAGE / ".verified-commit").is_file() or (STAGE / ".verified-commit").read_text().strip() != PIN:
        raise Abort("A preparação Rust ARM64 não está validada na revisão esperada")
    if not COMPILED_LIB.is_file() or COMPILED_LIB.stat().st_size < 1000:
        raise Abort("Falta a biblioteca Rust compilada na etapa anterior")
    if LATEST.exists():
        raise Abort("Existe uma ativação anterior. Executa status ou rollback.")
    if ENABLED.exists():
        raise Abort("O marcador GitHub já existe: estado manual, não vou sobrepor.")
    if not JARVIS.is_file() or JARVIS.is_symlink():
        raise Abort("Jarvis local não encontrado como ficheiro regular")
    for item in MODULES:
        if not (BRIDGE / item).is_file():
            raise Abort("Falta o módulo preparado: " + item)
    for item in FILES:
        writable_target(item)
    report = health("http://127.0.0.1:8770/health")
    centro = health("http://127.0.0.1:8765/health")
    if report.get("ok") is not True or report.get("service") != "jarvis" or report.get("busy"):
        raise Abort("O Jarvis não está livre e saudável na porta 8770")
    if centro.get("ok") is not True or centro.get("busy"):
        raise Abort("O Centro não está livre e saudável na porta 8765")
    if active_router_path(report) != JARVIS.resolve():
        raise Abort("O Jarvis ativo não está a executar /root/jarvis_local.py: não vou alterar outra instância")
    if os.environ.get("JARVIS_SOURCE") and Path(os.environ["JARVIS_SOURCE"]).resolve() != HOME.resolve():
        raise Abort("A variável JARVIS_SOURCE aponta para outra instalação")
    ctl = shutil.which("jarvisctl")
    if not ctl:
        raise Abort("jarvisctl não está instalado")
    ctl_path = Path(ctl).resolve()
    source_dir = ctl_path.parent
    if (source_dir / "jarvis_local.py").is_file() and (source_dir / "jarvis_local.py").resolve() != JARVIS.resolve():
        raise Abort("jarvisctl reiniciaria outro Jarvis; abortado.")
    return ctl


def atomic_write(path, blob, mode=0o600):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    writable_target(path)
    tmp = path.with_name(path.name + f".new-rust-{os.getpid()}")
    try:
        with tmp.open("xb") as output:
            output.write(blob)
            output.flush()
            os.fsync(output.fileno())
        tmp.chmod(mode)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def snapshot(directory):
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    directory.chmod(0o700)
    items = []
    for index, path in enumerate(FILES):
        writable_target(path)
        existed = path.is_file()
        previous = path.stat().st_mode & 0o777 if existed else 0
        if existed:
            raw = safe_bytes(path, limit=15_000_000)
            backup = directory / f"{index:02d}.orig"
            atomic_write(backup, raw, mode=0o600)
            digest = hashlib.sha256(raw).hexdigest()
        else:
            digest = ""
        items.append({"path": str(path), "existed": existed, "mode": previous,
                      "digest": digest, "backup": f"{index:02d}.orig" if existed else ""})
    data = {"schema": 1, "base": BASE, "patch": PIN, "files": items,
            "maintenanceExisted": MAINTENANCE.is_file()}
    atomic_write(directory / "manifest.json", json.dumps(data, indent=2).encode())
    return data


def restore(directory):
    path = directory / "manifest.json"
    info = json.loads(safe_bytes(path).decode("utf-8"))
    if info.get("schema") != 1 or info.get("patch") != PIN or len(info.get("files", [])) != len(FILES):
        raise Abort("Manifesto de backup incompatível")
    for entry, target in zip(info["files"], FILES):
        if entry["path"] != str(target):
            raise Abort("Alvo de backup inesperado")
        writable_target(target)
        if entry["existed"]:
            raw = safe_bytes(directory / entry["backup"], limit=15_000_000)
            if hashlib.sha256(raw).hexdigest() != entry["digest"]:
                raise Abort("Cópia de segurança inválida de " + target.name)
            atomic_write(target, raw, mode=entry["mode"] or 0o600)
        else:
            target.unlink(missing_ok=True)
    if not info["maintenanceExisted"]:
        MAINTENANCE.unlink(missing_ok=True)
    return info


def wait_for_router(timeout=18):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        checked = health("http://127.0.0.1:8770/health")
        if checked.get("ok") and checked.get("service") == "jarvis":
            if active_router_path(checked) == JARVIS.resolve():
                return checked
        time.sleep(0.4)
    raise Abort("O Jarvis não regressou saudável com o ficheiro esperado")


def reload_router(ctl):
    response = subprocess.run([ctl, "reload"], capture_output=True, text=True, timeout=45,
                              check=False, env={**os.environ, "JARVIS_SOURCE": str(HOME)})
    if response.returncode != 0:
        raise Abort("jarvisctl reload falhou: " +
                    (response.stderr or response.stdout)[-350:].replace("\n", " "))
    return wait_for_router()


def check_live_voice():
    response = http_json("http://127.0.0.1:8770/jarvis", {
        "text": "Travis, estado do GitHub",
        "language": "pt",
    })
    if (not isinstance(response, dict) or response.get("ok") is not True or
            response.get("tool") != "github_knowledge_status"):
        raise Abort("O router está online mas não integrou o comando GitHub")
    result = response.get("result")
    if not isinstance(result, dict) or result.get("enabled") is not True:
        raise Abort("GitHub não está realmente ativo no runtime")
    return response


def activate():
    ctl = preflight()
    note("Jarvis e Centro ONLINE; estado livre confirmado.")
    note("Vou aplicar apenas os blocos novos da branch experimental; preservar o restante código.")
    base = fetch_at(BASE, "operit-agent/jarvis_local.py")
    candidate = fetch_at(PIN, "operit-agent/jarvis_local.py")
    current = JARVIS.read_text(encoding="utf-8")
    if "travis_github_runtime" in current:
        raise Abort("O Jarvis já contém uma integração GitHub. Estado manual exige revisão.")
    new_text, blocks = patch_source(base, candidate, current)
    note(f"Validação: {blocks} blocos exclusivos identificados; código local preservado.")
    # Verify native ABI on the actual OPPO before touching running services.
    sys.path.insert(0, str(BRIDGE))
    import travis_rust_memory
    os.environ["TRAVIS_RUST_MEMORY_LIB"] = str(COMPILED_LIB)
    scores = travis_rust_memory.score_overlaps("memória Rust", [
        {"title": "Memória Rust", "body": "Travis"}
    ])
    if scores != [4.0]:
        raise Abort("O motor Rust não respondeu conforme o contrato ARM64")
    # The installed adapter will use ~/.centro-jarvis/bin without a runtime env override.
    os.environ.pop("TRAVIS_RUST_MEMORY_LIB", None)
    backup = BACKUP_ROOT / ("rust-github-" + time.strftime("%Y%m%d-%H%M%S"))
    manifest = snapshot(backup)
    atomic_write(LATEST, json.dumps({"backup": str(backup), "state": "activating"},
                                    ensure_ascii=False).encode())
    note("Cópia de segurança: " + str(backup))
    try:
        # Station reads this marker before starting any update-from-main cycle.
        MAINTENANCE.parent.mkdir(parents=True, exist_ok=True)
        if not manifest["maintenanceExisted"]:
            MAINTENANCE.touch(mode=0o600, exist_ok=False)
        note("Atualizações automáticas do Centro temporariamente suspensas.")
        time.sleep(6)
        # Recheck no user request has started while preparing the patch.
        jh = health("http://127.0.0.1:8770/health")
        ch = health("http://127.0.0.1:8765/health")
        if jh.get("busy") or ch.get("busy") or jh.get("ok") is not True or ch.get("ok") is not True:
            raise Abort("Serviços entretanto ocupados; ativação recusada.")
        for name in MODULES:
            source = BRIDGE / name
            data = safe_bytes(source)
            compile(data.decode("utf-8"), str(HOME / name), "exec")
            atomic_write(HOME / name, data)
        atomic_write(LIB_DEST, safe_bytes(COMPILED_LIB, limit=15_000_000))
        atomic_write(JARVIS, new_text.encode("utf-8"), mode=JARVIS.stat().st_mode & 0o777)
        atomic_write(ENABLED, b"travis-github-feed-enabled\n")
        note("Extensões copiadas. A reiniciar apenas o Jarvis, sem tocar no Centro Server.")
        reload_router(ctl)
        note("A confirmar comando de voz no Jarvis ativo.")
        answer = check_live_voice()
        atomic_write(LATEST, json.dumps({
            "backup": str(backup), "state": "active", "installedAt": int(time.time()),
            "originalBlobSha": hashlib.sha1(b"blob " + str(len(current.encode())).encode() +
                                            b"\0" + current.encode()).hexdigest(),
        }, ensure_ascii=False).encode())
        note("TRAVIS_RUST_GITHUB_ACTIVE=PASS")
        note("Integração de voz verificada: " + str(answer.get("tool")))
        note("Fonte GitHub: sincronização 12/12h enquanto o Jarvis estiver ativo e livre.")
        note("NOTA: atualizações automáticas em pausa até publicar esta branch em main.")
        note("Reversão imediata: python3 /tmp/travis-rust-activate.py rollback")
    except Exception as exc:
        note("Ativação falhou; a restaurar a instalação anterior...")
        restore(backup)
        LATEST.unlink(missing_ok=True)
        try:
            reload_router(ctl)
            note("ROLLBACK_AUTOMATICO=PASS")
        except Exception as recovery:
            note("ROLLBACK_AUTOMATICO=FICHEIROS_REPOSTOS, REARRANQUE_NAO_CONFIRMADO")
            raise Abort("Cópias repostas, mas Jarvis precisa de recuperação manual: " +
                        type(recovery).__name__) from exc
        raise Abort("Alteração revertida: " + type(exc).__name__) from exc


def rollback():
    if not LATEST.is_file():
        raise Abort("Não encontrei ativação gerida. Nenhuma alteração efetuada.")
    info = json.loads(safe_bytes(LATEST).decode("utf-8"))
    directory = Path(info.get("backup", ""))
    if BACKUP_ROOT.resolve() not in directory.resolve().parents:
        raise Abort("Caminho de backup fora da pasta autorizada")
    # Ensure the updater cannot race the rollback until files are restored.
    MAINTENANCE.parent.mkdir(parents=True, exist_ok=True)
    MAINTENANCE.touch(exist_ok=True)
    restore(directory)
    LATEST.unlink(missing_ok=True)
    ctl = shutil.which("jarvisctl")
    if ctl:
        reload_router(ctl)
    note("TRAVIS_RUST_GITHUB_ROLLBACK=PASS")
    note("Restauro concluído a partir de " + str(directory))


def status():
    report = health("http://127.0.0.1:8770/health")
    print(json.dumps({
        "arch": platform.machine(),
        "jarvisOnline": bool(report.get("ok")),
        "jarvisBusy": bool(report.get("busy")),
        "activeRouter": str(active_router_path(report)) if report.get("ok") else "",
        "rustLibraryInstalled": LIB_DEST.is_file(),
        "githubFeedEnabled": ENABLED.is_file(),
        "centroMaintenance": MAINTENANCE.is_file(),
        "managedActivation": LATEST.is_file(),
        "preparedSha": ((STAGE / ".verified-commit").read_text().strip()
                        if (STAGE / ".verified-commit").is_file() else ""),
    }, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("activate", "rollback", "status"))
    args = parser.parse_args()
    try:
        {"activate": activate, "rollback": rollback, "status": status}[args.command]()
    except Abort as exc:
        note("BLOQUEADO: " + str(exc))
        sys.exit(1)
    except Exception as exc:
        note("ERRO: " + type(exc).__name__ + " — nenhuma conclusão de sucesso.")
        sys.exit(1)


if __name__ == "__main__":
    main()
