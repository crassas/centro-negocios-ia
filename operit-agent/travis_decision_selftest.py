#!/usr/bin/env python3
"""Offline tests: Laya is stubbed; no real memory, network, or user files."""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
import travis_decision as d


def laya(choice, preference=0.93):
    def transport(url,payload):
        assert url == d.LAYA_ENDPOINT
        ids=list(payload["questions"]["action"]["criteria"])
        assert choice in ids
        remainder=(1.0-preference)/(len(ids)-1)
        return {"model":"laya-rl-agent","answers":{"action":{"type":"choice",
            "choice":choice,
            "probabilities":{key:preference if key==choice else remainder for key in ids},
            "confidence":0.82}}}
    return transport

class DecisionTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root=Path(tmp.name)
        self.repo=self.root/"does-not-exist"
        self.state=self.root/"private"
        self.good=lambda url:{"ok":True} if "18790" not in url else {"status":"ok"}

    def make(self,transport=None,fetch=None):
        return d.DecisionGovernor(self.state,self.repo,transport,fetch or self.good)

    def test_valid_laya_probability_semantics(self):
        options=["inspect_centro","request_approval","defer"]
        answer=d.laya_preferences("Check status",options,laya("inspect_centro"))
        self.assertEqual(answer["choice"],"inspect_centro")
        self.assertAlmostEqual(sum(answer["preferences"].values()),1,places=4)
        self.assertIn("not_real_success",answer["interpretation"])

    def test_laya_rejects_malicious_tool_and_bad_distributions(self):
        options=["inspect_centro","request_approval","defer"]
        def unsafe(url,payload):
            return {"answers":{"action":{"choice":"execute_shell",
              "probabilities":{"execute_shell":1.0}}}}
        with self.assertRaises(ValueError):
            d.laya_preferences("Check status",options,unsafe)
        def invalid(url,payload):
            return {"answers":{"action":{"choice":"inspect_centro",
               "probabilities":{"inspect_centro":1.0,"request_approval":0.8,"defer":0.4}}}}
        with self.assertRaises(ValueError):
            d.laya_preferences("Check status",options,invalid)

    def test_readonly_centro_success_independent_of_laya(self):
        g=self.make(laya("inspect_centro"))
        result=g.decide("Travis, decide se devemos verificar o estado do Centro")
        self.assertEqual(result["selected"],"inspect_centro")
        self.assertEqual(result["status"],"checked")
        self.assertEqual(result["verification"]["verdict"],"success")
        self.assertEqual(result["verification"]["scope"],"local_dependency_health")
        self.assertEqual(result["modelSource"],"laya")
        self.assertEqual(g.status()["decisions"],1)

    def test_memory_observation_is_readonly_and_measured(self):
        self.state.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(self.state/"memory.sqlite") as c:
            c.execute("CREATE TABLE travis_neurons(id TEXT)")
            c.execute("INSERT INTO travis_neurons VALUES('m1')")
        result=self.make(laya("inspect_memory")).decide("Decide sobre a integridade da memória")
        self.assertEqual(result["verification"]["verdict"],"success")
        self.assertEqual(result["verification"]["records"],1)

    def test_failure_is_not_verified_success(self):
        bad=lambda url:{"ok":False,"status":"failure"}
        result=self.make(laya("inspect_centro"),bad).decide("Decide se verificas o Centro")
        self.assertEqual(result["status"],"check_failed")
        self.assertEqual(result["verification"]["verdict"],"failure")

    def test_high_risk_never_calls_laya_or_executes(self):
        def forbidden(*args):
            raise AssertionError("Should not call model or tool for unauthorized operation")
        g=self.make(forbidden,forbidden)
        for task in ("Travis decide se podes apagar ficheiros",
                     "Deves publicar já o site?",
                     "Decide se vais pagar uma fatura",
                     "Decide se deves enviar emails"):
            result=g.decide(task)
            self.assertEqual(result["status"],"approval_required")
            self.assertEqual(result["selected"],"request_approval")
            self.assertEqual(result["verification"]["verdict"],"unknown")
        self.assertEqual(g.status()["decisions"],4)

    def test_no_clear_target_abstains(self):
        g=self.make(lambda *a: (_ for _ in ()).throw(AssertionError))
        result=g.decide("Travis decide qual a coisa melhor")
        self.assertEqual(result["selected"],"defer")
        self.assertEqual(result["status"],"deferred")

    def test_unavailable_laya_single_safe_option_fallback(self):
        def unavailable(*args):raise OSError("model down")
        g=self.make(unavailable)
        result=g.decide("Decide se o Centro responde")
        self.assertEqual(result["modelSource"],"deterministic_fallback")
        self.assertEqual(result["selected"],"inspect_centro")
        self.assertEqual(result["verification"]["verdict"],"success")
        self.assertEqual(result["relativePreferences"],{})

    def test_unavailable_laya_with_ambiguity_abstains(self):
        def unavailable(*args):raise OSError("model down")
        g=self.make(unavailable)
        result=g.decide("Decide sobre o estado do Centro e da memória")
        self.assertEqual(result["selected"],"defer")
        self.assertEqual(result["verification"]["verdict"],"unknown")

    def test_uncertain_laya_abstains_without_probing(self):
        def transport(url,payload):
            ids=list(payload["questions"]["action"]["criteria"])
            values={"inspect_centro":0.48,"defer":0.45,"request_approval":0.07}
            return {"answers":{"action":{"choice":"inspect_centro","probabilities":values}}}
        def bad_fetch(*args):raise AssertionError("Uncertain option was executed")
        result=self.make(transport,bad_fetch).decide("Decide o estado do Centro")
        self.assertEqual(result["status"],"deferred")
        self.assertEqual(result["fallbackReason"],"laya_uncertainty_threshold")

    def test_moderate_uncertainty_allows_reversible_observation(self):
        def transport(url,payload):
            return {"model":"laya-rl-agent","answers":{"action":{
               "choice":"inspect_laya",
               "probabilities":{"inspect_laya":0.5431,"request_approval":0.0226,"defer":0.4343}}}}
        result=self.make(transport).decide("Travis, decide se verificas o estado do Laya")
        self.assertEqual(result["selected"],"inspect_laya")
        self.assertEqual(result["layaPreferred"],"inspect_laya")
        self.assertEqual(result["status"],"checked")
        self.assertEqual(result["verification"]["verdict"],"success")

    def test_original_laya_preference_is_preserved_on_defer(self):
        def transport(url,payload):
            return {"model":"laya-rl-agent","answers":{"action":{
              "choice":"inspect_centro",
              "probabilities":{"inspect_centro":0.48,"request_approval":0.07,"defer":0.45}}}}
        outcome=self.make(transport).decide("Decide sobre o estado do Centro")
        self.assertEqual(outcome["selected"],"defer")
        self.assertEqual(outcome["layaPreferred"],"inspect_centro")
        self.assertIn("48.0%",outcome["reply"])

    def test_decisions_persist_with_digest_not_raw_task(self):
        secret="privado-unico-abc-for-security-testing"
        gov=self.make(laya("inspect_centro"))
        result=gov.decide("Centro "+secret)
        with sqlite3.connect(gov.dbpath) as c:
            row=c.execute("SELECT task_digest,selected,preferences FROM decisions").fetchone()
        self.assertEqual(len(row[0]),64)
        self.assertNotIn(secret,json.dumps(row))
        self.assertEqual(row[1],"inspect_centro")
        self.assertEqual(self.make().status()["decisions"],1)

    def test_repeated_real_failures_make_governor_defer(self):
        state=self.make(laya("inspect_centro"),lambda url:{"ok":False})
        for _ in range(10):
            self.assertEqual(state.decide("Verifica o Centro")["verification"]["verdict"],"failure")
        next_one=state.decide("Decide se o Centro está acessível")
        self.assertEqual(next_one["selected"],"defer")
        self.assertEqual(next_one["fallbackReason"],"prior_verified_failures_favor_deferring")
        self.assertEqual(next_one["verification"]["verdict"],"unknown")

    def test_historical_rate_requires_ten_independent_checks(self):
        g=self.make(laya("inspect_centro"))
        self.assertIsNone(g.historical("inspect_centro")["smoothedObservedRate"])
        for _ in range(10):g.decide("Decide se o Centro responde")
        self.assertEqual(g.historical("inspect_centro")["samples"],10)
        self.assertGreater(g.historical("inspect_centro")["smoothedObservedRate"],0.8)

    def test_observation_only_mode_does_not_call_fetch(self):
        def forbidden(*args):raise AssertionError("Side effect")
        result=self.make(laya("inspect_centro"),forbidden).decide("Decide o estado do Centro",execute=False)
        self.assertEqual(result["status"],"proposed")
        self.assertEqual(result["verification"]["verdict"],"unknown")

    def test_domain_does_not_create_any_write_candidate(self):
        for query in ["Travis decide sobre o Centro","Decide sobre a memória e o Laya",
                      "Decide se deves apagar o repositório"]:
            choices,_=d.domain_choices(query)
            self.assertTrue(set(choices).issubset(d.SAFE))
            self.assertTrue(all(c in d.READ_ONLY or c in {"request_approval","defer"}
                                for c in choices))

    def test_end_to_end_dialogue_in_isolated_runtime(self):
        import os
        import subprocess
        import sys
        code=r'''
import json
import jarvis_local as j
class QuantumFixture:
    def prepare(self, **kwargs):
        return {"phase":"fixture","strategyRoute":{"primary":"safe_local_check"},"tier":"local"}
    def ingest(self, *args, **kwargs):
        return {"status":kwargs.get("status","UNKNOWN")}
j.TRAVIS_QUANTUM=QuantumFixture()
j.TRAVIS_DECISIONS.transport=lambda url,payload:{
    "model":"laya-fixture","answers":{"action":{"choice":"inspect_centro",
    "probabilities":{"inspect_centro":0.95,"request_approval":0.03,"defer":0.02}}}}
j.TRAVIS_DECISIONS.fetch=lambda url:{"ok":True}
r=j.route("Travis, decide se deves verificar o Centro",{"language":"pt","session":"decision-ci-001"})
b=j.route("Travis decide se deves publicar o site",{"language":"pt","session":"decision-ci-001"})
assert r["tool"]=="decision_consult",r
assert r["verification"]["verdict"]=="success",r
assert r["completionStatus"]=="VERIFIED",r
assert r["result"]["selected"]=="inspect_centro",r
assert b["result"]["status"]=="approval_required",b
assert b["verification"]["verdict"]=="unknown",b
assert j.TRAVIS_DECISIONS.status()["decisions"]==2
print("DECISION_ROUTER_E2E_OK")
'''
        with tempfile.TemporaryDirectory() as tmp:
            env=dict(os.environ,HOME=tmp,PYTHONPATH=str(Path(__file__).resolve().parent))
            response=subprocess.run([sys.executable,"-c",code],env=env,
                        cwd=str(Path(__file__).resolve().parent),capture_output=True,
                        text=True,timeout=20)
            self.assertEqual(response.returncode,0,response.stderr[-1000:])
            self.assertIn("DECISION_ROUTER_E2E_OK",response.stdout)

if __name__=="__main__":
    unittest.main(verbosity=2)
