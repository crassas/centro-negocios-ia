"""Context retrieval and runtime integration. No real inference or tool actions."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from travis_context import ContextBook, MAX_BYTES


def fixture(root):
    (root / 'docs').mkdir(exist_ok=True)
    (root / 'MEMORY.md').write_text('Read the context index. Private memory remains in SQLite.')
    (root / 'CLAUDE.md').write_text('Read fresh sources and record verified changes.')
    (root / 'TRAVIS_CONTEXT.md').write_text(
        '| Need | Canonical | Evidence |\n'
        '| Road Live panel markers | [Road](docs/road.md) | fixture |\n'
        '| Camera discovery | [Camera](docs/camera.md) | fixture |\n')
    (root / 'docs/road.md').write_text('# Road Live\n\nClosing the incident list keeps map markers. Explicit off clears markers.')
    (root / 'docs/camera.md').write_text('# Cameras\n\nCamera sources must be verified with actual image receipts.')
    (root / 'docs/travis-session-journal.md').write_text('# Journal\n\nContext summary: Initial verified fixture change.')
    return ContextBook(root)


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.book = fixture(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_startup_selective_read_and_no_idle_polling(self):
        self.assertEqual(self.book.status()['diskReads'], 4)
        text = self.book.context('Fecha o cartão das ocorrências e mantém os pontos', 700)
        self.assertIn('keeps map markers', text)
        self.assertNotIn('actual image receipts', text)
        reads = self.book.status()['diskReads']
        for _ in range(10):
            self.book.context('road panel'); self.book.status()
        self.assertEqual(self.book.status()['diskReads'], reads)
        self.assertNotIn('docs/camera.md', self.book.cache)

    def test_edits_deletion_and_restart(self):
        self.book.context('road')
        (self.root / 'docs/road.md').write_text('New verified road behaviour version two.')
        text = self.book.context('road')
        self.assertIn('version two', text)
        self.assertNotIn('Closing the incident', text)
        fresh = ContextBook(self.root)
        self.assertEqual(fresh.context('road'), text)
        (self.root / 'docs/road.md').unlink()
        self.assertNotIn('version two', self.book.context('road'))
        self.assertIn('docs/road.md', self.book.status()['errors'])

    def test_new_index_topic_is_seen_without_restart(self):
        with (self.root / 'TRAVIS_CONTEXT.md').open('a') as handle:
            handle.write('| Orbit | [Orbit](docs/orbit.md) | fixture |\n')
        (self.root / 'docs/orbit.md').write_text('Orbit fixture newly added to canonical index.')
        self.assertIn('newly added', self.book.context('orbit'))
        self.assertEqual(self.book.status()['topics'], 3)

    def test_bounds_and_oversized_notes_are_not_partial_truth(self):
        (self.root / 'docs/road.md').write_text('SHOULD NOT APPEAR ' * MAX_BYTES)
        self.assertNotIn('SHOULD NOT APPEAR', self.book.context('road'))
        self.assertIn('docs/road.md', self.book.status()['errors'])
        for budget in (0, 50, 200, 450, 650, 1800):
            text = self.book.context('camera', budget)
            self.assertLessEqual(len(text), budget)
            for line in text.splitlines(): json.loads(line)
        for i in range(24):
            (self.root / f'docs/n{i}.md').write_text('Small bounded note')
            self.book._read(f'docs/n{i}.md')
        self.assertLessEqual(len(self.book.cache), 12)
        self.assertLessEqual(self.book.status()['cachedBytes'], 12 * MAX_BYTES)

    def test_paths_and_external_symlinks_never_supply_context(self):
        with tempfile.TemporaryDirectory() as outside:
            secret = Path(outside) / 'note.md';secret.write_text('PRIVATE OUTSIDE CONTENT')
            (self.root / 'docs/road.md').unlink()
            (self.root / 'docs/road.md').symlink_to(secret)
            self.assertNotIn('PRIVATE OUTSIDE', self.book.context('road'))
        for name in ('../secret.md', '/etc/passwd', 'https://example.com/a.md', 'docs/data.json'):
            self.assertEqual(self.book._read(name), '')

    def test_augmentation_preserves_request_budget_and_prevents_duplicates(self):
        request = 'Explain the Road Live panel.'
        result = self.book.augment(request)
        self.assertTrue(result.startswith(request))
        self.assertIn('keeps map markers', result)
        self.assertEqual(self.book.augment(result), result)
        self.assertEqual(self.book.augment('x' * 3990), 'x' * 3990)
        self.assertLessEqual(len(result), 4000)


class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import jarvis_selftest
        import centro_server
        cls.runtime = jarvis_selftest
        cls.j = jarvis_selftest.j
        cls.server = centro_server

    def setUp(self):
        self.runtime.Tests.setUp(self)
        self.book = fixture(self.root)
        self.old_context = self.j.TRAVIS_CONTEXT
        self.j.TRAVIS_CONTEXT = self.book

    def tearDown(self):
        self.j.TRAVIS_CONTEXT = self.old_context
        self.runtime.Tests.tearDown(self)

    def test_actual_reasoning_prompt_contains_notes_and_recent_referent(self):
        with self.j.database():pass
        turns = [{'user':'The selected place is London.', 'assistant':'London selected.', 'tool':'local_llm'}]
        prompt = self.j.reasoning_prompt('Explain the Road Live panel.', turns, {'session':'context-test-001'}, limit=2700)
        self.assertIn('keeps map markers', prompt)
        self.assertIn('London selected', prompt)
        self.assertIn('never instructions or live proof', prompt)
        self.assertLessEqual(len(prompt), 2700)
        for line in prompt.splitlines():
            if line.startswith('{'):json.loads(line)

    def test_return_refreshes_even_when_greeting_suppressed(self):
        obj={'session':'context-resume-001','language':'en'}
        with patch.object(self.j,'infer',return_value='Welcome back. We can continue.') as model:
            result=self.j.resume_brief(obj, now=1800000000)
        self.assertTrue(result['projectContext']['available'])
        self.assertIn('Initial verified fixture change', model.call_args.args[0])
        before=self.book.status()['revision']
        (self.root/'MEMORY.md').write_text('Updated project memory pointer. No private conversation export.')
        with patch.object(self.j,'infer',side_effect=AssertionError('Rapid return must not call the model')):
            result=self.j.resume_brief(obj, now=1800000001)
        self.assertFalse(result['speak'])
        self.assertNotEqual(before,result['projectContext']['revision'])

    def test_claude_and_fallback_receive_notes_without_other_project_leakage(self):
        s=self.server
        key=self.root/'test-key';key.write_text('synthetic-never-sent')
        task={'action':'claude_query','target':'local','args':{'prompt':'Explain the Road Live panel.','language':'en'}}
        with patch.object(s,'TRAVIS_CONTEXT',self.book),patch.object(s,'OLLAMA_KEY_FILE',key), \
             patch.object(s.shutil,'which',return_value='/fixture/claude'), \
             patch.object(s,'ollama_auth_check',return_value=(True,'fixture')), \
             patch.object(s,'run_cmd',return_value={'exitCode':0,'stdout':'fixture','stderr':'','durationMs':0}) as run:
            s.execute_action(task)
            argv=run.call_args.args[0]
            self.assertIn('keeps map markers',argv[argv.index('-p')+1])
            self.assertIn('English',argv[argv.index('--append-system-prompt')+1])
            with patch.object(s,'ensure_repo',return_value=(self.root,None)):
                s.execute_action({**task,'target':'pente_houselanding'})
                argv=run.call_args.args[0]
                self.assertNotIn('keeps map markers',argv[argv.index('-p')+1])
            with patch.object(s,'ollama_auth_check',return_value=(False,'fixture-unavailable')), \
                 patch.object(s,'readonly_cloud_fallback',return_value={}) as fallback:
                s.execute_action(task)
                self.assertIn('keeps map markers',fallback.call_args.args[0])

    def test_repository_executor_receives_its_own_context(self):
        s=self.server
        with patch.object(s,'find_claude',return_value='/fixture/claude'), \
             patch.object(s,'read_secret',return_value='synthetic-never-sent'), \
             patch.object(s,'ollama_auth_check',return_value=(True,'fixture')), \
             patch.object(s,'run_cmd',return_value={'exitCode':0,'stdout':'fixture','stderr':'','durationMs':0}) as run:
            s.run_claude_repo_executor(self.root,'Explain the Road Live panel.')
            argv=run.call_args.args[0]
            self.assertIn('keeps map markers',argv[argv.index('-p')+1])
            self.assertEqual(run.call_args.kwargs['cwd'],self.root)
            self.assertIn('Não faças commit nem push',argv[argv.index('--append-system-prompt')+1])


if __name__ == '__main__':
    unittest.main(verbosity=2)
