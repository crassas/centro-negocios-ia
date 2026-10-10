import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {createConceptProjection} from '../../travis-concept-projection.mjs?v=sand-1';
import {createHolographicHeadMaterial} from '../../travis-holographic-head.mjs?v=sand-1';
import {createHologramPresentation} from '../../travis-presence.mjs?v=motion-1';
import {MOTION,clamp01} from '../../travis-motion.mjs?v=motion-1';
const timeline=window.__TRAVIS_TIMELINE||await (await fetch('./timeline.json')).json();
const capture=new URLSearchParams(location.search).has('capture');document.body.classList.toggle('capture',capture);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:capture});
renderer.setPixelRatio(capture?1:Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);document.body.prepend(renderer.domElement);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x080604,1);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,60);camera.position.set(0,.48,6.4);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.35,.35,.42));composer.addPass(new OutputPass());
const gltf=await new GLTFLoader().loadAsync('../../assets/travis/travis-face-bust.glb');
const face=gltf.scene,head=face.getObjectByName('TravisFace_Bust');
if(!head?.isMesh)throw new Error('Travis face mesh unavailable');
const positions=head.geometry.attributes.position,indices=head.geometry.index?.array,clipped=[];
for(let i=0;i<(indices?.length||positions.count);i+=3){const a=indices?indices[i]:i,b=indices?indices[i+1]:i+1,c=indices?indices[i+2]:i+2;if(Math.min(positions.getY(a),positions.getY(b),positions.getY(c))>=.17)clipped.push(a,b,c);}
head.geometry.setIndex(clipped);head.geometry.computeBoundingBox();head.geometry.computeBoundingSphere();
const faceMaterials=[];face.traverse(node=>{if(!node.isMesh)return;node.material=createHolographicHeadMaterial(THREE);faceMaterials.push(node.material);node.material.uniforms.uBuild.value=1;});
const box=new THREE.Box3().setFromObject(face),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
const fit=2.3/Math.max(size.x,size.y);face.scale.multiplyScalar(fit);face.position.copy(center.multiplyScalar(-fit));face.position.y+=.34;scene.add(face);scene.updateMatrixWorld(true);
const presentation=createHologramPresentation(),projection=createConceptProjection(THREE);scene.add(projection.root);projection.setSource(()=>head);projection.setCamera(()=>camera);
let cursor=-1,last=-1,paused=false,start=performance.now(),current=0;
const caption=document.querySelector('#caption'),count=document.querySelector('#count');
function update(t){const view=presentation.sample(t);projection.update(t,view,0);const dissolve=projection.state().matter.avatarDissolve||0;
 for(const material of faceMaterials){material.uniforms.uTime.value=t;material.uniforms.uDissolve.value=dissolve;}
 face.visible=dissolve<.999;scene.updateMatrixWorld(true);
}
// render(t) can seek backwards or skip frames. Event boundaries are sampled at
// their exact time, so the source cloud never depends on a prior capture FPS.
function render(time){
 const t=Math.min(timeline.duration,Math.max(0,Number(time)||0));
 if(t<last){projection.hide();presentation.reset();cursor=-1;last=-1;}
 while(cursor+1<timeline.beats.length&&timeline.beats[cursor+1].at<=t){
  const beat=timeline.beats[++cursor];update(beat.at);
  if(beat.scene){projection.show(beat.scene,beat.at,beat.subject||beat.label);presentation.present(beat.at);}
  if(beat.control)projection.control(beat.control,beat.at);
  if(beat.action==='return'){projection.returnToCore(beat.at);presentation.close(beat.at);}
 }
 update(t);const beat=timeline.beats[Math.max(0,cursor)],reveal=clamp01((t-beat.at)/MOTION.caption);
 caption.textContent=beat.label;caption.style.opacity=String(reveal);caption.style.transform=`translateY(${(1-reveal)**3*18}px)`;
 count.textContent=String(cursor+1).padStart(2,'0')+' / '+String(timeline.beats.length).padStart(2,'0');
 composer.render();last=current=t;return {time:t,beat:beat.name,projection:projection.state()};
}
window.TRAVIS_MOTION={ready:true,timeline,render};render(0);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);render(current);});
function seek(t){current=clamp01(t/timeline.duration)*timeline.duration;start=performance.now()-current*1000;render(current);}
document.querySelector('#pause').onclick=()=>{paused=!paused;document.querySelector('#pause').textContent=paused?'Continuar':'Pausar';start=performance.now()-current*1000;};
document.querySelector('#restart').onclick=()=>seek(0);
addEventListener('keydown',e=>{if(e.key==='ArrowRight')seek(current+2);if(e.key==='ArrowLeft')seek(current-2);});
if(!capture){const tick=now=>{if(!paused)render((now-start)/1000%timeline.duration);requestAnimationFrame(tick);};requestAnimationFrame(tick);}
