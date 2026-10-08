import unittest
from unittest.mock import patch
import jarvis_selftest as runtime
j=runtime.j


class DialogueTests(unittest.TestCase):
 setUp=runtime.Tests.setUp
 tearDown=runtime.Tests.tearDown
 def test_language_follows_user_and_explicit_preference_is_per_session(self):
  a={'session':'dialogue-language-a'};b={'session':'dialogue-language-b'}
  with patch.object(j,'infer',return_value='An orbit is a curved path.'):
   self.assertEqual(j.route('Olá',a)['language'],'pt')
   self.assertEqual(j.route('Speak English',a)['language'],'en')
   self.assertEqual(j.route('Olá',a)['language'],'en')
   self.assertEqual(j.route('Olá',b)['language'],'pt')
   j.route('match my language',a)
   self.assertEqual(j.route('Olá',a)['language'],'pt')
   result=j.route('Explain an orbit',a)
   self.assertEqual(result['language'],'en')
   self.assertEqual(result['ui']['scene'],'orbit')
  self.assertEqual(j.DIALOGUE_INFO.language,'en')

 def test_controls_wake_and_memory_use_the_spoken_reply(self):
  ctx={'session':'dialogue-controls'}
  with patch.object(j,'infer',side_effect=AssertionError('No model needed')):
   sleep=j.route('fica em espera',ctx)
   self.assertTrue(sleep['preferences']['standby'])
   awake=j.route('Olá',dict(ctx,wake=True))
   self.assertFalse(awake['preferences']['standby'])
   self.assertEqual(j.dialogue_turns(ctx)[-1]['assistant'],awake['reply'])
   j.route('sem interrupções',ctx)
   self.assertIsNone(j.initiative(dict(ctx,idleSeconds=900))['event'])
   for phrase in ['stop listening','fala inglês','fala português','go to sleep']:
    self.assertEqual(j.classify(phrase)[0],'conversation_control')

 def test_initiative_has_cooldown_and_obeys_standby(self):
  import time
  ctx={'session':'dialogue-initiative','idleSeconds':200}
  state={'activeRequests':0,'paused':False,'journal':[{'kind':'dream','id':1,'created':time.time(),'body':{'scenario':'Compare two approaches.'}}]}
  with patch.object(j.TRAVIS_BRAIN,'status',return_value=state):
   first=j.initiative(ctx)['event'];self.assertEqual(first['kind'],'hypothesis')
   self.assertIsNone(j.initiative(ctx)['event'])
   other={'session':'dialogue-standby','idleSeconds':200}
   j.dialogue_preferences(other['session'],{'standby':True})
   self.assertIsNone(j.initiative(other)['event'])

 def test_existing_phone_workflows_remain_bounded_and_registered(self):
  steps=j.travis_workflow.plan('Check my tasks and repositories')
  self.assertEqual([s['tool'] for s in steps],['task_list','repo_access'])
  with patch.object(j,'execute',return_value={'completed':2,'total':2,'steps':[],'verified':False}):
   self.assertEqual(j.route('Check my tasks and repositories')['tool'],'agent_workflow')
  for request in ['Do not search for videos','não procures um vídeo','como abrir a web?']:
   self.assertIsNone(j.travis_semantic.fast_interpret(request))
  self.assertEqual(j.classify('pesquisa inteligência artificial')[0],'web_research')
  with self.assertRaises(ValueError):
   j.travis_workflow.run('invalid',[{'tool':'repo_change','args':{}},{'tool':'gmail_send','args':{}}],lambda *args:None)


if __name__=='__main__':unittest.main()
