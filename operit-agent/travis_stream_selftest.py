"""Incremental speech protocol regression tests; no external models or services."""
import io,json,unittest
from travis_stream import read_sse,SpeechChunks

class StreamTests(unittest.TestCase):
 def test_cloud_and_local_stream_preserve_unicode(self):
  for rows in ([{'response':'Olá. '},{'response':'Hello.'}],[{'choices':[{'delta':{'content':'Olá. '}}]},{'choices':[{'delta':{'content':'Hello.'}}]}]):
   output=[];raw=b':ping\n'+b''.join(('data: '+json.dumps(x,ensure_ascii=False)+'\n\n').encode() for x in rows)+b'data: [DONE]\n'
   self.assertEqual(read_sse(io.BytesIO(raw),output.append),'Olá. Hello.')
   self.assertEqual(''.join(output),'Olá. Hello.')
 def test_chunks_arrive_before_complete_answer_without_lost_words(self):
  emitted=[];chunks=SpeechChunks(emitted.append)
  chunks.feed('First sentence. ')
  self.assertEqual(emitted,['First sentence.'])
  chunks.feed('A longer sentence '+('with useful details '*25)+'. Last thought.')
  chunks.finish()
  self.assertEqual(' '.join(emitted),'First sentence. A longer sentence '+('with useful details '*25)+'. Last thought.')
 def test_disconnect_propagates_instead_of_generating_fallback_speech(self):
  def stopped(_):raise BrokenPipeError()
  with self.assertRaises(BrokenPipeError):read_sse(io.BytesIO(b'data: {"response":"Hello"}\n'),stopped)
 def test_first_audio_is_bounded_even_when_a_whole_sentence_arrives(self):
  emitted=[];chunks=SpeechChunks(emitted.append)
  source='Gravity is a fundamental force of nature that attracts objects with mass to one another. '
  chunks.feed(source);chunks.finish()
  self.assertLessEqual(len(emitted[0]),48)
  self.assertEqual(' '.join(emitted),source.strip())
 def test_invalid_empty_and_error_streams_fail(self):
  for data in (b'data: [DONE]\n',b'data: {"error":"quota"}\n'):
   with self.assertRaises(RuntimeError):read_sse(io.BytesIO(data))
 def test_response_size_is_bounded(self):
  self.assertEqual(read_sse(io.BytesIO(b'data: {"response":"abcdefghijk"}\n'),limit=5),'abcde')
if __name__=='__main__':unittest.main(verbosity=2)
