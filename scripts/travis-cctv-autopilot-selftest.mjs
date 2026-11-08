import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraIntent,rankPublicCameras} from '../travis-cctv-auto-policy.mjs';

const cameras=[
  {id:'L1',name:'Westminster Road',city:'London',pack:'tfl',lat:51.51,lon:-0.127,feedType:'image'},
  {id:'A1',name:'Austin Main Street',city:'Austin',pack:'austin',lat:30.268,lon:-97.74,feedType:'image'},
  {id:'D1',name:'New Castle traffic',city:'New Castle County',pack:'deldot',lat:39.71,lon:-75.56,feedType:'hls'},
];

test('Portuguese and English public-camera selection intent',()=>{
  const pt=cameraIntent('Travis, mostra uma câmara pública em Londres');
  assert.equal(pt.action,'select');
  assert.equal(pt.lang,'pt');
  assert.equal(pt.scope.name,'Londres');
  const en=cameraIntent('Show a live camera in Austin');
  assert.equal(en.action,'select');
  assert.equal(en.lang,'en');
  assert.equal(en.live,true);
  assert.equal(en.scope.name,'Austin');
  assert.equal(cameraIntent('Mostra outra câmara').action,'next');
});
test('Never commandeer private or phone camera controls',()=>{
  assert.equal(cameraIntent('Liga a câmara do telemóvel'),null);
  assert.equal(cameraIntent('Show my front camera'),null);
  assert.equal(cameraIntent('Quantas câmaras existem?'),null);
  assert.equal(cameraIntent('Explica o que é CCTV'),null);
});
test('Only catalogued nearby/region sources are candidates',()=>{
  const london=cameraIntent('Mostra uma câmara em Londres');
  assert.deepEqual(rankPublicCameras(cameras,{scope:london.scope}).map(x=>x.id),['L1']);
  const porto=cameraIntent('Mostra uma câmara no Porto');
  assert.deepEqual(rankPublicCameras(cameras,{scope:porto.scope}),[]);
  const global=rankPublicCameras(cameras,{preferVideo:true});
  assert.equal(global[0].id,'D1');
  assert.equal(rankPublicCameras([...cameras,{id:'unapproved',lat:NaN,lon:0,feedType:'hls'}]).length,3);
});
