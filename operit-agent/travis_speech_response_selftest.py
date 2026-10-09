#!/usr/bin/env python3
import unittest
from travis_speech_response import spoken_reply

class SpeechPresentationTests(unittest.TestCase):
 def setUp(self):
  self.full=("Encontrei 5 passagens com fontes: Carl Gustav Jung — Sombra; nota interpretativa. "
    "Na tradição junguiana, a sombra representa aspectos desconhecidos da personalidade. "
    "Fonte: https://example.org/a-long-bibliography "
    "Sigmund Freud — O Inconsciente; nota interpretativa. História dos processos inconscientes. "
    "Fonte: https://example.org/b "
    "Immanuel Kant — Ética; nota interpretativa. Ética da razão prática. "
    "Fonte: https://example.org/c")
 def test_shortens_only_sourced_lookup(self):
  short=spoken_reply(self.full,"pt")
  self.assertTrue(short.startswith("Encontrei 5 passagens."),short)
  self.assertIn("Carl Gustav Jung",short)
  self.assertIn("fontes estão no ecrã",short)
  self.assertNotIn("http",short)
  self.assertLess(len(short),len(self.full)*.75)
 def test_long_safety_warning_unchanged(self):
  original="Tens de pedir autorização antes de apagar dados. "*50
  self.assertEqual(spoken_reply(original),original)
 def test_links_without_source_label_unchanged(self):
  original="Abre https://example.org/ agora."
  self.assertEqual(spoken_reply(original),original)
 def test_short_responses_unchanged(self):
  for phrase in ("Estou aqui.","Vou verificar.","I can access the server."):
   self.assertEqual(spoken_reply(phrase),phrase)
 def test_cannot_invent_from_missing_reference(self):
  text="Encontrei 3 passagens com fontes: uma nota sem ligação."
  self.assertEqual(spoken_reply(text),text)
 def test_no_first_passage(self):
  text="Encontrei 5 passagens com fontes: Fonte: https://example.org/a"
  self.assertEqual(spoken_reply(text),text)
 def test_long_paragraph_no_sentence_not_truncated(self):
  text="Encontrei 2 passagens com fontes: "+("A "*400)+"Fonte: https://example.org/a"
  self.assertEqual(spoken_reply(text),text)

if __name__=="__main__":
 unittest.main(verbosity=2)
