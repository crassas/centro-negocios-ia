import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import ast
import threading

import travis_workflow as w

STEPS=[{'tool':'system_status','args':{},'title':'System'},{'tool':'neural_status','args':{},'title':'Memory'}]

class DurableTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/'checks.sqlite'
        self.store=w.DurableWorkflows(self.path)
    def tearDown(self):self.tmp.cleanup()
    def test_resume_skips_committed_steps(self):
        ident=self.store.submit('Check system and memory',STEPS);calls=[]
        def execute(tool,args):calls.append(tool);return {'centro':{'ok':True},'neurons':3}
        first=self.store.advance(ident,execute,lambda:len(calls)>=1)
        self.assertEqual(first['state'],'queued')
        returned=w.DurableWorkflows(self.path).resume_one(execute)
        self.assertEqual(calls,['system_status','neural_status'])
        self.assertEqual(returned['state'],'complete');self.assertFalse(returned['verified'])
    def test_process_death_recovers(self):
        ident=self.store.submit('Check system and memory',STEPS)
        code="""import os,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import travis_workflow as w
def execute(tool,args):
 if tool=='neural_status':os._exit(23)
 return {'centro':{'ok':True}}
w.DurableWorkflows(sys.argv[2]).advance(sys.argv[3],execute)
"""
        p=subprocess.run([sys.executable,'-c',code,str(Path(w.__file__).parent),str(self.path),ident])
        self.assertEqual(p.returncode,23)
        calls=[]
        result=w.DurableWorkflows(self.path).resume_one(lambda tool,args:calls.append(tool) or {'neurons':4})
        self.assertEqual(calls,['neural_status']);self.assertEqual(result['completed'],2)
    def test_failures_not_retried_or_promoted(self):
        def fail(tool,args):raise RuntimeError('private credential should not persist')
        result=self.store.run('Check system and memory',STEPS,fail)
        self.assertEqual(result['completed'],0);self.assertTrue(result['partial'])
        self.assertIsNone(self.store.resume_one(fail))
        self.assertNotIn('credential',json.dumps(result))
    def test_no_writes_or_extra_args(self):
        for steps in [[{'tool':'send_mail','args':{}},STEPS[1]], [{**STEPS[0],'args':{'url':'x'}},STEPS[1]]]:
            with self.assertRaises(ValueError):self.store.submit('request',steps)
        self.assertEqual(self.store.status()['states'],{})
    def test_pause_prevents_execution(self):
        ident=self.store.submit('Check system and memory',STEPS)
        self.assertIsNone(self.store.resume_one(lambda *args:self.fail(),lambda:True))
        self.assertEqual(self.store.result(ident)['state'],'queued')
    def test_expiry(self):
        ident=self.store.submit('Check system and memory',STEPS)
        self.store.clock=lambda:10**12
        result=self.store.resume_one(lambda *args:self.fail())
        self.assertEqual(result['state'],'expired')
    def test_queue_bound(self):
        for i in range(16):self.store.submit('Check system and memory',STEPS)
        with self.assertRaises(ValueError):self.store.submit('overflow',STEPS)
    def test_other_instance_lock_prevents_duplicate_read(self):
        other=w.DurableWorkflows(self.path);ident=self.store.submit('Check system and memory',STEPS)
        calls=[]
        def execute(tool,args):
            calls.append(tool)
            competing=other.advance(ident,lambda *args:self.fail('duplicate'))
            self.assertEqual(competing['state'],'running')
            return {'centro':{'ok':True},'neurons':3}
        result=self.store.advance(ident,execute)
        self.assertEqual(calls,['system_status','neural_status']);self.assertEqual(result['state'],'complete')
    def test_existing_voice_task_reports_recovered_checkpoint(self):
        source=Path(__file__).with_name('jarvis_local.py')
        if not source.exists():self.skipTest('router source is supplied in remote stage')
        tree=ast.parse(source.read_text())
        function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='voice_job_status')
        ident=self.store.submit('Check system and memory',STEPS)
        env={'VOICE_JOB_LOCK':threading.Lock(),'VOICE_JOBS':{'task':{'taskId':'task','workflowId':ident,'status':'running'}},
             'TRAVIS_WORKFLOWS':self.store,'result_cards':lambda *args:{'kind':'agents'}}
        exec(compile(ast.Module(body=[function],type_ignores=[]),'voice_status','exec'),env)
        status=env['voice_job_status']('task');self.assertEqual(status['status'],'queued')
        self.store.advance(ident,lambda tool,args:{'centro':{'ok':True},'neurons':3})
        status=env['voice_job_status']('task');self.assertEqual(status['status'],'completed')
        self.assertTrue(status['answer']['recoveredFromCheckpoint'])
        self.assertEqual(status['answer']['result']['completed'],2)

if __name__=='__main__':unittest.main(verbosity=2)
