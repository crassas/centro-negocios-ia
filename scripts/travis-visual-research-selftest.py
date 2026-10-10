"""No external requests: validate origin bounds, data handling and reference outcomes."""
import importlib.util
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('visual_research',Path(__file__).resolve().parents[1]/'operit-agent/travis_visual_research.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
external_images=mod.external_images
mod.external_images=lambda query: []  # Legacy Wikimedia fixtures make no network calls.
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

mod.external_images=external_images
# These fixtures cover actual provider shapes and failure isolation, not just a
# list of URLs. A failed provider must not remove another provider's results.
nasa={'collection':{'items':[{'data':[{'title':'Jupiter','nasa_id':'PIA001','secondary_creator':'NASA/JPL'}],
    'links':[{'rel':'preview','href':'https://images-assets.nasa.gov/image/PIA001/PIA001~thumb.jpg','width':900,'height':800}]}]}}
with patch.object(mod,'json_api',return_value=nasa):
    images=mod.nasa_images('Jupiter');assert images[0]['source']=='NASA' and images[0]['author']=='NASA/JPL'
with patch.object(mod,'nasa_images',return_value=images),patch.object(mod,'naturalist_images',side_effect=TimeoutError):
    assert mod.external_images('Jupiter')==images
taxa={'results':[{'id':123,'name':'Papilionoidea','preferred_common_name':'Butterflies'}]}
observations={'results':[{'id':1,'photos':[{'url':'https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg','license_code':'cc-by','attribution':'Artist'}]},
    {'id':2,'photos':[{'url':'https://static.inaturalist.org/photos/2/square.jpg','license_code':None}]}]}
with patch.object(mod,'json_api',side_effect=[taxa,observations]):
    natural=mod.naturalist_images('butterfly');assert len(natural)==1 and natural[0]['source']=='iNaturalist' and '/medium.jpg' in natural[0]['imageUrl']
mod._CACHE.clear();mod._IMAGES.clear()
with patch.object(mod,'api',side_effect=mock_api),patch.object(mod,'external_images',return_value=images+natural),patch.object(mod,'fetch',return_value=(b'jpeg','image/jpeg')):
    result=mod.resolve('Jupiter gallery');assert {'NASA','iNaturalist','Wikipedia'} <= {x['source'] for x in result['images']}
print('PASS MULTISOURCE: NASA, iNaturalist licensed photos, diversity, provider isolation and provenance')

catalog={'chair':{'name':'Wooden Chair','type':2,'polycount':400,'tags':['chair','wooden']},
    'table':{'name':'Table','type':2,'polycount':400,'tags':['furniture']},
    'box':{'name':'Power Box','type':2,'polycount':400,'tags':['electricity']}}
assert mod.model_candidates('cadeira de madeira',catalog)[0][1]=='chair'
assert mod.model_candidates('motor elétrico',catalog)==[]
assert mod.model_candidates('cadeira gigante invisível',catalog)==[]
gltf={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],
    'meshes':[{'primitives':[{'attributes':{'POSITION':0},'material':0}]}],
    'accessors':[{'count':3,'type':'VEC3'}],'buffers':[{'byteLength':36,'uri':'chair.bin'}],
    'materials':[{'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}],
    'images':[{'uri':'https://evil.test/texture.jpg'}]}
include={'chair.bin':{'url':'https://dl.polyhaven.org/file/chair.bin','size':36}}
with patch.object(mod,'fetch',return_value=(b'\0'*36,'application/octet-stream')):
    document,triangles=mod.geometry_document(mod.copy.deepcopy(gltf),include)
    assert triangles==1 and 'images' not in document and 'materials' not in document
    assert 'material' not in document['meshes'][0]['primitives'][0]
    assert document['buffers'][0]['uri'].startswith('data:application/octet-stream;base64,')
for change in [{'extensionsRequired':['KHR_draco_mesh_compression']},{'buffers':[{'byteLength':5000000,'uri':'x'}]},
               {'materials':[{'alphaMode':'MASK'}]},{'skins':[{}]}]:
    try:mod.geometry_document({**mod.copy.deepcopy(gltf),**change},include)
    except ValueError:pass
    else:raise AssertionError(change)
with patch.object(mod,'resolve_model',return_value={'ok':True,'representation':'model-3d'}),patch.object(mod,'collection',side_effect=AssertionError('3D must bypass photos')):
    assert mod.request({'query':'cadeira','preferModel':True})['representation']=='model-3d'
with patch.object(mod,'resolve_model',side_effect=AssertionError('Explicit photos must not request 3D')),patch.object(mod,'collection',return_value={'ok':False,'images':[]}):
    assert not mod.request({'query':'another chair','preferModel':False})['ok']
print('PASS REAL_3D: object matching, geometry-only embedding, resource bounds, default 3D and explicit photo routing')

atlas={**mod.copy.deepcopy(gltf),'textures':[{'source':0}],'images':[{'uri':'detail.jpg'}]}
with patch.object(mod,'fetch',return_value=(b'jpeg','image/jpeg')) as fetch:
    assert mod.model_detail_image(atlas,{'detail.jpg':{'url':'https://dl.polyhaven.org/detail.jpg','size':400}}).startswith('data:image/jpeg;base64,')
    assert mod.model_detail_image(atlas,{'detail.jpg':{'url':'https://dl.polyhaven.org/detail.jpg','size':900000}}) is None
    assert fetch.call_count==1
print('PASS MODEL_DETAIL: bounded optional atlas on real mesh UVs; no large texture requests')
