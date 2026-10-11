import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraIntent,rankPublicCameras} from '../travis-cctv-auto-policy.mjs';
import {interpretGeoRequest} from '../travis-gev-intents.mjs';
test('Natural street requests resolve without camera IDs',()=>{
  for(const phrase of ["See what's going on in London",'Travis, see what is happening in London.','Show me the streets in London']){
    const intent=cameraIntent(phrase);
    assert.equal(intent.action,'select');assert.equal(intent.scope.city,'london');assert.equal(intent.lang,'en');
  }
  assert.equal(cameraIntent('See what is going on in Bergen').scope.city,'bergen');
  assert.equal(cameraIntent('Show me London'),null);
});
test('Any-camera requests, scoped requests and contextual follow-ups stay distinct',()=>{
  for(const phrase of ['Activate cameras','“Show a random public camera.”','Bring one camera to the front'])assert.equal(cameraIntent(phrase).global,true);
  assert.equal(cameraIntent('Show a camera here').global,false);
  assert.equal(cameraIntent('Show a random camera in Austin').global,false);
  assert.equal(cameraIntent('Show another one'),null);
  assert.equal(cameraIntent('Show another one',{cameraActive:true}).action,'next');
  assert.equal(cameraIntent('Where are cameras available?').action,'coverage');
  assert.equal(cameraIntent('Disable camera').action,'close');
});
test('Oslo does not include unrelated Norway cameras',()=>{
  const sources=[{id:'oslo',name:'Oslo street',city:'Norway',pack:'vegvesen',lat:59.914,lon:10.75,feedType:'image'},
    {id:'bergen',name:'Bergen street',city:'Norway',pack:'vegvesen',lat:60.39,lon:5.32,feedType:'image'}];
  assert.deepEqual(rankPublicCameras(sources,{scope:cameraIntent('Show a camera in Oslo').scope}).map(s=>s.id),['oslo']);
});
test('Flights and returning to core bypass the generic model',()=>{
  assert.deepEqual(interpretGeoRequest('Flights').layers,['flights']);
  for(const phrase of ['Return to the core.','Return to core','Back to Travis','Close the map'])assert.equal(interpretGeoRequest(phrase).type,'close');
  assert.equal(interpretGeoRequest('Travis, take me there.').cue,'take-me-there');
});
test('Catalogue outage is not a geographic coverage claim',async()=>{
  globalThis.document={hidden:false,querySelector:()=>null,getElementById:()=>null};
  globalThis.window={addEventListener(){},dispatchEvent(){},TravisCctv:{load:async()=>({state:'error'}),locations:()=>[]},TravisCctvPlayer:{openCamera(){throw Error('Must not select from an unavailable catalogue');}}};
  await import('../travis-cctv-autopilot.mjs?repair-selftest');
  const result=await window.TravisCctvAutopilot.select(cameraIntent('See what is going on in London'));
  assert.equal(result.reason,'catalogue-unavailable');assert.match(result.reply,/catalogue is unavailable/i);assert.equal(result.verified,false);
});
