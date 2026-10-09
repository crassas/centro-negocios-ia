"""Regression tests for optional, read-only, grounded visual intent."""
import importlib.util
import pathlib

path=pathlib.Path(__file__).with_name("travis_visual_semantics.py")
spec=importlib.util.spec_from_file_location("travis_visual_semantics",path)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def propose(system,request):
    assert "No tools or side effects" in system
    assert len(request)>5
    return {"intent":"visual","scene":"object",
            "subject":"an imaginary crystal citadel","confidence":0.94}
assert module.resolve("Imagine a crystal citadel in 3D",propose)["scene"]=="object"
assert module.resolve("Como seria um castelo cristalino?",lambda *_:{
    "intent":"visual","scene":"house","subject":"castelo de cristal","confidence":0.94})["scene"]=="house"
for request in [
    "Don't imagine a castle","Não quero visualizar um prédio",
    "Can you show me my bank account?", "Open YouTube", "Read my emails",
    "What is the capital of Portugal?", "Change my GitHub code"
]:
    assert not module.resolve(request,propose)["ok"],request
assert module.resolve("I wonder how an imaginary cube might look",lambda *_:{
 "intent":"visual","scene":"object","subject":"<script>alert(1)</script>","confidence":.99})["ok"] is False
assert module.resolve("Imagine an imaginary planet",lambda *_:{
 "intent":"visual","scene":"planet","subject":"Planet X","confidence":.3})["ok"] is False
assert module.resolve("Imagine an imaginary planet",lambda *_:{
 "intent":"create_payment","scene":"planet","subject":"Planet X","confidence":.9})["ok"] is False
assert module.resolve("I wonder how a dragon looks",None)["ok"] is False
assert module.resolve("I wonder how a dragon looks",lambda *_: (_ for _ in ()).throw(TimeoutError()))["ok"] is False
print("PASS_VISUAL_SEMANTICS: model response gates, safe visuals, no mutation, no fake media")
