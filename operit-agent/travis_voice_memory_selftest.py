import ast
import contextlib
import unittest
from pathlib import Path
from types import SimpleNamespace

class VoiceMemoryTests(unittest.TestCase):
    def run_warmup(self,variables):
        fn=next(n for n in ast.parse(Path(__file__).with_name('jarvis_local.py').read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='warm_voice')
        calls=[];env={'os':SimpleNamespace(environ=variables)}
        for name in ['FAST_STT_WORKER','TTS_EN_WORKER','TTS_WORKER','SHERPA_STT_WORKER','PT_STT_WORKER']:
            env[name]=SimpleNamespace(lock=contextlib.nullcontext(),start=lambda n=name:calls.append(n))
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'warmup','exec'),env);env['warm_voice']()
        return calls
    def test_unselected_sherpa_is_not_resident_at_startup(self):
        calls=self.run_warmup({});self.assertNotIn('SHERPA_STT_WORKER',calls)
        self.assertIn('FAST_STT_WORKER',calls);self.assertIn('TTS_EN_WORKER',calls);self.assertIn('PT_STT_WORKER',calls)
    def test_explicit_configuration_is_respected(self):
        for env in [{'TRAVIS_STT_BACKEND':'sherpa'},{'TRAVIS_LIVE_STT':'1'}]:self.assertIn('SHERPA_STT_WORKER',self.run_warmup(env))

if __name__=='__main__':unittest.main()
