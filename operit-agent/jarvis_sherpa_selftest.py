#!/usr/bin/env python3
"""Offline CI: Sherpa guard and backend integration without model or network."""
import ast
import io
import json
import os
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import jarvis_sherpa as sherpa


class FakeWorker:
    def __init__(self,result,model):
        self.result=result
        self.model=Path(model)
        self.calls=[]
    def request(self,payload):
        self.calls.append(payload)
        with wave.open(str(payload["path"]),"rb") as f:
            assert (f.getnchannels(),f.getsampwidth(),f.getframerate())==(1,2,16000)
        return "TRAVIS_STT:"+json.dumps({"text":self.result})


class SherpaTests(unittest.TestCase):
    def test_readonly_short_candidate_is_eligible(self):
        self.assertTrue(sherpa.safe_short_read_transcript("Verifica o estado do Centro de Negócios"))
        self.assertTrue(sherpa.safe_short_read_transcript("Please check the local server"))
    def test_mutations_are_never_fast_approved(self):
        for text in (
            "Apaga todos os ficheiros do Centro",
            "Publica agora o site na internet",
            "Envia um email ao cliente",
            "Paga já o cartão",
            "Delete the whole repository",
            "Deploy changes to the website",
            "Modifica os dados de clientes",
        ):
            self.assertFalse(sherpa.safe_short_read_transcript(text),text)
    def test_empty_repeated_and_long_are_rejected(self):
        for text in ("", "sim", "Travis", "yuk "*23, "I "*121):
            self.assertFalse(sherpa.safe_short_read_transcript(text),text[:30])
    def test_never_reads_arbitrary_wav_path(self):
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)/"audio.wav"
            target.write_bytes(b"RIFF")
            with self.assertRaises(ValueError):
                sherpa.read_pcm(target)
    def test_adaptive_route_and_safety_fallback(self):
        source=Path(__file__).with_name("jarvis_local.py").read_text()
        nodes=[n for n in ast.parse(source).body
               if isinstance(n,ast.FunctionDef) and n.name=="transcribe"]
        self.assertEqual(len(nodes),1)
        with tempfile.TemporaryDirectory() as path:
            root=Path(path)
            (root/"venv/bin").mkdir(parents=True)
            (root/"venv/bin/python").write_text("fixture")
            model=root/"model.gguf"
            model.write_text("fixture")
            speech=io.BytesIO()
            with wave.open(speech,"wb") as f:
                f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000)
                f.writeframes(struct.pack("<1600h",*[1000]*1600))
            fast=FakeWorker("Consulta o estado do Centro",model)
            precise=FakeWorker("Whisper verification",model)
            pt=FakeWorker("Whisper Portuguese",model)
            candidate=FakeWorker("Verifica o estado do Centro de Negócios",model)
            records=[]
            env=dict(ROOT=root,MODELS=root,
                     SHERPA_STT_WORKER=candidate,FAST_STT_WORKER=fast,
                     STT_WORKER=precise,PT_STT_WORKER=pt,
                     jarvis_sherpa=sherpa,tempfile=tempfile,Path=Path,
                     time=__import__("time"),json=json,wave=wave,io=io,
                     os=os,RuntimeError=RuntimeError,ValueError=ValueError,
                     TimeoutError=TimeoutError,TypeError=TypeError,
                     command=lambda *a,**kw: (_ for _ in ()).throw(AssertionError("No FFmpeg")),
                     event=lambda name,detail:records.append((name,detail)))
            exec(compile(ast.Module(body=nodes,type_ignores=[]),
                         "<sherpa-transcribe>", "exec"),env)
            with patch.dict(os.environ,{"TRAVIS_STT_BACKEND":"sherpa","TRAVIS_STT_MODE":"fast"}):
                text=env["transcribe"](speech.getvalue(),"pt")
                self.assertEqual(text,"Verifica o estado do Centro de Negócios")
                self.assertEqual(len(candidate.calls),1)
                self.assertEqual(len(pt.calls),0)
                self.assertEqual(records[-1][1]["engine"],"sherpa-rapid-readonly")
                candidate.result="Publica agora o site"
                text=env["transcribe"](speech.getvalue(),"pt")
                self.assertEqual(text,"Whisper Portuguese")
                self.assertEqual(len(pt.calls),1)
                with patch.dict(os.environ,{"TRAVIS_STT_BACKEND":"whisper"}):
                    candidate.result="Verifica o Centro"
                    text=env["transcribe"](speech.getvalue(),"en")
                    self.assertEqual(text,"Consulta o estado do Centro")
                    self.assertEqual(len(candidate.calls),2)


if __name__=="__main__":
    unittest.main(verbosity=2)
