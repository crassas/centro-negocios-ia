import base64,unittest
import jarvis_sherpa as s
class Stream:
 def __init__(self):self.frames=0
 def accept_waveform(self,rate,samples):self.frames+=len(samples)
 def input_finished(self):pass
class Recognizer:
 def create_stream(self):return Stream()
 def is_ready(self,stream):return False
 def get_result(self,stream):return 'Open YouTube please'
class Tests(unittest.TestCase):
 def setUp(self):self.r=Recognizer();self.states={};self.key='live-test-20261010-01'
 def send(self,**kw):return s.live_decode(self.r,self.states,{'id':self.key,'seq':0,'pcm':base64.b64encode(b'\0\0'*8000).decode(),**kw})
 def test_order_and_verified_final(self):
  self.assertFalse(self.send()['accepted']);self.assertEqual(len(self.states),1)
  with self.assertRaises(ValueError):self.send()
  self.assertTrue(self.send(seq=1,final=True)['accepted']);self.assertFalse(self.states)
 def test_cancel_releases_state(self):
  self.send();self.assertTrue(self.send(cancel=True)['cancelled']);self.assertFalse(self.states)
 def test_missing_start_and_fragment_bounds(self):
  for payload in ({'seq':2},{'pcm':'a'},{'pcm':base64.b64encode(b'x'*64002).decode()},{'id':'bad'}):
   with self.assertRaises((ValueError,Exception)):self.send(**payload)
 def test_stream_capacity_and_expiry(self):
  for i in range(3):self.send(id=self.key+str(i))
  with self.assertRaises(RuntimeError):self.send()
  for item in self.states.values():item['touched']-=50
  self.send();self.assertEqual(len(self.states),1)
if __name__=='__main__':unittest.main(verbosity=2)
