#!/usr/bin/env python3
"""Run real inference and preserve device evidence outside Git."""
import importlib.util,json,time
from pathlib import Path
s=importlib.util.spec_from_file_location("jarvis",Path(__file__).with_name("jarvis_local.py"));j=importlib.util.module_from_spec(s);s.loader.exec_module(j)
results={"started_at":time.time(),"device":"aarch64","models":[]}
for model in ["small","main"]:
 row={"model":model,"ram_available_before_mb":j.memory_mb()}
 try:
  j.llm_start(model);start=time.monotonic()
  row["answer"]=j.infer("Responde apenas LOCAL_OK")
  row["latency_ms"]=int((time.monotonic()-start)*1000)
  row["ram_available_loaded_mb"]=j.memory_mb()
  row["portuguese"]=j.infer("O site não responde, há uma tarefa vencida e uma melhoria estética. Qual deve ser a prioridade? Responde numa frase.")
  row["json"]=json.loads(j.infer('Devolve {"tool":"system_status","args":{}}',json_mode=True))
  row["passed"]="LOCAL_OK" in row["answer"] and isinstance(row["json"],dict)
 except Exception as exc:row["passed"]=False;row["error"]=j.clean(str(exc))
 finally:j.llm_stop()
 results["models"].append(row)
 (j.ROOT/"benchmark.json").write_text(json.dumps(results,ensure_ascii=False,indent=2))
 print(json.dumps(row,ensure_ascii=False),flush=True)
j.llm_start("small")
