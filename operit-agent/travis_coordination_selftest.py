import tempfile
import unittest
from pathlib import Path
from travis_coordination import Coordinator

class CoordinationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.now=1000
        self.path=Path(self.tmp.name)/'coordination.sqlite'
        self.core=Coordinator(self.path,clock=lambda:self.now)
        self.session='session-test-2026';self.ident='request-test-2026'
    def request(self):
        return self.core.receive(self.session,{'action':'requested','id':self.ident,'text':'Show a random public camera'})
    def result(self,session=None):
        return self.core.receive(session or self.session,{'action':'result','id':self.ident,'result':{'verified':True,'kind':'snapshot','sourceId':'354','source':'Congress Ave','reply':'An available public still image.'}})
    def test_result_requires_matching_session_and_request(self):
        self.assertFalse(self.result()['ok']);self.request()
        self.assertFalse(self.result('other-session-2026')['ok'])
        self.assertTrue(self.result()['recorded'])
        self.assertEqual(self.core.status()['goals'],{'browser_observed':1})
    def test_duplicate_events_do_not_duplicate_actions_or_results(self):
        self.assertTrue(self.request()['recorded']);self.assertFalse(self.request()['recorded'])
        self.result();self.assertFalse(self.result()['recorded'])
        self.assertEqual(self.core.status()['events'],2)
    def test_restart_retains_goal_without_replaying_it(self):
        self.request();self.result()
        restarted=Coordinator(self.path,clock=lambda:self.now)
        self.assertIn('Congress Ave',restarted.context(self.session))
        self.assertFalse(restarted.status()['automaticActionReplay'])
    def test_stale_views_expire_and_results_never_prove_feed_freshness(self):
        self.request();self.result()
        self.core.receive(self.session,{'action':'observe','display':{'active':True,'scene':'public-camera','sourceId':'354','title':'Congress Ave','mediaType':'snapshot'}})
        text=self.core.context(self.session)
        self.assertIn('currentDisplay',text);self.assertIn('lastCameraRequest',text)
        self.assertIn('"feedFreshnessVerified":false',text)
        self.now+=46
        self.assertNotIn('currentDisplay',self.core.context(self.session))
        self.assertEqual(self.core.context('other-session-2026'),'')
    def test_expired_pending_request_is_unverified(self):
        self.request();self.now+=121;self.core.tick(foreground=True)
        self.assertEqual(self.core.status()['goals'],{'unverified_timeout':1})
        self.assertEqual(self.core.status()['phase'],'foreground_priority')
        self.core.tick(paused=True);self.assertEqual(self.core.status()['phase'],'paused')
    def test_unverified_result_cannot_claim_playback(self):
        self.request()
        self.core.receive(self.session,{'action':'result','id':self.ident,'result':{'verified':True,'kind':'snapshot'}})
        self.assertEqual(self.core.status()['goals'],{'unverified':1})

if __name__=='__main__':unittest.main()
