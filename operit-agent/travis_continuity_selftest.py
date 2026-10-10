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

    def test_visual_followup_survives_restart_and_is_idempotent_and_scoped(self):
        ctx={'session':'visual-alpha-001'}
        with j.database():pass
        m=j.continuity()
        scene={'active':True,'scene':'plane','title':'avião','execute':'delete files'}
        self.assertTrue(m.observe_local(ctx['session'],'visual-turn-001','Mostra um avião','A projetar um avião.',scene))
        self.assertFalse(m.observe_local(ctx['session'],'visual-turn-001','duplicate','duplicate',scene))
        restored=Continuity(m.path)
        turns=restored.recent(ctx['session'])
        self.assertEqual(len(turns),1)
        prompt=j.reasoning_prompt('Como é que isso voa?',turns,ctx)
        self.assertIn('avião',prompt);self.assertIn('browser_report',prompt)
        self.assertNotIn('delete files',prompt)
        self.assertEqual(restored.working('other-owner-001'),'')
        current=restored.working(ctx['session'],{'active':False})
        self.assertNotIn('previousDisplay',current)
        self.assertIn('"active":false',current)

    def test_explicit_meaning_correction_supersedes_old_definition(self):
        m=j.continuity();scope='meaning-alpha-001'
        self.assertIsNotNone(m.capture(scope,'Quando digo plane, refiro-me a uma plaina.'))
        self.assertIsNotNone(m.capture(scope,'Quando digo plane, refiro-me a um avião.'))
        m.capture('meaning-beta-002','When I say plane, I mean a woodworking tool.')
        result=m.notes(scope,'plane')
        self.assertIn('avião',result);self.assertNotIn('plaina',result);self.assertNotIn('woodworking',result)
        self.assertIsNone(m.capture(scope,'Imagine que quando digo plane, refiro-me a uma nave.'))

    def test_interrupted_reply_is_recoverable_without_replaying_a_tool(self):
        m=j.continuity();scope='checkpoint-001'
        m.start(scope,'turn-start-001','Explica uma órbita',{'active':True,'title':'Terra'})
        m.finish(scope,'turn-start-001','interrupted','A gravidade curva a trajetória.')
        self.assertFalse(m.finish(scope,'turn-start-001','generated','Late result'))
        restored=Continuity(m.path)
        prompt=restored.working(scope)
        self.assertIn('A gravidade',prompt);self.assertIn('resumeOnlyOnUserRequest',prompt)
        restored.finish(scope,'turn-start-001','delivered')
        self.assertFalse(restored.finish(scope,'turn-start-001','interrupted'))
        self.assertFalse(restored.finish('another-session','turn-start-001','delivered'))
        self.assertNotIn('unfinishedRequest',restored.working(scope))

    def test_interaction_endpoint_never_executes_a_tool(self):
        payload={'session':'endpoint-scope-001','id':'observation-001','text':'Mostra Marte',
                 'reply':'Marte','scene':{'active':True,'title':'Mars'}}
        with patch.object(j,'execute',side_effect=AssertionError('Observation is not permission')):
            first=runtime.Tests.brain_post(self,'/interaction',payload)
            second=runtime.Tests.brain_post(self,'/interaction',payload)
        self.assertEqual(first['code'],200);self.assertTrue(first['body']['recorded'])
        self.assertFalse(second['body']['recorded'])
        self.assertEqual(runtime.Tests.brain_post(self,'/interaction',payload,'https://example.org')['code'],403)

    def test_looking_at_hologram_does_not_require_an_inactive_camera(self):
        context={'session':'display-reference-001','scene':{'active':True,'scene':'vehicle','title':'Airplane'}}
        with patch.object(j,'infer',return_value='You are looking at an airplane. Its wings produce lift.') as model:
            result=j.route('Tell me what I am looking at and how it stays in the air.',context)
        self.assertEqual(result['tool'],'local_llm')
        self.assertIn('Airplane',model.call_args.args[0])
        self.assertIn('camera',j.vision_dialogue('What does the camera see?',context).lower())

    def test_prompt_keeps_whole_records_and_current_goal_under_pressure(self):
        with j.database():pass
        ctx={'session':'prompt-scope-001','scene':{'active':True,'scene':'solar-system','title':'Sistema solar'}}
        turns=[{'user':'Mostra Marte','assistant':'A'*1200,'tool':'visual_observation'},
               {'user':'Agora isola a Terra','assistant':'B'*1200,'tool':'visual_observation'}]
        prompt=j.reasoning_prompt('Explica as estações do ano',turns,ctx,limit=1500)
        self.assertLessEqual(len(prompt),1500)
        self.assertIn('Explica as estações do ano',prompt);self.assertIn('Agora isola a Terra',prompt)
        for line in prompt.splitlines():
            if line.startswith('{'):json.loads(line)
        self.assertTrue(prompt.endswith('claim an unexecuted action.'))

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
