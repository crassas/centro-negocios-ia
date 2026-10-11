import ast
import json
import os
import select
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from travis_resources import IdleWorkerPool, idle_timeout


class ResourceTests(unittest.TestCase):
    def worker(self):
        worker=SimpleNamespace(lock=threading.RLock(),last_used=0,process=SimpleNamespace(poll=lambda:None))
        def stop():worker.process=None
        worker.stop=stop
        return worker

    def test_locked_inference_is_never_evicted(self):
        worker=self.worker();entered=threading.Event();release=threading.Event()
        def inference():
            with worker.lock:
                entered.set();release.wait(3)
                worker.last_used=200
        thread=threading.Thread(target=inference);thread.start();self.assertTrue(entered.wait(1))
        pool=IdleWorkerPool({'voice':worker},clock=lambda:200,idle_seconds=60)
        try:
            self.assertEqual(pool.sweep(),[])
            self.assertIsNotNone(worker.process)
        finally:release.set();thread.join(2)
        self.assertEqual(pool.sweep(),[],'completion starts a fresh idle grace period')

    def test_only_old_workers_release_and_errors_do_not_block_other_workers(self):
        old=self.worker();recent=self.worker();recent.last_used=180
        broken=self.worker()
        def fail():raise OSError('test')
        broken.stop=fail
        pool=IdleWorkerPool({'broken':broken,'old':old,'recent':recent},clock=lambda:200,idle_seconds=60)
        self.assertEqual(pool.sweep(),['old']);self.assertIsNotNone(recent.process)
        self.assertEqual(pool.errors,{'broken':'OSError'})
        self.assertEqual(pool.sweep(),[],'already sleeping workers are not stopped twice')

    def test_policy_bounds_and_bad_configuration(self):
        self.assertEqual(idle_timeout('broken'),180)
        self.assertEqual(idle_timeout(-1),60)
        self.assertEqual(idle_timeout(90000),3600)

    def test_real_worker_request_lock_and_restart_contract(self):
        # Execute the production VoiceWorker methods with an inexpensive JSON subprocess.
        # This tests pipe cleanup, lock ownership and lazy restart, not speech recognition.
        source=Path(__file__).with_name('jarvis_local.py').read_text()
        cls=next(n for n in ast.parse(source).body if isinstance(n,ast.ClassDef) and n.name=='VoiceWorker')
        env={'Path':Path,'threading':threading,'time':time,'json':json,'os':os,
             'select':select,'subprocess':subprocess,'INFERENCE_INFO':threading.local()}
        exec(compile(ast.Module(body=[cls],type_ignores=[]),'VoiceWorker','exec'),env)
        class Worker(env['VoiceWorker']):
            def start(self):
                self.last_used=time.monotonic()
                if self.process is not None and self.process.poll() is None:return
                self.process=subprocess.Popen(['python3','-u','-c','import sys; [print(line.strip(), flush=True) for line in sys.stdin]'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
                self.buffer=b''
        worker=Worker('test')
        try:
            self.assertEqual(json.loads(worker.request({'first':1})),{'first':1});first=worker.process.pid
            pool=IdleWorkerPool({'test':worker},clock=lambda:worker.last_used+61,idle_seconds=60)
            self.assertEqual(pool.sweep(),['test']);self.assertIsNone(worker.process)
            self.assertEqual(json.loads(worker.request({'second':2})),{'second':2})
            self.assertNotEqual(worker.process.pid,first)
        finally:worker.stop()

if __name__=='__main__':unittest.main()
