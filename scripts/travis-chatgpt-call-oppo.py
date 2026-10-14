#!/usr/bin/env python3
"""Opt-in ChatGPT Voice handoff for an EXISTING paired Travis Native Bridge 0.5.

Does not build/install Android APKs, change assistant defaults, expose credentials,
install a second bridge, invoke ChatGPT APIs or use arbitrary screen coordinates.

check: read-only compatibility/Android health checks
apply: backs up + adds one explicit voice intent to the installed Android route
call: explicit one-off live demonstration (opens ChatGPT on the user's phone)
rollback: restores the two files from the managed backup
"""
from __future__ import annotations

import ast
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

HOME = Path.home()
JARVIS = HOME / "jarvis_local.py"
ARTEMIS = HOME / "travis_artemis_bridge.py"
INTENTS = HOME / "travis_android_commands.py"
BROKER = HOME / "travis_native_bridge.py"
HANDOFF = HOME / "travis_chatgpt_call.py"
ROOT = HOME / ".centro-jarvis"
BACKUPS = HOME / ".travis-backups"
MARKER = ROOT / "chatgpt-voice-activation.json"
BASE_URL = "http://127.0.0.1:8770"
FLAG = "TRAVIS_CHATGPT_HANDOFF_V1"

VOICE_PATTERN = r"""(?:
    (?:call|chama|chamar|liga|ligar|contacta|contata)
        \s+(?:(?:o|ao|com|para\s+o)\s+)?chat\s*gpt
  | (?:abre|ativa|inicia|open|start)
        \s+(?:(?:o|a|the)\s+)?(?:modo\s+)?(?:voz|voice)
        \s+(?:do|no|com|on|with)\s+chat\s*gpt
)"""

CALL_MODULE = '''#!/usr/bin/env python3
"""One explicit user-requested, bounded handoff via existing paired Android Bridge.

An Android screen-reader may not expose the ChatGPT voice button. We report
launch separately from the unverified Voice session; no UI content is stored.
"""
from __future__ import annotations

def call_chatgpt_voice(bridge):
    state = bridge.status()
    if not state.get("online") or not state.get("paired"):
        return {"ok": False, "verified": False, "reply":
                "A ponte Android não está ligada. Não abri o ChatGPT."}
    if int(state.get("clientVersion", 0)) < 2:
        return {"ok": False, "verified": False, "reply":
                "A ponte Android precisa de suportar abertura de aplicações."}
    opened = bridge.request("open_app", args={"app": "chatgpt"}, seconds=12)
    if opened.get("ok") is not True or opened.get("verified") is not True:
        return {"ok": False, "verified": False, "voiceLiveVerified": False,
                "reply": "Não consegui confirmar a abertura do ChatGPT no Android."}
    observed = bridge.request("observe", seconds=6)
    if observed.get("ok") is not True or observed.get("verified") is not True or (
            observed.get("app") != "ChatGPT"):
        return {"ok": True, "verified": True, "voiceLiveVerified": False,
                "reply": "Abri o ChatGPT, mas não confirmei o ecrã de voz. Toca no botão Voz."}
    # Android AccessibilityService resolves exact visible labels; no blind taps,
    # coordinates or internal ChatGPT activities. The app foreground was checked.
    # Avoid the bare 'Voz'/'Voice' labels, which may open settings rather than call.
    targets = ("Iniciar conversa por voz", "Start voice conversation",
               "Start voice chat", "Iniciar modo de voz")
    for label in targets:
        tapped = bridge.request("tap_label", args={"target": label}, seconds=5)
        if tapped.get("ok") is True and tapped.get("accepted") is True:
            return {"ok": True, "verified": True, "voiceButtonPressed": True,
                    "voiceLiveVerified": False,
                    "reply": ("Abri o ChatGPT e acionei um controlo de voz identificado. "
                              "Confirma no ecrã se a chamada começou.")}
    return {"ok": True, "verified": True, "voiceButtonPressed": False,
            "voiceLiveVerified": False,
            "reply": ("Abri o ChatGPT, mas a aplicação não expôs um botão de voz "
                      "identificável à ponte Android. Toca no ícone Voz para começar.")}
'''

class Stop(RuntimeError):
    pass


def printline(key, obj):
    value = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    print(f"{key}={value}", flush=True)


def read(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 950_000:
        raise Stop("Ficheiro indisponível ou inseguro: " + path.name)
    return path.read_text(encoding="utf-8")


def request(url, data=None, timeout=4):
    started = time.monotonic()
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json", "Origin": BASE_URL}
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            value = json.load(response)
            return (response.status, value if isinstance(value, dict) else {})
    except urllib.error.HTTPError as exc:
        return exc.code, {}
    except (OSError, ValueError, TimeoutError) as exc:
        if url == BASE_URL + "/jarvis":
            printline("TRAVIS_CHATGPT_HTTP_FAILURE", {
                "exceptionType": type(exc).__name__,
                "elapsedMs": round((time.monotonic() - started) * 1000),
                "timeoutSeconds": timeout,
            })
        return 0, {}


def live():
    hcode, health = request(BASE_URL + "/health")
    bcode, bridge = request(BASE_URL + "/native-bridge/status", {})
    result = {
        "jarvisOnline": hcode == 200 and health.get("ok") is True
                        and health.get("service") == "jarvis",
        "jarvisBusy": health.get("busy") is True,
        "bridgeHttp": bcode,
        "bridgePaired": bridge.get("paired") is True,
        "bridgeOnline": bridge.get("online") is True,
        "clientVersion": bridge.get("clientVersion"),
    }
    printline("TRAVIS_CHATGPT_STATUS", result)
    return result


def check():
    state = live()
    if not state["jarvisOnline"] or state["jarvisBusy"]:
        raise Stop("Jarvis offline ou ocupado; não alterar nada")
    if state["bridgeHttp"] != 200 or not state["bridgeOnline"] or not state["bridgePaired"]:
        raise Stop("O Native Bridge não confirmou ligação e emparelhamento")
    if not isinstance(state["clientVersion"], int) or state["clientVersion"] < 2:
        raise Stop("Versão Android sem controlo de aplicações")
    code = read(JARVIS)
    # The active Jarvis exposes /native-bridge/ directly. Android intents
    # are delegated to /root/travis_artemis_bridge.py, which does NOT need
    # to be imported by name in jarvis_local.py. A previous check required
    # that unrelated literal and falsely rejected the healthy OPPO.
    if "travis_native_bridge" not in code or "/native-bridge/" not in code:
        raise Stop("A rota Native Bridge do Jarvis não é reconhecida; alteração recusada")
    art = read(ARTEMIS)
    if not all(v in art for v in ("travis_android_commands", "open_app", "travis_native_bridge")):
        raise Stop("O router Android atual não é compatível; alteração recusada")
    j = read(INTENTS)
    b = read(BROKER)
    if MARKER.exists():
        raise Stop("A instalação já tem marcador; verifica status ou rollback")
    new_intents, new_broker = staged(j, b)
    ast.parse(new_intents)
    ast.parse(new_broker)
    ast.parse(CALL_MODULE)
    printline("TRAVIS_CHATGPT_CHECK", {"ok": True, "patchable": True,
                                     "androidClientVersion": state["clientVersion"],
                                     "noFilesChanged": True})
    return new_intents, new_broker


def exactly(text, before, after, label):
    if text.count(before) != 1:
        raise Stop(f"Âncora incompatível em {label}: {text.count(before)} ocorrências")
    return text.replace(before, after, 1)


def staged(intent_source, broker_source):
    if FLAG in intent_source or FLAG in broker_source:
        raise Stop("A integração ChatGPT já existe ou está incompleta; revisão necessária")
    pattern = repr(VOICE_PATTERN)
    original = "    if not 1 < len(s) <= 700:\n        return None\n"
    changed = original + (
        f"    # {FLAG} — direct user request, no model or payment action.\n"
        f"    if re.fullmatch({pattern}, s, re.X):\n"
        '        return {"action": "open_app", "app": "chatgpt-voice"}\n'
    )
    new_intents = exactly(intent_source, original, changed, INTENTS.name)
    anchor = "        args = args or {}\n        if not self.allowed_command(kind, args):"
    replacement = (
        "        args = args or {}\n"
        f"        # {FLAG} — Android launch and optional exact voice-control tap.\n"
        '        if kind == "open_app" and args == {"app": "chatgpt-voice"}:\n'
        '            from travis_chatgpt_call import call_chatgpt_voice\n'
        '            return call_chatgpt_voice(self)\n'
        "        if not self.allowed_command(kind, args):"
    )
    new_broker = exactly(broker_source, anchor, replacement, BROKER.name)
    return new_intents, new_broker


def trial_parser(candidate):
    scope = {"__name__": "travis_android_commands_trial"}
    exec(compile(candidate, "<staged-android-intents>", "exec"), scope)
    func = scope["intent"]
    cases = {
        "Travis, call ChatGPT": ("open_app", "chatgpt-voice"),
        "Travis, chama o ChatGPT": ("open_app", "chatgpt-voice"),
        "Travis, inicia voz com ChatGPT": ("open_app", "chatgpt-voice"),
        "Travis, abre o YouTube": ("open_app", "youtube"),
        "Travis, paga uma conta": ("payment_denied", None),
    }
    for phrase, (action, app) in cases.items():
        result = func(phrase) or {}
        if result.get("action") != action or (app and result.get("app") != app):
            raise Stop("Falha de regressão: frase=" + phrase)


def atomic(path, data, mode):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise Stop("Alvo não regular: " + path.name)
    temp = path.with_name(path.name + ".new-chatgpt-" + str(os.getpid()))
    try:
        with temp.open("xb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        temp.chmod(mode)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def save():
    BACKUPS.mkdir(parents=True, exist_ok=True)
    directory = BACKUPS / ("travis-call-chatgpt-" + time.strftime("%Y%m%dT%H%M%S", time.gmtime()))
    directory.mkdir(mode=0o700, exist_ok=False)
    manifest = {"schema": 1, "files": [], "created": int(time.time())}
    for i, path in enumerate((INTENTS, BROKER, HANDOFF)):
        if path.exists() and path.is_symlink():
            raise Stop("Alvo é ligação simbólica: " + path.name)
        existed = path.is_file()
        mode = path.stat().st_mode & 0o777 if existed else 0o600
        raw = path.read_bytes() if existed else b""
        name = f"{i:02d}.original"
        if existed:
            atomic(directory / name, raw, 0o600)
        manifest["files"].append({"path": str(path), "existed": existed, "mode": mode,
                                 "sha256": hashlib.sha256(raw).hexdigest(),
                                 "backup": name})
    atomic(directory / "manifest.json", json.dumps(manifest).encode(), 0o600)
    return directory


def restore(directory):
    try:
        doc = json.loads((directory / "manifest.json").read_text())
    except (OSError, ValueError) as exc:
        raise Stop("Cópia de segurança ilegível") from exc
    if doc.get("schema") != 1 or len(doc.get("files", [])) != 3:
        raise Stop("Manifesto incompatível")
    for item, path in zip(doc["files"], (INTENTS, BROKER, HANDOFF)):
        if item["path"] != str(path):
            raise Stop("Manifesto contém alvo inesperado")
        if item["existed"]:
            blob = (directory / item["backup"]).read_bytes()
            if hashlib.sha256(blob).hexdigest() != item["sha256"]:
                raise Stop("Cópia de segurança corrompida")
            atomic(path, blob, item["mode"])
        else:
            path.unlink(missing_ok=True)


def reboot_router():
    ctl = shutil.which("jarvisctl")
    if not ctl:
        raise Stop("jarvisctl não encontrado")
    # The current Router is /root/jarvis_local.py (the customized Rust version).
    state = live()
    if not state["jarvisOnline"] or state["jarvisBusy"]:
        raise Stop("O Jarvis não está disponível para recarregar")
    result = subprocess.run([ctl, "reload"], capture_output=True,
                            text=True, timeout=45,
                            env={**os.environ, "JARVIS_SOURCE": str(HOME)})
    if result.returncode != 0:
        raise Stop("Recarregamento do Jarvis falhou (código " + str(result.returncode) + ")")
    for _ in range(12):
        hcode, health = request(BASE_URL + "/health")
        bcode, _ = request(BASE_URL + "/native-bridge/status", {})
        if hcode == 200 and health.get("service") == "jarvis" and health.get("ok") is True and bcode == 200:
            return
        time.sleep(0.5)
    raise Stop("O Jarvis não regressou com o Native Bridge disponível")


def apply():
    ci = check()
    trial_parser(ci[0])
    directory = save()
    printline("TRAVIS_CHATGPT_BACKUP", str(directory))
    atomic(MARKER, json.dumps({"backup": str(directory), "state": "installing"}).encode(), 0o600)
    try:
        for path, content in zip((INTENTS, BROKER, HANDOFF), (ci[0], ci[1], CALL_MODULE)):
            mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
            atomic(path, content.encode(), mode)
        for path in (INTENTS, BROKER, HANDOFF):
            ast.parse(read(path))
        reboot_router()
        status = live()
        if not status["jarvisOnline"] or status["bridgeHttp"] != 200:
            raise Stop("O Jarvis não passou na verificação final")
        atomic(MARKER, json.dumps({"backup": str(directory), "state": "active"}).encode(), 0o600)
        printline("TRAVIS_CHATGPT_INSTALLED", {"ok": True,
                                              "voiceIntent": "Travis, call ChatGPT",
                                              "androidApp": "existing-v5",
                                              "micAutoStop": False,
                                              "voiceSessionConfirmed": False,
                                              "runLiveTest": "Travis, call ChatGPT"})
    except Exception as exc:
        printline("TRAVIS_CHATGPT_REVERTING", {"errorType": type(exc).__name__})
        restore(directory)
        try:
            reboot_router()
        except Exception:
            printline("TRAVIS_CHATGPT_RECOVERY", "FILES_RESTORED_RELOAD_REQUIRES_ATTENTION")
        MARKER.unlink(missing_ok=True)
        raise


def rollback():
    if not MARKER.is_file():
        raise Stop("Nenhuma instalação gerida para reverter")
    doc = json.loads(MARKER.read_text())
    backup = Path(doc["backup"]).resolve()
    if BACKUPS.resolve() not in backup.parents:
        raise Stop("Caminho de backup não autorizado")
    state = live()
    if not state["jarvisOnline"] or state["jarvisBusy"]:
        raise Stop("O Jarvis não está livre; reversão adiada")
    restore(backup)
    reboot_router()
    MARKER.unlink(missing_ok=True)
    printline("TRAVIS_CHATGPT_ROLLBACK", {"ok": True})


def diagnostic():
    """Only inspect local configuration, no Android command or LLM inference."""
    import importlib.util
    state = live()
    if not state["jarvisOnline"]:
        raise Stop("Jarvis não responde na porta 8770")
    try:
        script = read(INTENTS)
        spec = importlib.util.spec_from_file_location("travis_call_parser_check", str(INTENTS))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        sample = module.intent("Travis, call ChatGPT") or {}
        sample_open = module.intent("Travis, abre o ChatGPT") or {}
        probe = {
            "androidParser": sample.get("action"),
            "androidParserApp": sample.get("app"),
            "existingOpenApp": sample_open.get("action") == "open_app",
            "parserHasHandoff": FLAG in script,
        }
    except (OSError, ValueError, RuntimeError, ImportError, SyntaxError) as exc:
        probe = {"errorType": type(exc).__name__}
    bridge_script = read(BROKER)
    artemis_script = read(ARTEMIS)
    server = read(JARVIS)
    printline("TRAVIS_CHATGPT_ROUTE_DIAGNOSTIC", {
        **probe,
        "brokerHandoff": FLAG in bridge_script and "call_chatgpt_voice(self)" in bridge_script,
        "artemisUsesAndroidParser": "travis_android_commands.intent" in artemis_script,
        "artemisRecognizesAndroidAction": (
            "android_control" in artemis_script and "open_app" in artemis_script),
        "jarvisUsesArtemis": "travis_artemis_bridge" in server,
        "jarvisHasNativeRoute": "/native-bridge/" in server,
        "installManaged": MARKER.is_file(),
        "handoffModule": HANDOFF.is_file(),
        "noFilesChanged": True,
    })


def demo():
    state = live()
    if not state["jarvisOnline"] or not state["bridgeOnline"]:
        raise Stop("Jarvis ou ponte Android indisponível")
    if not MARKER.is_file():
        raise Stop("Integração ainda não instalada")
    started = time.monotonic()
    status, data = request(BASE_URL + "/jarvis", {
        "text": "Travis, call ChatGPT", "language": "pt",
    }, timeout=55)
    result = data.get("result") if isinstance(data.get("result"), dict) else {}
    printline("TRAVIS_CHATGPT_LIVE", {
        "http": status, "ok": data.get("ok"), "tool": data.get("tool"),
        "verified": result.get("verified"),
        "voiceLiveVerified": result.get("voiceLiveVerified"),
        "elapsedMs": round((time.monotonic() - started) * 1000),
        "transportConfirmed": status == 200,
    })
    if status != 200:
        raise Stop("Não foi possível confirmar resposta da rota /jarvis; não atribuir sucesso à chamada")


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in {"check", "apply", "status", "rollback", "call", "diagnose"}:
        print("Uso: travis-chatgpt-call.py check|apply|status|rollback|call|diagnose")
        return 2
    try:
        action = sys.argv[1]
        if action == "check": check()
        elif action == "apply": apply()
        elif action == "status":
            live()
            printline("TRAVIS_CHATGPT_INSTALL_STATUS", {
                "installed": MARKER.is_file(),
                "handoffModule": HANDOFF.is_file(),
                "voiceIntent": "Travis, call ChatGPT",
            })
        elif action == "rollback": rollback()
        elif action == "diagnose": diagnostic()
        else: demo()
        return 0
    except Stop as exc:
        printline("TRAVIS_CHATGPT_BLOCKED", str(exc))
        return 1
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        printline("TRAVIS_CHATGPT_ERROR", {"type": type(exc).__name__})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
