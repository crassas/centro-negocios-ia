#!/usr/bin/env python3
"""Two-hour real local health observation. No inference in the monitor."""
import json,time
import jarvis_local as j
start=time.time();samples=[];deadline=start+7200
while True:
 state=j.doctor()
 sample={"at":time.time(),"centro":bool(state["centro"].get("ok")),"router":bool(state["router"].get("ok")),"sqlite":state["sqlite"],"ram_available_mb":state["ram_available_mb"],"llm_calls":state["llm_calls"]}
 samples.append(sample)
 complete=time.time()>=deadline
 result={"start":start,"complete":complete,"samples":samples,"passed":complete and all(s["centro"] and s["router"] and s["sqlite"]=="ok" for s in samples)}
 (j.ROOT/"soak-proof.json").write_text(json.dumps(result,indent=2))
 if complete:break
 time.sleep(30)
