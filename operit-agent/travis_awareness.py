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
        _feature("learning", "Aprendizagem por resultados", "Outcome-based learning", "verified" if learning.get("observedRuns",0)>0 else "installed_unverified" if learning.get("algorithm") else "unavailable", f"{learning.get('observedRuns',0)} usos avaliados, {learning.get('feedbackEvents',0)} feedbacks", "Os pesos do modelo base não são alterados"),
        _feature("voice", "Voz em português e inglês", "Portuguese and English voice", "installed_unverified" if language_ready and stt_installed else "unavailable", "Modelos de voz PT/EN e reconhecimento local encontrados" if language_ready and stt_installed else "Faltam modelos de voz"),
        _feature("local_model", "Modelo de linguagem local", "Local language model", "verified" if llm_online else "unavailable", "Resposta ao health check do serviço 8771" if llm_online else "O serviço 8771 não respondeu"),
        _feature("vision", "Câmara e interpretação visual", "Camera and visual interpretation", "permission_required" if camera_ready else "unavailable", "Módulo visual instalado" if camera_ready else "Módulo visual não confirmado", "A câmara só pode ser usada com permissão do utilizador"),
        _feature("web", "Pesquisa e páginas da internet", "Web research and pages", "registered" if {"web_research","web_read"}.issubset(ids) else "unavailable", "Ferramentas de pesquisa registadas; resultados dependem da rede"),
        _feature("projects", "Repositórios e Centro de Negócios", "Repositories and business centre", "verified" if centro_online else "installed_unverified" if repo_count else "unavailable", f"{repo_count} diretórios locais, serviço Centro {'responde' if centro_online else 'não confirmado'}"),
        _feature("editing", "Alterações ao código", "Code editing", "registered" if "repo_change" in ids and planner_enabled else "unavailable", "Executor registado, planeador ativado" if planner_enabled else "Planeador de alterações não autorizado", "Cada operação exige execução e validação; não é automática"),
        _feature("quantum", "Orquestração Quantum", "Quantum orchestration", "verified" if quantum.get("ok") else "unavailable", "Runtime verificado" if quantum.get("ok") else "Runtime não confirmado", "O estado de desenvolvimento e o estado canónico podem diferir"),
        _feature("gmail", "Leitura do Gmail", "Gmail read access", "authorization_saved" if gmail.get("authorized") else "requires_configuration" if not gmail.get("configured") else "permission_required", "Token OAuth guardado" if gmail.get("authorized") else "Configuração de autorização pendente", "Token guardado não comprova acesso atual à caixa"),
    ]
    return {
        "ok": True, "kind": "operational-awareness", "version": 1,
        "observedAt": now, "registeredTools": len(ids),
        "toolIds": sorted(x for x in ids if isinstance(x,str)),
        "features": features,
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
    pt=language=="pt"
    by_id={x["id"]:x for x in data.get("features",[])}
    def state(key):
        return by_id.get(key,{}).get("state","unknown")
    memory=data.get("memory",{})
    if pt:
        parts=[
            f"Consultei agora as minhas capacidades: {data.get('registeredTools',0)} ferramentas registadas, não necessariamente todas operacionais.",
            f"Memória real: {memory.get('neurons',0)} nós e {memory.get('synapses',0)} ligações. Reflexão: {memory.get('cycles',0)} ciclos registados.",
            "O cérebro de partículas e o grafo 3D estão instalados; a apresentação visual requer confirmação no ecrã." if state("particle_brain")=="installed_unverified" else "Não consegui confirmar o cérebro de partículas.",
            "A aprendizagem usa resultados e feedback, mas não altera os pesos do modelo base.",
            "O modelo local está online." if state("local_model")=="verified" else "O modelo local não respondeu à verificação.",
            "A câmara exige a tua autorização." if state("vision")=="permission_required" else "Não confirmei o módulo da câmara.",
            "Tenho consciência operacional das minhas funções, não consciência subjetiva demonstrada."
        ]
    else:
        parts=[
            f"I checked my current capabilities: {data.get('registeredTools',0)} registered tools, not all necessarily working.",
            f"Persisted memory: {memory.get('neurons',0)} nodes and {memory.get('synapses',0)} links. Reflection: {memory.get('cycles',0)} recorded cycles.",
            "The particle brain and 3D graph are installed, but their appearance still needs an on-screen check." if state("particle_brain")=="installed_unverified" else "I could not confirm the particle brain.",
            "Outcome-based learning uses results and feedback; it does not retrain the base model.",
            "The local language model is online." if state("local_model")=="verified" else "The local language model did not respond.",
            "Camera access requires your permission." if state("vision")=="permission_required" else "I could not confirm the camera module.",
            "This is operational self-knowledge, not demonstrated subjective consciousness."
        ]
    return " ".join(parts)

def model_facts(data):
    status={x["id"]:x["state"] for x in data.get("features",[])}
    m=data.get("memory",{})
    return (
        "VERIFIED LOCAL TRAVIS SELF-KNOWLEDGE: "
        f"{data.get('registeredTools',0)} registered routes (not guaranteed usable); "
        f"SQLite memories={m.get('neurons',0)}, synapses={m.get('synapses',0)}, "
        f"reflection cycles={m.get('cycles',0)}; "
        "visual particle brain="+status.get("particle_brain","unknown")+"; "
        "local model="+status.get("local_model","unknown")+"; "
        "camera="+status.get("vision","unknown")+" (requires permission); "
        "Gmail="+status.get("gmail","unknown")+"; "
        "learning=outcome feedback, not weight updates. "
        "Treat status labels as evidence boundaries. Do not claim consciousness."
    )
