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
    assert not server.OPENCLAW_ENABLED and not station.OPENCLAW_AUTOSTART
    def forbidden_probe(*args, **kwargs):
        raise AssertionError("disabled OpenClaw must never contact the gateway")
    old_urlopen = server.urllib.request.urlopen
    server.urllib.request.urlopen = forbidden_probe
    try:
        assert server.openclaw_http_health()[0] is False
        assert station.openclaw_healthy() is False
        for action in ("openclaw_query", "openclaw_models", "fault_openclaw_recovery"):
            assert server.execute_action({"action": action})["exitCode"] == 78
        assert not any("openclaw" in action for action in server.capabilities()["actions"])
    finally:
        server.urllib.request.urlopen = old_urlopen
    print("OK disabled OpenClaw has no execution, health probes or advertised actions")
    for path in ("src/.env", "config/.env.production", "nested/.git/config", "./.env"):
        assert server.protected_repo_path(path), path
    with tempfile.TemporaryDirectory() as tmp:
        root=Path(tmp)
        old_home = station.HOME
        station.HOME = root
        for pid, command, output in (
            (11, b"openclaw\0gateway", str(root/".centro-openclaw/gateway.log")),
            (12, b"openclaw\0gateway", "/some/external/log"),
            (13, b"python\0unrelated.py", str(root/".centro-openclaw/gateway.log")),
            (14, b"openclaw-gateway\0", str(root/".centro-openclaw/gateway.log")),
        ):
            entry=root/"proc"/str(pid)
            (entry/"fd").mkdir(parents=True)
            (entry/"cmdline").write_bytes(command)
            (entry/"fd/1").symlink_to(output)
        assert set(station.centro_openclaw_processes(root/"proc")) == {11,14}
        station.HOME = old_home
        print("OK OpenClaw cleanup excludes external processes and unrelated commands")
        saved = (server.HOME, server.run_cmd, server.pid_running, server.laya_http_health)
        server.HOME = root
        ctl=root/".local/bin/layactl"
        ctl.parent.mkdir(parents=True)
        ctl.touch()
        calls=[]
        def stopped_ctl(args, **kwargs):
            calls.append(args[-1])
            return {"exitCode":0,"stdout":"stopped","stderr":""}
        server.run_cmd = stopped_ctl
        health=iter([True,False,True])
        server.laya_http_health=lambda:(next(health),None,None,None)
        pids=iter([(True,77),(True,88)])
        server.pid_running=lambda path:next(pids)
        result=server.action_fault_laya_recovery({})
        assert result["exitCode"]==0 and "oldPid=77 newPid=88" in result["stdout"]
        assert calls == ["stop"], "test must not start service to manufacture recovery"
        calls.clear()
        server.laya_http_health=lambda:(True,None,None,None)
        server.pid_running=lambda path:(True,77)
        assert server.action_fault_laya_recovery({})["exitCode"]==1
        assert calls==["stop"], "no-op stop must fail the test"
        server.HOME, server.run_cmd, server.pid_running, server.laya_http_health = saved
        print("OK service recovery requires actual outage and changed PID; manual start cannot pass")
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
        original_save=agent.save_outbox
        save_calls=[]
        def unreliable_save(payload):
            save_calls.append(payload["id"])
            if len(save_calls)==1:
                raise OSError(38,"PRoot transient filesystem failure")
            original_save(payload)
        agent.save_outbox=unreliable_save
        executed.clear();delivered.clear()
        try:agent.work_once("dummy")
        except OSError:pass
        else:raise AssertionError("expected filesystem failure")
        assert agent.PENDING_RESULT["id"]=="test-delivery"
        assert agent.work_once("dummy")
        assert executed==["test-delivery"] and delivered==["test-delivery"]
        assert agent.PENDING_RESULT is None and not agent.OUTBOX_FILE.exists()
        agent.save_outbox=original_save
        print("OK filesystem retry retains result without pulling or re-executing")

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
