"""Continuity regressions using isolated, synthetic personal history."""
import json
import time
import unittest
from unittest.mock import patch
import jarvis_selftest as runtime
from travis_continuity import Continuity

j=runtime.j


class ContinuityTests(unittest.TestCase):
    setUp=runtime.Tests.setUp
    tearDown=runtime.Tests.tearDown

    def test_old_dialogue_reopens_and_relevant_details_survive_many_turns(self):
        ctx={'session':'personal-alpha-001'}
        j.event('conversations',dict(ctx,user='O telescópio de teste chama-se Farol.',assistant='Registado.'))
        with j.database() as db:
            db.execute('UPDATE conversations SET created=?',(time.time()-90*86400,))
        self.assertIn('Farol',j.dialogue_turns(ctx)[0]['user'])
        for i in range(20):j.event('conversations',dict(ctx,user=f'Outro assunto número {i}',assistant='Certo.'))
        prompt=j.reasoning_prompt('Qual era o nome do telescópio?',j.dialogue_turns(ctx),ctx)
        self.assertIn('Farol',prompt)
        self.assertIn('past dialogue, not a verified fact',prompt)
        other={'session':'personal-beta-002'}
        self.assertNotIn('Farol',j.reasoning_prompt('telescópio',context=other))

    def test_explicit_phone_migration_preserves_rows_and_is_not_global(self):
        j.event('conversations',{'session':'legacy-tab-alpha','user':'Teste migração','assistant':'Resposta'})
        m=j.continuity();m.import_personal_sessions('phone-owner-001',['legacy-tab-alpha'])
        self.assertEqual(m.recent('phone-owner-001')[0]['user'],'Teste migração')
        self.assertEqual(m.recent('other-owner-002'),[])
        with j.database() as db:self.assertEqual(db.execute('SELECT count(*) FROM conversations').fetchone()[0],1)

    def test_name_correction_and_explicit_memories_survive_restart(self):
        with j.database():pass
        m=j.continuity();scope='personal-alpha-001'
        m.capture(scope,'Call me Alex');m.capture(scope,'Call me Sam')
        m.capture(scope,'Remember that my telescope is named Farol')
        self.assertIsNone(m.capture(scope,'Imagine my name is King'))
        self.assertIsNone(m.capture(scope,'Remember that my password is example'))
        restored=Continuity(m.path)
        self.assertEqual(restored.address(scope),'Sam')
        self.assertIn('Farol',restored.notes(scope,'telescope'))
        self.assertNotIn('Alex',restored.notes(scope))
        self.assertEqual(restored.notes('other-session-002'),'')

    def test_english_memory_uses_scoped_storage_and_spoken_confirmation(self):
        ctx={'session':'personal-alpha-001'}
        answer=j.route('Remember that my telescope is named Farol',ctx)
        self.assertEqual(answer['tool'],'note_fact')
        self.assertIn('saved',answer['reply'])
        self.assertIn('Farol',j.continuity().notes(ctx['session'],'telescope'))
        self.assertNotIn('Farol',j.TRAVIS_STORE.neural_context('telescope'))

    def test_greeting_is_generated_grounded_and_deduplicated_per_owner(self):
        ctx={'session':'return-alpha-001','language':'en'}
        j.event('conversations',dict(ctx,user='Let us explore rain.',assistant='Clouds contain droplets.'))
        j.continuity().capture(ctx['session'],'Call me Alex')
        with patch.object(j,'infer',return_value='Hello, Alex. Ready to return to the clouds?') as model:
            first=j.resume_brief(ctx,1000)
            self.assertEqual(first['mode'],'generated')
            self.assertIn('Alex',model.call_args.args[0]);self.assertIn('rain',model.call_args.args[0])
            self.assertFalse(j.resume_brief(ctx,1020)['speak']);self.assertEqual(model.call_count,1)
            second=j.resume_brief(ctx,1200)
            self.assertNotEqual(first['reply'],second['reply'])
        with patch.object(j,'infer',side_effect=RuntimeError('offline')):
            a=j.resume_brief(ctx,1400);b=j.resume_brief(ctx,1600)
            self.assertNotEqual(a['reply'],b['reply'])
            self.assertEqual(b['mode'],'contextual-fallback')
        with patch.object(j,'infer',return_value='Olá. Que caminho seguimos?'):
            separate=j.resume_brief({'session':'return-beta-002','language':'pt'},1601)
            self.assertTrue(separate['speak']);self.assertFalse(separate['returning'])

    def test_world_references_are_bilingual_and_epistemically_labelled(self):
        from travis_library import ReadingLibrary
        library=ReadingLibrary(self.root/'library');library.seed()
        for question in ['rain condensation','chuva condensação','choice control','espiritualidade','DNA','gravity orbits']:
            results=library.search(question)
            self.assertTrue(results,question)
            self.assertTrue(all(x['sourceUrl'].startswith('https://') for x in results))
        self.assertIn('philosophy',{r['epistemic'] for r in library.search('Epictetus')})


if __name__=='__main__':unittest.main(verbosity=2)
