import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const stage = document.getElementById('travis-three-stage');
const hud = document.getElementById('travis-hud');
if (!stage || !hud) throw new Error('Travis 3D mount missing');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(0, 0.15, 11.5);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
  premultipliedAlpha: true
});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
stage.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1,1), 1.1, 0.62, 0.18);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const world = new THREE.Group();
world.rotation.x = -0.05;
scene.add(world);

const ambient = new THREE.AmbientLight(0x5ecfff, 0.32);
scene.add(ambient);
const key = new THREE.PointLight(0x75eaff, 22, 18, 2);
key.position.set(0, 1.8, 5.5);
scene.add(key);
const rim = new THREE.PointLight(0xff315d, 8, 14, 2);
rim.position.set(-4.2, -1.5, 2.8);
scene.add(rim);

const beamMaterial = new THREE.MeshBasicMaterial({
  color: 0x4edcff,
  transparent: true,
  opacity: 0.045,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});
const beam = new THREE.Mesh(new THREE.ConeGeometry(2.3, 8.5, 48, 1, true), beamMaterial);
beam.rotation.x = Math.PI;
beam.position.z = -0.7;
beam.position.y = 2.8;
beam.scale.z = 0.34;
world.add(beam);

const haloMat = new THREE.MeshBasicMaterial({
  color: 0x62e7ff,
  transparent: true,
  opacity: 0.055,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});
for (const [r, z, rx] of [[3.25,-.55,1.18],[2.75,-.28,1.25],[2.2,.05,1.32]]) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r,.018,6,128),haloMat.clone());
  ring.position.z=z;
  ring.rotation.x=rx;
  world.add(ring);
}

let model = null;
let rotors = [];
let ticks = null;
let energy = null;
let coreGlass = null;
let ready = false;
let opening = 0;
let commandOpen = false;
let pointer = {x:0,y:0};
let currentPointer = {x:0,y:0};
const clock = new THREE.Clock();

function tuneMaterial(mat) {
  if (!mat) return;
  const name = mat.name || '';
  if (name.includes('Emissive')) {
    mat.toneMapped = false;
    if (mat.emissive) {
      if (name.includes('Red')) mat.emissive.setRGB(1.0,.018,.08);
      else if (name.includes('White')) mat.emissive.setRGB(.72,1.0,1.0);
      else mat.emissive.setRGB(.05,.86,1.0);
      mat.emissiveIntensity = name.includes('White') ? 4.8 : 3.2;
    }
  }
  if (name.includes('Metal')) {
    mat.metalness = .9;
    mat.roughness = .22;
  }
  if (name.includes('Glass')) {
    mat.transparent = true;
    mat.opacity = .38;
    mat.metalness = .25;
    mat.roughness = .08;
  }
  mat.needsUpdate = true;
}

new GLTFLoader().load(
  './assets/travis/travis-core.glb?v=1',
  (gltf) => {
    model = gltf.scene;
    model.scale.setScalar(.88);
    model.rotation.x = -0.02;
    model.traverse((obj) => {
      if (obj.isMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(tuneMaterial);
      }
      if (/^Rotor_\d+$/.test(obj.name)) rotors.push(obj);
      if (obj.name === 'Rotor_Ticks') ticks = obj;
      if (obj.name === 'CoreEnergySphere') energy = obj;
      if (obj.name === 'CoreGlassSphere') coreGlass = obj;
    });
    world.add(model);
    ready = true;
    window.dispatchEvent(new CustomEvent('travis3dready'));
  },
  undefined,
  (error) => {
    console.error('Travis 3D load failed', error);
    stage.classList.add('three-failed');
  }
);

function resize() {
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.35 : 1.65);
  renderer.setPixelRatio(dpr);
  renderer.setSize(rect.width, rect.height, false);
  composer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

function stateBoost() {
  const s = hud.dataset.state;
  if (s === 'speaking') return 1.28;
  if (s === 'thinking') return 1.18;
  if (s === 'listening') return 1.12;
  if (s === 'booting') return 1.06;
  return 1;
}

function animate() {
  requestAnimationFrame(animate);
  if (!hud.classList.contains('is-open')) return;
  const t = clock.getElapsedTime();
  opening += (1 - opening) * .055;
  currentPointer.x += (pointer.x-currentPointer.x)*.045;
  currentPointer.y += (pointer.y-currentPointer.y)*.045;

  world.rotation.y = currentPointer.x * .085;
  world.rotation.x = -.05 - currentPointer.y * .055;
  world.position.x = currentPointer.x * .08;
  world.position.y = currentPointer.y * -.05;

  const boost = stateBoost();
  rotors.forEach((rotor,i) => {
    const dir = i % 2 ? -1 : 1;
    rotor.rotation.z += dir * (0.0017 + i*.00042) * boost;
    rotor.position.z = Math.sin(t*.45+i*.75)*.025;
  });
  if (ticks) ticks.rotation.z -= .00125 * boost;

  if (energy) {
    const p = 1 + Math.sin(t*2.25)*.035*boost;
    energy.scale.setScalar(p);
  }
  if (coreGlass) coreGlass.rotation.z += .0007;

  beam.material.opacity = .035 + Math.sin(t*.8)*.012;
  bloom.strength = 1.0 + (boost-1)*1.2 + Math.sin(t*1.1)*.05;

  if (model) {
    model.scale.setScalar(.88 * Math.min(1, .76 + opening*.24));
    model.visible = opening > .02;
  }
  composer.render();
}
animate();

function setPointer(x,y) {
  pointer.x = THREE.MathUtils.clamp(x,-1,1);
  pointer.y = THREE.MathUtils.clamp(y,-1,1);
}
hud.addEventListener('pointermove',(e)=>{
  setPointer((e.clientX/innerWidth-.5)*2,(e.clientY/innerHeight-.5)*2);
},{passive:true});
hud.addEventListener('pointerleave',()=>setPointer(0,0),{passive:true});

window.addEventListener('travis3dcommands',(e)=>{
  commandOpen = !!e.detail?.open;
  if (!model) return;
  const spread = commandOpen ? 1 : 0;
  rotors.forEach((rotor,i)=>{
    rotor.userData.targetZ = spread * ((i-2.5)*.08);
  });
});

window.addEventListener('travis3dreset',()=>{
  opening = 0;
  setPointer(0,0);
});

window.Travis3D = Object.freeze({
  get ready(){ return ready; },
  setPointer,
  setBloom(value){ bloom.strength = THREE.MathUtils.clamp(value,.3,2.5); }
});
