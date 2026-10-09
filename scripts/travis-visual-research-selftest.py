"""No external requests: validate origin bounds, data handling and reference outcomes."""
import importlib.util
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('visual_research',Path(__file__).resolve().parents[1]/'operit-agent/travis_visual_research.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
for url in ['http://en.wikipedia.org/wiki/X','https://localhost/a','https://en.wikipedia.org.evil.test/a','https://user:pass@en.wikipedia.org/','https://upload.wikimedia.org:8443/a']:
    try:mod.public_url(url)
    except ValueError:pass
    else:raise AssertionError(url)
assert mod.request({'query':'https://localhost/'})['ok'] is False
page={'query':{'pages':{'1':{'index':1,'title':'Butterfly','extract':'<b>A butterfly</b> is an insect.','fullurl':'https://en.wikipedia.org/wiki/Butterfly','pageimage':'Butterfly.jpg','thumbnail':{'source':'https://upload.wikimedia.org/wikipedia/commons/b/bb/Butterfly.jpg'}}}}}
with patch.object(mod,'api',return_value=page),patch.object(mod,'fetch',return_value=(b'jpeg-fixture','image/jpeg')):
    result=mod.resolve('butterfly')
    assert result['ok'] and result['representation']=='image-relief'
    assert result['summary']=='A butterfly is an insect.'
    assert result['imageData'].startswith('data:image/jpeg;base64,')
    assert result['creditUrl'].startswith('https://commons.wikimedia.org/wiki/File:')
    assert mod.resolve('butterfly')['cached'] is True
with patch.object(mod,'api',return_value=page),patch.object(mod,'fetch',return_value=(b'<svg>','image/svg+xml')):
    result=mod.resolve('a different butterfly')
    assert result['ok'] and result['imageUnavailable'] and 'imageData' not in result
with patch.object(mod,'api',side_effect=TimeoutError):
    assert mod.resolve('network failure')['reason']=='reference-unavailable'
print('PASS VISUAL_RESEARCH: public origins, inert text, bounded image types, attribution, cache and offline result')
