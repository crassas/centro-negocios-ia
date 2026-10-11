"""Regression checks for freshness, voice selection and dialogue integration."""
import ast
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
import travis_awareness as awareness

SOURCE = Path(__file__).with_name('jarvis_local.py')

def functions(*names, **env):
    tree = ast.parse(SOURCE.read_text())
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    assert len(selected) == len(names)
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(SOURCE), 'exec'), env)
    return env

class PreservationTests(unittest.TestCase):
    def test_restart_matches_the_process_not_shell_text_or_similar_names(self):
        script=Path(__file__).with_name('jarvisctl.sh').read_text()
        python=script.split("<<'PY'\n",1)[1].split('\nPY\n',1)[0]
        tree=ast.parse(python)
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='owns_router')
        env={'os':os,'Path':Path,'expected_script':Path('/root/jarvis_local.py')}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'launcher','exec'),env)
        owns=env['owns_router']
        self.assertTrue(owns(b'/usr/bin/python3\0/root/jarvis_local.py\0serve\0'))
        self.assertFalse(owns(b'/bin/sh\0-c\0python3 /root/jarvis_local.py preserve\0'))
        self.assertFalse(owns(b'python3\0/root/jarvis_local.py\0doctor\0'))
        self.assertFalse(owns(b'python3\0/other/jarvis_local.py\0serve\0'))

    def test_self_status_questions_do_not_search_the_web(self):
        env=functions('classify',re=re,norm=lambda s:s.lower(),
                      travis_dialogue=NS(control=lambda _:None))
        for text in ['Explain how your current runtime distinguishes services from images.',
                     'Describe your integrations.','Explica o teu estado interno.']:
            self.assertEqual(env['classify'](text)[0],'local_llm')

    def test_stale_future_corrupt_receipts_never_report_online(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            p = root/'.local/state/travis-gev/watch-status.json'
            p.parent.mkdir(parents=True)
            for stamp in (0, 101, 'invalid'):
                p.write_text(json.dumps({'lastCheckEpoch': stamp, 'enabled': True, 'healthy': True}))
                data = awareness.integration_status(root, check=lambda _: False, clock=lambda: 100)
                self.assertEqual(next(x for x in data['features'] if x['id']=='gods_eye')['state'], 'unknown')
            p.write_text('{broken')
            self.assertEqual(awareness.fresh_state(p, 'lastCheckEpoch'), {})

    def test_fresh_service_state_does_not_claim_verified_feeds(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for path, data in [
                ('.local/state/travis-gev/watch-status.json', {'lastCheckEpoch':99,'enabled':True,'healthy':True}),
                ('.centro-extensions/travis-world-status.json', {'checkedEpoch':99,'cctv':{'healthy':True}}),
                ('.centro-station/status.json', {'timestamp':99,'ok':True,'openclaw':{'state':'disabled-by-operator'}}),
            ]:
                p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data))
            (root/'.centro-station/maintenance').touch()
            urls=[]
            def check(url):urls.append(url);return True
            data=awareness.integration_status(root,check=check,clock=lambda:100)
            self.assertTrue(data['openclawDisabled'])
            self.assertTrue(data['sourceUpdatesHeld'])
            self.assertEqual(urls,['http://127.0.0.1:4187/api/road-live/status'])
            self.assertTrue(all(x['state'] in {'service_online','observed_online'} for x in data['features']))
            self.assertTrue(all(x['caution'] for x in data['features'] if x['id']!='supervisor'))

    def test_voice_checks_selected_workers_not_unused_legacy_worker(self):
        def worker(kind,alive,exists=True):
            return NS(kind=kind,process=NS(poll=lambda:None if alive else 1),model=NS(is_file=lambda:exists))
        env=functions('voice_runtime_snapshot',os=NS(environ={}),
            STT_WORKER=worker('base',False), FAST_STT_WORKER=worker('fast',True),
            PT_STT_WORKER=worker('pt',True), TTS_EN_WORKER=worker('en-voice',True),TTS_WORKER=worker('pt-voice',True))
        data=env['voice_runtime_snapshot']()
        self.assertTrue(data['sttEnReady'] and data['sttPtReady'])
        self.assertEqual((data['sttEnEngine'],data['sttPtEngine']),('fast','pt'))
        self.assertFalse(data['microphoneVerified'] or data['speakerPlaybackVerified'])
        env['os'].environ['TRAVIS_STT_MODE']='precise'
        self.assertFalse(env['voice_runtime_snapshot']()['sttEnReady'])

    def test_runtime_evidence_reaches_prompt_without_losing_current_request(self):
        env=functions('reasoning_prompt',clean=str,json=json,
            awareness_facts=lambda:'Gods Eye observed_online; feeds require verification',
            TRAVIS_SKILLS=NS(model_context=lambda *a,**k:'skills catalog'),
            dialogue_session=lambda _:None,travis_continuity=None,
            TRAVIS_LIBRARY=NS(reading_context=lambda *a,**k:''),
            TRAVIS_STORE=NS(neural_context=lambda *a:''),
            TRAVIS_BRAIN=NS(recall_context=lambda *a,**k:''),
            TRAVIS_COG=NS(planning_context=lambda *a:''))
        prompt=env['reasoning_prompt']('Explain which services are connected.',limit=2700)
        self.assertIn('Gods Eye observed_online',prompt)
        self.assertIn('feeds require verification',prompt)
        self.assertIn('CURRENT USER REQUEST:\nExplain which services are connected.',prompt)
        self.assertLessEqual(len(prompt),2700)

    def test_model_context_keeps_limits_inside_budget(self):
        data={'memory':{'neurons':23,'synapses':21,'cycles':33},'features':[
            {'id':x,'state':'observed_online'} for x in ['quantum','gods_eye','public_cameras','roads','voice']]}
        facts=awareness.model_facts(data)
        self.assertLessEqual(len(facts),500)
        self.assertIn('does not prove a live feed',facts)
        self.assertIn('No consciousness',facts)

if __name__=='__main__':unittest.main()
