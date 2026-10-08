#!/usr/bin/env python3
"""Read-only graph regression: records on screen must exist in persisted SQLite."""
import tempfile
import unittest
from pathlib import Path
from travis_brain import BrainRuntime
from travis_core import RuntimeStore


class GraphTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = RuntimeStore(root / 'memories.sqlite')
        self.brain = BrainRuntime(root / 'brain.sqlite', self.store, cognitive=None)

    def tearDown(self):
        self.brain.stop()
        self.temp.cleanup()

    def test_empty_graph_does_not_invent_nodes(self):
        graph = self.brain.graph()
        self.assertTrue(graph['ok'])
        self.assertEqual(graph['source'], 'local-sqlite')
        self.assertEqual(graph['nodes'], [])
        self.assertEqual(graph['links'], [])

    def test_only_persisted_relations_are_present(self):
        one = self.store.remember('Pentehouse', 'Barbearia Porto', 'CONCEPT', project_id='pentehouse')
        two = self.store.remember('Agenda', 'Marcações', 'FACT', project_id='pentehouse')
        three = self.store.remember('Beatriz', 'Engomadoria', 'CONCEPT', project_id='beatriz')
        sid = self.store.link_neurons(one, two, 'EXTENDS', .7, 1.0)
        graph = self.brain.graph()
        self.assertEqual({n['id'] for n in graph['nodes']}, {one, two, three})
        self.assertEqual(len(graph['links']), 1)
        self.assertEqual((graph['links'][0]['source'], graph['links'][0]['target']), (one, two))
        self.assertEqual(graph['links'][0]['provenance'], 'persisted-synapse')

        # Inactivating an endpoint must remove the link as well as that node.
        with self.store.connect() as conn:
            conn.execute('UPDATE travis_neurons SET active=0 WHERE id=?', (one,))
        after = self.brain.graph()
        self.assertEqual({n['id'] for n in after['nodes']}, {two, three})
        self.assertEqual(after['links'], [])

    def test_limit_and_no_private_body_leak(self):
        for i in range(7):
            self.store.remember(f'Memória {i}', f'Detalhes privados {i}', 'FACT', project_id='local')
        graph = self.brain.graph(limit=3)
        self.assertEqual(len(graph['nodes']), 3)
        self.assertTrue(graph['truncated'])
        self.assertNotIn('Detalhes privados', str(graph))


if __name__ == '__main__':
    unittest.main(verbosity=2)
