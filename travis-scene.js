import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const stage=document.getElementById('travis-three-stage');
const hud=document.getElementById('travis-hud');
if(!stage||!hud)throw new Error('Travis 3D mount missing');

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(31,1,.1,100);
camera.position.set(0,.06,11.9);

const renderer=new THREE.WebGLRenderer({
  antialias:true,
  alpha:true,
  powerPreference:'high-performance',
  premultipliedAlpha:false
});
renderer.setClearColor(0x000000,0);
renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<700?1.25:1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.72;
renderer.sortObjects=true;
stage.appendChild(renderer.domElement);

const world=new THREE.Group();
world.rotation.x=-.035;
scene.add(world);

scene.add(new THREE.HemisphereLight(0x76ddff,0x02070b,.36));
const key=new THREE.DirectionalLight(0x8beaff,2.35);
key.position.set(2.4,3.4,5.8);
scene.add(key);
const fill=new THREE.DirectionalLight(0x1d6fa8,.72);
fill.position.set(-4,-1.5,4);
scene.add(fill);
const rim=new THREE.PointLight(0xff315d,2.2,14,2);
rim.position.set(-4.4,-1.4,3.1);
scene.add(rim);

function radialTexture(inner,outer){
  const c=document.createElement('canvas');
  c.width=c.height=256;
  const x=c.getContext('2d');
  const g=x.createRadialGradient(128,128,0,128,128,128);
  g.addColorStop(0,inner);
  g.addColorStop(.18,inner);
  g.addColorStop(.55,outer);
  g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.fillRect(0,0,256,256);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}

function glowSprite(colorTexture,scale,z,opacity){
  const mat=new THREE.SpriteMaterial({
    map:colorTexture,
    transparent:true,
    opacity,
    blending:THREE.AdditiveBlending,
    depthWrite:false,
    toneMapped:false
  });
  const s=new THREE.Sprite(mat);
  s.scale.set(scale,scale,1);
  s.position.z=z;
  world.add(s);
  return s;
}
const cyanGlow=radialTexture('rgba(118,238,255,.62)','rgba(27,151,231,.08)');
const redGlow=radialTexture('rgba(255,82,118,.38)','rgba(180,18,55,.03)');
const coreHalo=glowSprite(cyanGlow,5.4,-.22,.27);
const innerHalo=glowSprite(cyanGlow,2.35,.36,.34);
const redHalo=glowSprite(redGlow,4.8,-.38,.09);

const beamMaterial=new THREE.MeshBasicMaterial({
  color:0x55dbff,transparent:true,opacity:.018,blending:THREE.AdditiveBlending,
  depthWrite:false,side:THREE.DoubleSide,toneMapped:false
});
const beam=new THREE.Mesh(new THREE.ConeGeometry(2.15,8.8,48,1,true),beamMaterial);
beam.rotation.x=Math.PI;
beam.position.set(0,2.85,-.85);
beam.scale.z=.32;
world.add(beam);

const haloMat=new THREE.MeshBasicMaterial({
  color:0x62e7ff,transparent:true,opacity:.07,blending:THREE.AdditiveBlending,
  depthWrite:false,side:THREE.DoubleSide,toneMapped:false
});
for(const [r,z,rx,opacity] of [[3.18,-.58,1.19,.05],[2.68,-.31,1.26,.07],[2.12,-.03,1.33,.08]]){
  const mat=haloMat.clone();mat.opacity=opacity;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.012,6,128),mat);
  ring.position.z=z;ring.rotation.x=rx;world.add(ring);
}

let model=null;
let rotors=[];
let ticks=null;
let energy=null;
let coreGlass=null;
let ready=false;
let opening=0;
let commandOpen=false;
let pointer={x:0,y:0};
let currentPointer={x:0,y:0};
const clock=new THREE.Clock();

function tuneMaterial(mat){
  if(!mat)return;
  const name=mat.name||'';

  if(name.includes('Emissive')){
    mat.toneMapped=false;
    if(mat.emissive){
      if(name.includes('Red'))mat.emissive.setRGB(.78,.012,.045);
      else if(name.includes('White'))mat.emissive.setRGB(.58,.93,1);
      else mat.emissive.setRGB(.025,.58,.78);
      mat.emissiveIntensity=name.includes('White')?1.65:1.15;
    }
    if(mat.color){
      if(name.includes('Red'))mat.color.setRGB(.22,.008,.022);
      else mat.color.setRGB(.018,.15,.22);
    }
  }

  if(name.includes('MetalDark')){
    mat.color?.setRGB(.018,.026,.034);
    mat.metalness=.72;mat.roughness=.34;
  }else if(name.includes('Metal')){
    mat.color?.setRGB(.035,.055,.07);
    mat.metalness=.68;mat.roughness=.31;
  }

  if(name.includes('CoreGlass')){
    mat.transparent=true;mat.opacity=.22;mat.metalness=.18;mat.roughness=.11;
    mat.depthWrite=false;
  }
  if(name.includes('CoreEnergy')){
    mat.toneMapped=false;
    if(mat.emissive){mat.emissive.setRGB(.06,.64,.82);mat.emissiveIntensity=1.45;}
  }
  mat.needsUpdate=true;
}

new GLTFLoader().load(
  './assets/travis/travis-core.glb?v=1',
  gltf=>{
    model=gltf.scene;
    model.scale.setScalar(.89);
    model.rotation.x=-.018;
    model.traverse(obj=>{
      if(obj.isMesh){
        const mats=Array.isArray(obj.material)?obj.material:[obj.material];
        mats.forEach(tuneMaterial);
      }
      if(/^Rotor_\d+$/.test(obj.name)){
        obj.userData.baseZ=obj.position.z;
        obj.userData.targetZ=obj.position.z;
        rotors.push(obj);
      }
      if(obj.name==='Rotor_Ticks')ticks=obj;
      if(obj.name==='CoreEnergySphere')energy=obj;
      if(obj.name==='CoreGlassSphere')coreGlass=obj;
    });
    world.add(model);
    ready=true;
    window.dispatchEvent(new CustomEvent('travis3dready'));
  },
  undefined,
  error=>{
    console.error('Travis 3D load failed',error);
    stage.classList.add('three-failed');
  }
);

function resize(){
  const rect=stage.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<700?1.25:1.5));
  renderer.setSize(rect.width,rect.height,false);
  camera.aspect=rect.width/rect.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

function stateBoost(){
  const s=hud.dataset.state;
  if(s==='speaking')return 1.22;
  if(s==='thinking')return 1.16;
  if(s==='listening')return 1.1;
  if(s==='booting')return 1.05;
  return 1;
}

function animate(){
  requestAnimationFrame(animate);
  if(!hud.classList.contains('is-open'))return;

  const t=clock.getElapsedTime();
  opening+=(1-opening)*.06;
  currentPointer.x+=(pointer.x-currentPointer.x)*.045;
  currentPointer.y+=(pointer.y-currentPointer.y)*.045;

  world.rotation.y=currentPointer.x*.07;
  world.rotation.x=-.035-currentPointer.y*.045;
  world.position.x=currentPointer.x*.07;
  world.position.y=currentPointer.y*-.04;

  const boost=stateBoost();
  rotors.forEach((rotor,i)=>{
    const dir=i%2?-1:1;
    rotor.rotation.z+=dir*(.00125+i*.00028)*boost;
    const target=rotor.userData.targetZ??rotor.userData.baseZ??0;
    rotor.position.z+=(target-rotor.position.z)*.075;
  });
  if(ticks)ticks.rotation.z-=.0009*boost;

  if(energy){
    const p=1+Math.sin(t*2.15)*.025*boost;
    energy.scale.setScalar(p);
  }
  if(coreGlass)coreGlass.rotation.z+=.00045;

  coreHalo.material.opacity=.24+Math.sin(t*.82)*.025;
  innerHalo.material.opacity=.31+Math.sin(t*1.5)*.04*boost;
  redHalo.material.opacity=.055+Math.sin(t*.61+1.2)*.018;
  beam.material.opacity=.014+Math.sin(t*.72)*.006;

  if(model){
    model.scale.setScalar(.89*Math.min(1,.78+opening*.22));
    model.visible=opening>.02;
  }

  renderer.render(scene,camera);
}
animate();

function setPointer(x,y){
  pointer.x=THREE.MathUtils.clamp(x,-1,1);
  pointer.y=THREE.MathUtils.clamp(y,-1,1);
}
hud.addEventListener('pointermove',e=>{
  setPointer((e.clientX/innerWidth-.5)*2,(e.clientY/innerHeight-.5)*2);
},{passive:true});
hud.addEventListener('pointerleave',()=>setPointer(0,0),{passive:true});

window.addEventListener('travis3dcommands',e=>{
  commandOpen=!!e.detail?.open;
  rotors.forEach((rotor,i)=>{
    const base=rotor.userData.baseZ??0;
    rotor.userData.targetZ=base+(commandOpen?(i-2.5)*.095:0);
  });
  innerHalo.material.opacity=commandOpen?.38:.31;
});

window.addEventListener('travis3dreset',()=>{
  opening=0;setPointer(0,0);commandOpen=false;
  rotors.forEach(rotor=>{rotor.userData.targetZ=rotor.userData.baseZ??0;});
});

window.Travis3D=Object.freeze({
  get ready(){return ready;},
  setPointer,
  setGlow(value){
    innerHalo.material.opacity=THREE.MathUtils.clamp(value,.05,.65);
  }
});
