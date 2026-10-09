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
mod._IMAGES.clear()
with patch.object(mod,'api',return_value=page),patch.object(mod,'fetch',return_value=(b'<svg>','image/svg+xml')):
    result=mod.resolve('a different butterfly')
    assert result['ok'] and result['imageUnavailable'] and 'imageData' not in result
with patch.object(mod,'api',side_effect=TimeoutError):
    assert mod.resolve('network failure')['reason']=='reference-unavailable'
print('PASS VISUAL_RESEARCH: public origins, inert text, bounded image types, attribution, cache and offline result')

assert mod.request({'query':'cat','imageIndex':-1})['ok'] is False
assert mod.request({'query':'cat','imageIndex':'1'})['ok'] is False
assert mod.request({'query':'cat','imageIndex':True})['ok'] is False
assert mod.score_image({'imageTitle':'Football relief engraving 1800.jpg'},'football') < mod.score_image({'imageTitle':'Football match 2024.jpg'},'football')
commons={'query':{'pages':{str(i):{'index':i,'title':'File:'+name+'.jpg','imageinfo':[{'mime':'image/jpeg','width':1600,'height':1000,'thumburl':'https://upload.wikimedia.org/'+str(i)+'.jpg','descriptionurl':'https://commons.wikimedia.org/wiki/File:'+name+'.jpg','extmetadata':{'Artist':{'value':'<a>Author</a>'},'LicenseShortName':{'value':'CC BY-SA 4.0'}}}]} for i,name in enumerate(['Butterfly first','Butterfly second','Butterfly second 2','Butterfly swim meeting'],1)}}}
def mock_api(host,args):
    return commons if host=='commons.wikimedia.org' else page
mod._CACHE.clear();mod._IMAGES.clear()
with patch.object(mod,'api',side_effect=mock_api),patch.object(mod,'fetch',side_effect=lambda url:(url.encode(),'image/jpeg')) as fetch:
    first=mod.resolve('butterfly gallery')
    second=mod.resolve('butterfly gallery',image_index=1)
    assert first['imageCount']>=2 and first['imageIndex']==0
    assert second['imageIndex']==1 and first['imageData']!=second['imageData']
    assert second['author']=='Author' and second['license']=='CC BY-SA 4.0'
    assert sum('Butterfly second' in i['imageTitle'] for i in first['images'])==1
    assert mod.resolve('butterfly gallery',image_index=1)['cached']
    assert fetch.call_count==2, 'Navigation should reuse the result collection and decoded image cache'
print('PASS IMAGE_GALLERY: ranking, attribution, distinct results, indexed navigation, cache and input bounds')
