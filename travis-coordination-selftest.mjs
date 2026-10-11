import assert from 'node:assert/strict';
import {cameraIntent,rankPublicCameras} from './travis-cctv-auto-policy.mjs';
import {createMindLink} from './travis-mind-link.mjs';
const cameras=[
  {id:'one',name:'One',city:'Austin',pack:'austin',feedType:'image',lat:30.2,lon:-97.7},
  {id:'two',name:'Two',city:'Austin',pack:'austin',feedType:'image',lat:30.2,lon:-97.7},
  {id:'three',name:'Three',city:'London',pack:'tfl',feedType:'image',lat:51.5,lon:0},
  {id:'invalid',name:'Bad',feedType:'file',lat:0,lon:0}
];
assert.equal(cameraIntent('Show a random public camera').random,true);
const local=cameraIntent('Show a random camera in Austin');
assert.equal(local.global,false);assert.equal(local.scope.city,'austin');
let random=[.9,.1,.5],index=0;
assert.equal(rankPublicCameras(cameras,{random:()=>random[index++]} )[0].id,'two');
assert.deepEqual(rankPublicCameras(cameras,{scope:local.scope,exclude:new Set(['one']),random:()=>.5}).map(c=>c.id),['two']);
const events=new EventTarget(),sent=[],announced=[];
let session='browser-test-2026',epoch=1;
const link=createMindLink({events,getSession:()=>session,getEpoch:()=>epoch,
  getDisplay:()=>({active:true,scene:'public-camera',sourceId:'two'}),active:()=>true,
  post:async body=>{sent.push(body);return {ok:true};},onResult:r=>announced.push(r),interval:999999});
function emit(type,detail){const event=new Event(type);event.detail=detail;events.dispatchEvent(event);}
emit('travis:cctv-auto-request',{id:'camera-request-01',text:'Show a random public camera'});
emit('travis:cctv-auto-result',{id:'camera-request-01',kind:'snapshot',sourceId:'two',verified:true});
await new Promise(resolve=>setTimeout(resolve,0));await link.flush();
assert.deepEqual(sent.map(x=>x.action),['requested','result','observe']);
assert.equal(sent[1].session,'browser-test-2026');assert.equal(announced.length,1);
emit('travis:cctv-auto-request',{id:'camera-request-02',text:'Show another camera'});
epoch++;session='different-session-2026';
emit('travis:cctv-auto-result',{id:'camera-request-02',kind:'snapshot',sourceId:'one',verified:true});
await new Promise(resolve=>setTimeout(resolve,0));await link.flush();
assert.equal(sent.at(-1).session,'browser-test-2026');assert.equal(announced.length,1);
link.destroy();
console.log('PASS: random registered selection, explicit location, ordered receipts, session isolation and interrupted speech suppression');
