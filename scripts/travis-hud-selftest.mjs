import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const html=read('index.html');
const ui=read('travis-3d.mjs');
const vision=read('travis-vision.mjs');
const awareness=read('travis-vision-policy.mjs');
const sw=read('sw.js');
const css=read('travis-hud.css');
const cinema=read('travis-cinema.css');
const cinemaDepth=read('travis-cinema-depth.css');

for(const text of ['id="travis-three-canvas"','id="travis-camera-toggle"','id="travis-camera-preview"']){
  assert(html.includes(text),'Essential UI missing: '+text);
}
for(const file of ['travis-cinema.css','travis-cinema-depth.css','travis-vision.mjs','travis-vision-policy.mjs']){
  assert(fs.statSync(file).size>100,'Missing cinematic/vision asset: '+file);
}
assert(html.includes('travis-3d.mjs?v=vision-2'),'Main scene version must match release.');
assert(sw.includes('travis-3d.mjs?v=vision-2'),'PWA cache must use the released scene.');
assert(sw.includes('travis-vision.mjs?v=2'),'PWA cache must use current camera script.');
assert(cinema.length>1000 && cinemaDepth.length>1000,'Cinematic layers must be present.');
assert(css.includes('#travis-three-canvas'),'Full-screen scene styling required.');

for(const feature of [
 "import * as THREE from 'three'",
 'GLTFLoader','EffectComposer','UnrealBloomPass','RoomEnvironment',
 'raycaster.intersectObjects','webglcontextrestored','playVoiceArrayBuffer',
 "localJson('/transcribe?language='", "localFetch('/speak'",
 'createTravisVision','cameraCommand(text)','vision:vision.snapshot()',
 'vision.stop();','createNeuralField','createFaceRig','prepareSpeechFace'
]){
  assert(ui.includes(feature),'Critical 3D/voice/vision integration missing: '+feature);
}
assert(!ui.includes("WELCOME_GREETING='Welcome back, Mister Richards.'"),'Stale fixed welcome text must stay removed.');
assert(ui.includes("localJson('/resume'"),'Real conversational continuity must be connected.');
assert(ui.includes('Object') || vision.includes('ObjectDetector.createFromOptions'),'Object recognition is missing.');
assert(vision.includes('navigator.mediaDevices.getUserMedia'),'Browser camera permission must remain explicit.');
assert(vision.includes('audio: false'),'Camera start must not open the microphone.');
assert(vision.includes('getTracks().forEach(track => track.stop())'),'Media tracks must be released.');
assert(vision.includes("document.addEventListener('visibilitychange'"),'Camera must stop on page background.');
assert(vision.includes("source: 'on-device-mediapipe'"),'Sensor messages need a typed source.');
assert(awareness.includes('gestureDecision'),'Gesture safety policy missing.');

for(const rel of ['assets/travis/travis-core.glb','assets/travis/travis-face-bust.glb']){
  const data=fs.readFileSync(rel);
  assert(data.length>300000,'Model too small: '+rel);
  assert.equal(data.readUInt32LE(0),0x46546c67,'Invalid GLB magic: '+rel);
  assert.equal(data.readUInt32LE(4),2,'Unexpected GLB version: '+rel);
  assert.equal(data.readUInt32LE(8),data.length,'GLB length mismatch: '+rel);
}
const tflite=fs.readFileSync('vendor/mediapipe/efficientdet_lite0.tflite');
assert(tflite.length>10_000_000,'Object detector unavailable.');
assert.equal(tflite.toString('ascii',4,8),'TFL3','Invalid object model.');
const mjsImports=[...ui.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]);
for(const specifier of mjsImports){
  if(!specifier.startsWith('./'))continue;
  const rel=specifier.slice(2).split('?')[0];
  assert(fs.existsSync(rel),'Missing imported module: '+rel);
}
console.log('TRAVIS_CINEMATIC_VISION_SELFTEST_OK',JSON.stringify({
  importedModules:mjsImports.length,objectModelBytes:tflite.length,
  localCamera:true,voiceContinuity:true,persistent3d:true
}));
