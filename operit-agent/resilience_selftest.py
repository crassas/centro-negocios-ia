#!/usr/bin/env python3
"""Regression tests for bounded execution, protected paths and durable delivery."""
import importlib.util
import json
import os
import tempfile
import time
from pathlib import Path

def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name+".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def main():
    server, agent, station = (load(n) for n in ("centro_server","centro_agent","centro_station"))
    for path in ("src/.env", "config/.env.production", "nested/.git/config", "./.env"):
        assert server.protected_repo_path(path), path
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp)
        pidfile=root/"child.pid"
        stopped=root/"child.stopped"
        child_code="import os,time,signal,sys;signal.signal(signal.SIGTERM,lambda *a:(open("+repr(str(stopped))+",'w').write('terminated'),sys.exit(0)));open("+repr(str(pidfile))+",'w').write(str(os.getpid()));time.sleep(60)"
        parent_code="import subprocess,sys,time;subprocess.Popen([sys.executable,'-c',"+repr(child_code)+"]);time.sleep(60)"
        import sys
        t=time.monotonic()
        result=server.run_cmd([sys.executable,"-c",parent_code],timeout=1)
        assert result["exitCode"]==124 and time.monotonic()-t<8,result
        assert stopped.exists(), "descendant did not receive executor group termination"
        print("OK timeout terminates executor process group")
        server.EXECUTION_STATE.deadline=time.monotonic()+0.3
        t=time.monotonic()
        result=server.run_cmd_retry([sys.executable,"-c","import time;time.sleep(30)"],timeout=60,attempts=99,delay=0)
        assert result["exitCode"]==124 and time.monotonic()-t<4
        server.EXECUTION_STATE.deadline=float("inf")
        print("OK shared deadline and retry bound")
        agent.STATE_DIR=root/"agent";agent.OUTBOX_FILE=agent.STATE_DIR/"result-outbox.json"
        executed=[]; delivered=[]; failed=[False]
        def execute(task):
            executed.append(task["id"]);return 0,"ok","",10
        def api(path,**kwargs):
            if path.endswith("/pull"):
                return {"task":{"id":"test-delivery","action":"system_info"}}
            delivered.append(kwargs["payload"]["id"])
            if not failed[0]:
                failed[0]=True
                raise TimeoutError("simulated lost network response")
            return {"ok":True}
        agent.execute=execute;agent.api=api
        try:agent.work_once("dummy")
        except TimeoutError:pass
        else:raise AssertionError("expected injected failure")
        assert agent.OUTBOX_FILE.exists()
        assert (agent.OUTBOX_FILE.stat().st_mode & 0o777)==0o600
        assert agent.work_once("dummy")
        assert executed==["test-delivery"] and len(delivered)==2 and not agent.OUTBOX_FILE.exists()
        print("OK outbox survives upload failure without re-execution")
        station.SERVER_BUSY_FILE=root/"busy.json"
        station.SERVER_BUSY_FILE.write_text(json.dumps({"pid":os.getpid(),"startedAt":time.time()-1000}))
        assert station.server_stale() and not station.server_busy()
        station.SERVER_BUSY_FILE.write_text(json.dumps({"pid":os.getpid(),"startedAt":time.time()}))
        assert not station.server_stale() and station.server_busy()
        print("OK stale execution recovery preserves active execution")
        old=server.OLLAMA_AUTH_CACHE.copy()
        server.OLLAMA_AUTH_CACHE.update(at=time.monotonic(),ok=False,detail="Ollama HTTP 401; credencial recusada",
            keyHash=__import__("hashlib").sha256(b"dummy").hexdigest())
        assert not server.ollama_auth_check("dummy")[0]
        server.OLLAMA_AUTH_CACHE.update(old)
        print("OK rejected credential circuit breaker")
        original_http=server.http_json
        def denied(url, **kwargs):
            assert url.endswith('/api/chat'), 'credential probe must test actual inference'
            raise server.urllib.error.HTTPError(url,401,'Unauthorized',{},None)
        server.http_json=denied
        assert server.ollama_auth_check('invalid-key')[0] is False
        server.http_json=lambda *a,**k:(200,{'ok':True,'model':'test-model','answer':'CENTRO_OK'})
        assert server.readonly_cloud_fallback('probe','denied')['exitCode']==0
        server.http_json=lambda *a,**k:(200,{'ok':True,'model':'fallback-local','answer':'unavailable'})
        assert server.readonly_cloud_fallback('probe','denied')['exitCode']!=0
        server.http_json=original_http
        server.OLLAMA_AUTH_CACHE.update(old)
        print('OK inference authentication and real model fallback validation')
    print("resilience_selftest: OK")
if __name__=="__main__":main()
