"""Executable camera-colour contract without importing the running Travis server."""
import ast
import re
import time
import types
import unicodedata
from pathlib import Path

source=Path(__file__).with_name("jarvis_local.py").read_text()
tree=ast.parse(source)
wanted={"clean_vision","face_colour_description","vision_dialogue","norm"}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted]
assert len(nodes)==4
env={"re":re,"time":time,"unicodedata":unicodedata,
     "DIALOGUE_INFO":types.SimpleNamespace(language="pt"),
     "TRAVIS_VISUAL_LABELS":{"person","bottle","book"},
     "dialogue_turns":lambda _:[]}
exec(compile(ast.Module(body=nodes,type_ignores=[]),"<travis-vision-contract>","exec"),env)

def frame(rgb,contrast=12,age=0,face=True):
    now=int(time.time()*1000)
    return env["clean_vision"]({
        "source":"on-device-mediapipe","active":True,
        "observedAt":now,"faceDetected":face,"gesture":"None",
        "objects":[],"objectModel":"ready","frames":10,
        "faceColor":{"rgb":rgb,"contrast":contrast,"observedAt":now-age}
    })

v=frame([151,104,78],29)
assert v["faceColor"]["rgb"]==[151,104,78]
answer=env["vision_dialogue"]("De que cor é a minha cara?",{"vision":v})
assert "castanho médio" in answer and "RGB 151, 104, 78" in answer,answer
assert "diferença de luz" in answer,answer
print("PT",answer)
view=env["vision_dialogue"]("O que vês?",{"vision":v})
assert "rosto" in view and "castanho médio" in view,view
env["DIALOGUE_INFO"].language="en"
english=env["vision_dialogue"]("What colour is my face?",{"vision":v})
assert "medium brown" in english and "151, 104, 78" in english,english
print("EN",english)
dark=env["vision_dialogue"]("What colour is my skin?",{"vision":frame([69,42,28])})
assert "dark brown" in dark,dark
unmeasured=env["vision_dialogue"]("What colour is my face?",{"vision":frame([90,66,44],face=True,age=20000)})
assert "don't have a valid colour sample" in unmeasured,unmeasured
unsafe=env["clean_vision"]({"source":"on-device-mediapipe","active":True,
   "observedAt":int(time.time()*1000),"faceDetected":True,
   "faceColor":{"rgb":["brown","brown","brown"],"observedAt":int(time.time()*1000)}})
assert unsafe["faceColor"] is None,unsafe
no_face=env["vision_dialogue"]("What colour is my face?",{"vision":frame([100,78,55],face=False)})
assert "Show your face" in no_face,no_face
assert env["vision_dialogue"]("What colour is my t-shirt?",{"vision":v}) is None
env["dialogue_turns"]=lambda ctx:[{"tool":"vision_observation","assistant":"Through the camera, I can detect a face."}]
follow=env["vision_dialogue"]("And what colour is it?",{"vision":v,"session":"test-context-123456"})
print("FOLLOWUP",follow)
assert follow and "medium brown" in follow
print("PASS BACKEND: PT/EN RGB, lighting, visible face, stale samples, invalid inputs, follow-up")
