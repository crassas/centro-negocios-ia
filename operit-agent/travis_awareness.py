"""Observed operational self-knowledge for Travis, never a claim of consciousness.

Registration means code exists; it does not prove the external service works.
Snapshots contain no tokens, private memory bodies or personal email content.
"""
from __future__ import annotations
import copy
import json
import time
import urllib.request
from pathlib import Path
from threading import RLock

_LOCK = RLock()
_CACHE = {"at": 0.0, "data": None}

def _check(url, timeout=.45):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            data = json.load(response)
        return bool(data.get("ok") is True or data.get("status") == "ok")
    except (OSError, ValueError, TimeoutError):
        return False

def _file_has(path, needle):
    try:
        path = Path(path)
        return path.is_file() and needle in path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return False

def _feature(id, label_pt, label_en, state, evidence, caution=""):
    return {"id": id, "title_pt": label_pt, "title_en": label_en,
            "state": state, "evidence": evidence, "caution": caution}

def fresh_state(path, timestamp, max_age=90, clock=time.time):
    """A stale watcher receipt cannot establish a current connection."""
    try:
        path = Path(path)
        if path.stat().st_size > 65536:
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        age = float(clock()) - float(data[timestamp])
        return data if 0 <= age <= max_age else {}
    except (OSError, ValueError, TypeError, KeyError):
        return {}

def integration_status(home, check=_check, clock=time.time):
    """Bounded local evidence; never open a camera or request an external feed."""
    home = Path(home)
    station = fresh_state(home/".centro-station/status.json", "timestamp", clock=clock)
    world = fresh_state(home/".centro-extensions/travis-world-status.json", "checkedEpoch", clock=clock)
    globe = fresh_state(home/".local/state/travis-gev/watch-status.json", "lastCheckEpoch", clock=clock)
    cctv = world.get("cctv") if isinstance(world.get("cctv"), dict) else {}
    claw = station.get("openclaw") if isinstance(station.get("openclaw"), dict) else {}
    rows = [
        _feature("supervisor", "Recuperação automática", "Automatic recovery",
                 "observed_online" if station.get("ok") is True else "unknown",
                 "Estado recente do supervisor" if station else "Sem estado recente do supervisor"),
        _feature("gods_eye", "God's Eye", "God's Eye",
                 "observed_online" if globe.get("enabled") is True and globe.get("healthy") is True else "unknown",
                 "Resposta local observada pelo supervisor" if globe else "Sem observação recente",
                 "Não comprova a renderização no navegador nem a atualização de cada fonte"),
        _feature("public_cameras", "Serviço de câmaras públicas", "Public camera service",
                 "observed_online" if cctv.get("healthy") is True else "unknown",
                 "Estado recente do gateway CCTV" if world else "Sem observação recente",
                 "Cada imagem ou vídeo requer confirmação própria de disponibilidade e data"),
        _feature("roads", "Serviço de trânsito", "Road observation service",
                 "service_online" if check("http://127.0.0.1:4187/api/road-live/status") else "unknown",
                 "Verificação da rota local de trânsito",
                 "Não comprova medições atuais; não representa posições reais de todos os carros"),
    ]
    return {"observedAt": float(clock()), "features": rows,
            "openclawDisabled": claw.get("state") == "disabled-by-operator",
            "sourceUpdatesHeld": (home/".centro-station/maintenance").is_file()}

def build(*, registry, brain, store, ui_root, model_root, repo_root, projects,
          gmail=None, quantum=None, planner_enabled=False, check=_check, clock=time.time):
    now = float(clock())
    entries = registry.get("capabilities") or []
    ids = {e.get("id") for e in entries if isinstance(e, dict)}
    brain_state = brain.status()
    stored = store.health()
    root = Path(ui_root)
    model_root = Path(model_root)
    repo_root = Path(repo_root)
    graph_ready = (
        _file_has(root/"travis-brain-view.mjs", "createKnowledgeGraph")
        and _file_has(root/"travis-knowledge-graph.mjs", "local-sqlite")
        and _file_has(root/"travis-brain-panel.mjs", "fetch('/brain/graph'")
        and _file_has(root/"travis-3d.mjs", "createNeuralField")
    )
    particles = graph_ready and _file_has(root/"travis-brain-view.mjs", "uDissolve")
    camera_ready = (
        _file_has(root/"travis-3d.mjs", "createTravisVision")
        and _file_has(root/"travis-vision.mjs", "mediaDevices")
        and (root/"travis-vision-policy.mjs").is_file()
    )
    language_ready = (model_root/"tts/pt_PT-tugao-medium.onnx").is_file() and (model_root/"tts/en_GB-northern_english_male-medium.onnx").is_file()
    stt_installed = (model_root/"stt/ggml-base.bin").is_file()
    llm_online = bool(check("http://127.0.0.1:8771/health"))
    centro_online = bool(check("http://127.0.0.1:8765/health"))
    gmail = gmail or {}
    quantum = quantum or {}
    memory_ok = bool(stored.get("ok"))
    counts = brain_state.get("counts") or {}
    learning = brain_state.get("learning") or {}
    repo_count = sum((repo_root/name).is_dir() for name in projects.values())
    features = [
        _feature("runtime", "Registo de ferramentas", "Tool registry", "registered", f"{len(ids)} rotas de ferramenta no código", "Registada não significa ligada ou testada"),
        _feature("memory", "Memória e ligações persistentes", "Persistent memory and links", "verified" if memory_ok else "unknown", f"{stored.get('neurons',0)} memórias, {stored.get('synapses',0)} relações na base SQLite"),
        _feature("particle_brain", "Cérebro de partículas e grafo 3D", "Particle brain and 3D graph", "installed_unverified" if particles else "unavailable", "Ficheiros do motor e ligação à base de dados inspecionados" if particles else "Integração visual incompleta", "O aspeto visual no ecrã não foi comprovado por esta consulta"),
        _feature("reflection", "Reflexão e ciclos de repouso", "Reflection and idle cycles", "verified" if brain_state.get("automatic") else "paused" if brain_state.get("paused") else "installed_unverified", f"{counts.get('cycles',0)} ciclos registados; fase {brain_state.get('phase','unknown')}"),
        _feature("learning", "Aprendizagem por resultados", "Outcome-based learning", "verified" if learning.get("observedRuns",0)>0 else "installed_unverified" if learning.get("algorithm") else "unavailable", f"{learning.get('observedRuns',0)} usos avaliados, {learning.get('feedbackEvents',0)} feedbacks", ""),
        _feature("voice", "Voz em português e inglês", "Portuguese and English voice", "installed_unverified" if language_ready and stt_installed else "unavailable", "Modelos de voz PT/EN e reconhecimento local encontrados" if language_ready and stt_installed else "Faltam modelos de voz"),
        _feature("local_model", "Modelo de linguagem local", "Local language model", "verified" if llm_online else "unavailable", "Resposta ao health check do serviço 8771" if llm_online else "O serviço 8771 não respondeu"),
        _feature("vision", "Câmara e interpretação visual", "Camera and visual interpretation", "permission_required" if camera_ready else "unavailable", "Módulo visual instalado" if camera_ready else "Módulo visual não confirmado", "A câmara só pode ser usada com permissão do utilizador"),
        _feature("web", "Pesquisa e páginas da internet", "Web research and pages", "registered" if {"web_research","web_read"}.issubset(ids) else "unavailable", "Ferramentas de pesquisa registadas; resultados dependem da rede"),
        _feature("projects", "Repositórios e Centro de Negócios", "Repositories and business centre", "verified" if centro_online else "installed_unverified" if repo_count else "unavailable", f"{repo_count} diretórios locais, serviço Centro {'responde' if centro_online else 'não confirmado'}"),
        _feature("editing", "Alterações ao código", "Code editing", "registered" if "repo_change" in ids and planner_enabled else "unavailable", "Executor registado, planeador ativado" if planner_enabled else "Planeador de alterações não autorizado", "Cada operação exige execução e validação; não é automática"),
        _feature("quantum", "Orquestração Quantum", "Quantum orchestration", "verified" if quantum.get("ok") else "unavailable", "Runtime verificado" if quantum.get("ok") else "Runtime não confirmado", "O estado de desenvolvimento e o estado canónico podem diferir"),
        _feature("gmail", "Leitura do Gmail", "Gmail read access", "authorization_saved" if gmail.get("authorized") else "requires_configuration" if not gmail.get("configured") else "permission_required", "Token OAuth guardado" if gmail.get("authorized") else "Configuração de autorização pendente", "Token guardado não comprova acesso atual à caixa"),
    ]
    integrations = integration_status(root.parent, check=check, clock=clock)
    features.extend(integrations["features"])
    return {
        "ok": True, "kind": "operational-awareness", "version": 2,
        "observedAt": now, "registeredTools": len(ids),
        "toolIds": sorted(x for x in ids if isinstance(x,str)),
        "features": features,
        "integrations": integrations,
        "memory": {"neurons": stored.get("neurons",0), "synapses":stored.get("synapses",0),
                   "episodes":counts.get("episodes",0),"cycles":counts.get("cycles",0),
                   "feedbackEvents":learning.get("feedbackEvents",0)},
        "limits": ["registration_is_not_execution", "visual_render_not_verified",
                   "permission_required_for_camera_and_accounts", "consciousness_not_established"],
        "consciousness": "not_established",
        "source": "registry+sqlite+local-file-checks+local-health",
    }

def snapshot(**kwargs):
    # Bounded small cache; failures are not silently converted into success.
    now=time.monotonic()
    with _LOCK:
        if _CACHE["data"] is not None and now-_CACHE["at"]<12:
            return copy.deepcopy(_CACHE["data"])
    data=build(**kwargs)
    with _LOCK:
        _CACHE.update(at=now,data=copy.deepcopy(data))
    return data

def reply(data, language="pt"):
    pt = language == "pt"
    features = {r["id"]: r for r in data.get("features", [])}
    m = data.get("memory", {})
    n, links, cycles = m.get("neurons",0),m.get("synapses",0),m.get("cycles",0)
    vision_ready = features.get("vision",{}).get("state") != "unavailable"
    linked = [features[name]["title_pt" if pt else "title_en"] for name in
              ("quantum", "gods_eye", "public_cameras", "roads")
              if features.get(name,{}).get("state") in {"verified", "observed_online", "service_online"}]
    if pt:
        parts = [
            f"Tenho {n} memórias, {links} ligações e {cycles} ciclos de reflexão registados.",
            "Uso os resultados das tarefas e o teu feedback para melhorar as próximas decisões."
        ]
        if vision_ready:parts.append("Com a câmara ligada, acompanho rostos, gestos e objetos reconhecidos.")
        if linked:parts.append("Serviços observados: "+", ".join(linked)+". Cada fonte requer confirmação própria.")
        return " ".join(parts)
    parts = [
        f"I have {n} stored memories, {links} links and {cycles} recorded reflection cycles.",
        "I learn from recorded task outcomes and feedback to improve future decisions."
    ]
    if vision_ready:parts.append("With the camera on, I can track faces, gestures and recognized objects.")
    if linked:parts.append("Observed services: "+", ".join(linked)+". Each feed still needs its own verification.")
    return " ".join(parts)

def model_facts(data):
    states = {f["id"]:f["state"] for f in data.get("features",[])}
    m=data.get("memory",{})
    links = "; ".join(("quantum_software" if name=="quantum" else name)+"="+states.get(name,"unknown") for name in
                      ("quantum", "gods_eye", "public_cameras", "roads", "voice"))
    return (f"Observed Travis: memory={m.get('neurons',0)}, links={m.get('synapses',0)}, "
            f"cycles={m.get('cycles',0)}. "+links+". "
            "Service online does not prove a live feed or completed action. "
            "Devices need current browser observations. Quantum names software, not quantum hardware. "
            "No consciousness or model-weight learning is established.")
