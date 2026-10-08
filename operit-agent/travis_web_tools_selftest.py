#!/usr/bin/env python3
import base64,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import travis_web_tools as w

class Tests(unittest.TestCase):
 def test_accented_and_english_open_requests(self):
  for text in ["Abre a Wikipédia", "Podes abrir a Wikipédia?", "Open Wikipedia", "Can you open Wikipedia please?"]:
   self.assertEqual(w.classify(text),("web_open",{"url":"https://pt.wikipedia.org/"}))
  self.assertIsNone(w.classify("Não abras a Wikipédia"))
  self.assertIsNone(w.classify("Do not open Wikipedia"))
 def test_classification(self):
  self.assertEqual(w.classify("abre o GitHub"),("web_open",{"url":"https://github.com/"}))
  self.assertEqual(w.classify("pesquisa inteligência artificial"),("web_research",{"query":"inteligência artificial"}))
  self.assertEqual(w.classify("lê https://example.com")[0],"web_read")
  self.assertEqual(w.classify("qual é a notícia mais recente sobre IA?")[0],"web_research")
  self.assertEqual(w.classify("find the latest Puppeteer version")[0],"web_research")
  self.assertEqual(w.classify("search online for current AI news")[0],"web_research")
  self.assertEqual(w.classify("read https://example.com")[0],"web_read")

 def test_private_targets_rejected_without_dns(self):
  for url in ["http://localhost/x","http://127.0.0.1/x","http://10.0.0.1/x","http://192.168.1.1/x"]:
   with self.assertRaises(ValueError):w.safe_url(url)

 def test_bing_redirect_decode(self):
  target="https://example.com/path?q=1"
  raw=base64.urlsafe_b64encode(target.encode()).decode().rstrip("=")
  url="https://www.bing.com/ck/a?u=a1"+raw
  self.assertEqual(w._decode_bing(url),target)

 def test_search_parser_uses_public_result(self):
  target="https://example.com/"
  raw=base64.urlsafe_b64encode(target.encode()).decode().rstrip("=")
  page='<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1'+raw+'">Example Result</a></h2><div class="b_caption"><p>Useful snippet.</p></div></li>'
  with tempfile.TemporaryDirectory() as d,patch.object(w,"_fetch",return_value=("https://www.bing.com/search","text/html",page)):
   old_root,old_last=w.STATE_ROOT,w.LAST_WEB
   try:
    w.STATE_ROOT=Path(d);w.LAST_WEB=Path(d)/"last-web.json"
    rows=w.search("test",3)
   finally:w.STATE_ROOT,w.LAST_WEB=old_root,old_last
  self.assertEqual(rows[0]["title"],"Example Result")
  self.assertEqual(rows[0]["url"],target)
  self.assertEqual(rows[0]["snippet"],"Useful snippet.")

if __name__=="__main__":unittest.main()
