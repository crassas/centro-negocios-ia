"""Exercise real concurrent shell starts against isolated fake services."""
import os,subprocess,tempfile,time,signal
from pathlib import Path
source=Path(__file__).with_name('stationctl.sh').read_text()
with tempfile.TemporaryDirectory(prefix='station-control-') as folder:
 root=Path(folder);state=root/'.centro-station';state.mkdir()
 mock=root/'ctl';mock.write_text('#!/bin/sh\nexit 0\n');mock.chmod(0o700)
 start=source.index('SERVER_CTL="$(pick_ctl centroserver)"');end=source.index('\nmkdir -p',start)
 source=source[:start]+''.join(f'{name}="{mock}"\n' for name in ('SERVER_CTL','AGENT_CTL','OPENCLAW_CTL','LAYA_CTL'))+source[end:]
 ctl=root/'centrostation';ctl.write_text(source);ctl.chmod(0o700)
 supervisor=root/'centro_station.py'
 supervisor.write_text('''import fcntl,os,time
from pathlib import Path
root=Path(__file__).parent/'.centro-station'
lock=(root/'supervisor.lock').open('a+')
try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit(0)
(root/'supervisor.pid').write_text(str(os.getpid()))
while True:
 (root/'heartbeat').write_text(str(time.time()))
 time.sleep(.1)
''')
 env={**os.environ,'HOME':folder};owner=None
 try:
  starts=[subprocess.Popen([str(ctl),'start'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT) for _ in range(2)]
  outputs=[p.communicate(timeout=15)[0].decode() for p in starts]
  assert all(p.returncode==0 for p in starts),outputs
  owner=int((state/'supervisor.pid').read_text());os.kill(owner,0)
  (state/'supervisor.pid').unlink()
  out=subprocess.check_output([str(ctl),'start'],env=env,timeout=10).decode()
  assert int((state/'supervisor.pid').read_text())==owner,out
  (state/'supervisor.pid').write_text(str(os.getpid()))
  subprocess.check_output([str(ctl),'status'],env=env,timeout=5)
  assert int((state/'supervisor.pid').read_text())==owner
  print('PASS station: concurrent starts keep one owner; missing PID adopted; unrelated PID rejected')
 finally:
  if owner:
   try:os.kill(owner,signal.SIGTERM)
   except ProcessLookupError:pass
