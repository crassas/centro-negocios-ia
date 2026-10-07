#!/usr/bin/env python3
import unittest
from unittest.mock import patch
import travis_web as w

class Tests(unittest.TestCase):
 def test_private_targets_are_rejected(self):
  for url in ["http://127.0.0.1:8094/x","http://10.0.0.2/","http://[::1]/"]:
   with self.assertRaises(ValueError):w.validate_public_url(url)
  with self.assertRaises(ValueError):w.validate_public_url("file:///etc/passwd")
  with self.assertRaises(ValueError):w.validate_public_url("javascript:alert(1)")

 def test_open_target_alias_domain_and_url(self):
  with patch.object(w,"_host_is_public",return_value=True):
   self.assertEqual(w.resolve_open_target("abre o Google")["url"],"https://www.google.com/")
   self.assertEqual(w.resolve_open_target("abre github.com/crassas")["url"],"https://github.com/crassas")
   self.assertEqual(w.resolve_open_target("visita https://example.com/a")["url"],"https://example.com/a")

 def test_html_extraction_removes_scripts(self):
  title,text=w.html_to_text("<html><title>Teste</title><script>segredo()</script><body><h1>Olá</h1><p>Mundo real.</p></body></html>")
  self.assertEqual(title,"Teste");self.assertIn("Olá",text);self.assertIn("Mundo real",text);self.assertNotIn("segredo",text)

 def test_duckduckgo_parser_and_unwrap(self):
  raw='<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Resultado A</a>'
  p=w.DDGParser();p.feed(raw)
  self.assertEqual(p.results[0]["title"],"Resultado A")
  self.assertEqual(w._unwrap_ddg(p.results[0]["url"]),"https://example.com/a")

 def test_auto_research_heuristic(self):
  self.assertTrue(w.should_auto_research("Qual é a versão mais recente do Python?"))
  self.assertTrue(w.should_auto_research("Quem é o CEO actual da empresa?"))
  self.assertFalse(w.should_auto_research("Escreve uma mensagem de agradecimento"))
  self.assertFalse(w.should_auto_research("Olá"))

 def test_search_url(self):
  self.assertIn("energia+solar",w.search_url("energia solar"))

if __name__=="__main__":unittest.main()
