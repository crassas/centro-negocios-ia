import {validateScenePlan,flybyPosition,SPACE_ASSETS} from './travis-scene-blueprint.mjs?v=worlds-1';
import {createDetailedSubject} from './travis-visual-subjects.mjs?v=worlds-1';
import {createAnimatedScene} from './travis-animated-scenes.mjs?v=worlds-1';
import {createScienceScene} from './travis-science-scenes.mjs?v=worlds-1';
import {createArchitecture} from './travis-architecture.mjs?v=worlds-1';
import {createMechanical} from './travis-mechanical.mjs?v=worlds-1';
import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=worlds-1';

// Independent objects share the existing surface/morph renderer. Construction
// happens once per command; animation updates transforms and small trail buffers.
export function createComposedScene(THREE,input,{reducedMotion=false}={}){
 const plan=validateScenePlan(input);if(!plan)throw new Error('Invalid scene blueprint');
 const group=new THREE.Group(),view=new THREE.Group(),guides=new THREE.Group(),materials=[],textures=[],actors=[];
 group.name='TravisComposedWorld';group.userData.dynamic=true;group.add(view);view.add(guides);
 let focused=null,lastTime=0,viewScale=1,last={};
 const centre=new THREE.Vector3(),wanted=new THREE.Vector3(),vector=new THREE.Vector3(),zero=new THREE.Vector3();
 const random=(i,s=1)=>{const x=Math.sin(i*127.1+s*311.7)*43758.5453;return x-Math.floor(x);};
 function surface(geometry,parent,tint=0xbdb7aa,gain=1.2){
  const m=createHolographicSurfaceMaterial(THREE,{natural:true,tint,gain});materials.push(m);
  const object=new THREE.Mesh(geometry,m);parent.add(object);return object;
 }
 function path(points,{opacity=.23,colour=0x7fa6cf,dashed=false}={}){
  const m=dashed?new THREE.LineDashedMaterial({color:colour,transparent:true,opacity,depthWrite:false,dashSize:.018,gapSize:.032}):new THREE.LineBasicMaterial({color:colour,transparent:true,opacity,depthWrite:false});
  m.userData.baseOpacity=opacity;materials.push(m);const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),m);if(dashed)line.computeLineDistances();guides.add(line);return line;
 }
 function rock(asset){
  const g=new THREE.Group(),geo=new THREE.IcosahedronGeometry(.7,10),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){
   vector.fromBufferAttribute(p,i);const x=vector.x,y=vector.y,z=vector.z;
   // Coherent deformation keeps duplicated triangle vertices watertight.
   const rough=1+.14*Math.sin(x*7+y*2)*Math.cos(z*8)+.075*Math.sin(y*17-z*5)*Math.cos(x*15);
   p.setXYZ(i,x*rough*1.12,y*rough*.78,z*rough*.94);
  }
  geo.computeVertexNormals();
  // Smooth shared positions across triangle seams after the deformation.
  const normals=geo.attributes.normal,sums=new Map(),keys=[];
  for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(',');keys.push(key);const n=sums.get(key)||new THREE.Vector3();n.add(vector.fromBufferAttribute(normals,i));sums.set(key,n);}
  for(let i=0;i<p.count;i++){vector.copy(sums.get(keys[i])).normalize();normals.setXYZ(i,vector.x,vector.y,vector.z);}
  geo.computeBoundingSphere();const mesh=surface(geo,g,asset==='Comet'?0xaccbd3:0x9d9181,1.3);
  mesh.material.fragmentShader=mesh.material.fragmentShader.replace('naturalLight*=mix(', 'naturalLight*=.72+.28*sin(vP.x*117.+vP.y*71.)*sin(vP.z*93.-vP.x*37.);naturalLight*=mix(');
  return {group:g,materials:[],textures:[],update(time){g.rotation.set(time*.12,time*.19,.2+time*.08);}};
 }
 function satellite(){
  const g=new THREE.Group();surface(new THREE.BoxGeometry(.42,.46,.37),g,0xccba8c);
  const dishes=surface(new THREE.SphereGeometry(.18,24,16,0,Math.PI*2,0,.7),g,0xe0e7ea);dishes.rotation.z=-Math.PI/3;dishes.position.set(.16,.25,.14);
  surface(new THREE.CylinderGeometry(.012,.012,1.7,8),g,0xb6c7d9).rotation.z=Math.PI/2;
  for(const side of [-1,1]){
   const panel=surface(new THREE.BoxGeometry(.69,.48,.018),g,0x183f83);panel.position.x=side*.62;
   for(let i=0;i<5;i++){const edge=surface(new THREE.BoxGeometry(.006,.47,.023),g,0x697b9c);edge.position.x=side*.62+(i-2)*.13;}
   const middle=surface(new THREE.BoxGeometry(.68,.007,.023),g,0x697b9c);middle.position.x=side*.62;
  }
  return {group:g,materials:[],textures:[],update(time){g.rotation.y=time*.14;g.rotation.z=.22;}};
 }
 function nature(asset){
  const g=new THREE.Group();
  if(asset==='Tree'){
   surface(new THREE.CylinderGeometry(.045,.085,.75,10),g,0x836345).position.y=-.36;
   for(let i=0;i<5;i++){const foliage=surface(new THREE.IcosahedronGeometry(.35+random(i)*.1,2),g,i%2?0x416f53:0x67874b);foliage.position.set(Math.sin(i*2.4)*.21,i*.11-.03,Math.cos(i*2.4)*.22);foliage.scale.y=1.3;}
  }else{
   const geo=new THREE.ConeGeometry(.9,1.25,48,14),p=geo.attributes.position;
   for(let i=0;i<p.count;i++){vector.fromBufferAttribute(p,i);const n=1+Math.sin(vector.x*14+vector.z*8)*.11;vector.x*=n;vector.z*=n;vector.y+=Math.sin(vector.x*11)*Math.cos(vector.z*12)*.07;p.setXYZ(i,vector.x,vector.y,vector.z);}geo.computeVertexNormals();surface(geo,g,0x8b9294);
   surface(new THREE.ConeGeometry(.20,.26,20,3),g,0xe5eced).position.y=.53;
  }
  return {group:g,materials:[],textures:[],update(time){if(asset==='Tree')g.rotation.z=Math.sin(time*.65)*.017;}};
 }
 function atmosphere(parent){
  const m=new THREE.ShaderMaterial({uniforms:{uBuild:{value:0},uTime:{value:0},uVoice:{value:0}},vertexShader:'varying vec3 n,v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'precision highp float;uniform float uBuild;varying vec3 n,v;void main(){float edge=pow(1.-abs(dot(normalize(n),normalize(v))),3.);gl_FragColor=vec4(.17,.48,1.,edge*.36*uBuild);}',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  materials.push(m);const glow=new THREE.Mesh(new THREE.SphereGeometry(.845,48,32),m);glow.userData.skipMorph=true;parent.add(glow);
 }
 for(const node of plan.nodes){
  let built;
  if(['Meteor','Comet'].includes(node.asset))built=rock(node.asset);
  else if(node.asset==='Satellite')built=satellite();
  else if(['Tree','Mountain'].includes(node.asset))built=nature(node.asset);
  else if(node.asset==='House')built=createArchitecture(THREE,'House');
  else if(node.asset==='Motor')built=createMechanical(THREE,{exploded:false});
  else if(['DNA','Hydrogen','Aurora'].includes(node.asset))built=createScienceScene(THREE,node.asset);
  else if(['rain','snow','clouds','fire','ocean'].includes(node.asset))built=createAnimatedScene(THREE,'weather',node.asset);
  else if(node.asset==='Rocket')built=createAnimatedScene(THREE,'vehicle','Rocket');
  else built=createDetailedSubject(THREE,SPACE_ASSETS.includes(node.asset)?'planet':'object',node.asset);
  if(node.asset==='Earth')atmosphere(built.group);
  materials.push(...built.materials);textures.push(...(built.textures||[]));
  built.group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(built.group),size=box.getSize(new THREE.Vector3()),offset=box.getCenter(new THREE.Vector3());
  // Normalise each factory independently, retaining its internal animation.
  const holder=new THREE.Group(),normalised=new THREE.Group();normalised.add(built.group);normalised.scale.setScalar(1.5/Math.max(.01,size.x,size.y,size.z));built.group.position.sub(offset);holder.add(normalised);holder.scale.setScalar(node.scale);holder.position.set(...node.position);holder.userData.visualBody=node.asset;view.add(holder);
  if(node.asset==='House')normalised.rotation.y=-.38;
  const actor={...node,holder,built,normalised,base:holder.position.clone(),radius:node.scale*.75};actors.push(actor);
 }
 const central=actors[0],flyers=plan.layout==='flyby'?actors.filter(a=>['Meteor','Comet'].includes(a.asset)):[];
 const tracks=new Map();
 const clearance=Math.max(.92,central.radius+Math.max(0,...flyers.map(a=>a.radius))+.20);
 for(const [index,actor] of flyers.entries()){
  const points=Array.from({length:161},(_,i)=>{const p=flybyPosition(i/160,clearance);p[1]+=index*.24;return p;});
  path(points,{opacity:.19,dashed:true});const trail=path(points,{opacity:.68,colour:0xe2c5a0});tracks.set(actor.id,{trail,index});
 }
 const orbiters=plan.layout==='orbit'?actors.slice(1):plan.layout==='flyby'?actors.filter(a=>a!==central&&!flyers.includes(a)):[];
 for(const [index,actor] of orbiters.entries()){
  const r=1.20+index*.19;actor.orbit={r,phase:index*2.4+.45};
  path(Array.from({length:129},(_,i)=>{const a=i/128*Math.PI*2;return [Math.cos(a)*r,Math.sin(a)*r*.58,Math.sin(a)*r*.46];}),{opacity:.14,dashed:true});
 }
 // A comet has an illustrative dust/ion tail. A meteoroid in vacuum has only
 // a trajectory guide, not an atmospheric fireball.
 for(const actor of actors.filter(a=>a.asset==='Comet')){
  const positions=[],colours=[];
  for(let i=0;i<900;i++){const d=random(i,3),w=d*.14;positions.push(-d*.95,(random(i,4)-.5)*w,(random(i,5)-.5)*w);colours.push(.38+d*.25,.66+d*.2,1);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
  const mat=new THREE.PointsMaterial({vertexColors:true,size:.008,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending});mat.userData.baseOpacity=.55;materials.push(mat);actor.tail=new THREE.Points(geo,mat);actor.tail.userData.skipMorph=true;view.add(actor.tail);
 }
 function update(time){
  const dt=Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
  for(const a of actors){
   a.built.update?.(time);
   if(a.orbit){const angle=a.orbit.phase+time*.075/Math.sqrt(a.orbit.r);a.holder.position.set(Math.cos(angle)*a.orbit.r,Math.sin(angle)*a.orbit.r*.58,Math.sin(angle)*a.orbit.r*.46);}
   if(tracks.has(a.id)){const {trail,index}=tracks.get(a.id),p=Math.min(1,time/plan.duration),pos=flybyPosition(p,clearance);a.holder.position.set(pos[0],pos[1]+index*.24,pos[2]);trail.geometry.setDrawRange(0,Math.max(2,Math.floor(p*160)+1));}
   if(a.tail){a.tail.position.copy(a.holder.position);a.tail.visible=!focused||focused===a.id;}
  }
  const focus=actors.find(a=>a.id===focused),scale=focus?Math.min(5,1.15/focus.scale):1;
  wanted.copy(focus?.holder.position||zero);
  const ease=reducedMotion?1:1-Math.exp(-(dt||1/60)*7);centre.lerp(wanted,ease);viewScale+=(scale-viewScale)*ease;
  view.scale.setScalar(viewScale);view.position.copy(centre).multiplyScalar(-viewScale);
  const p=Math.min(1,time/plan.duration);
  last={type:'constructed-scene',environment:plan.environment,layout:plan.layout,progress:flyers.length?p:null,phase:flyers.length?(p<.35?'approach':p<.65?'closest-approach':p<1?'departure':'complete'):null,focused:focus?.asset||null,schematic:true,
   objects:actors.map(a=>({id:a.id,asset:a.asset,position:a.holder.position.toArray(),visible:a.holder.visible,scale:a.scale}))};
 }
 function focus(target){
  const actor=actors.find(a=>a.id===target||a.asset.toLowerCase()===String(target).toLowerCase());if(target&&!actor)return false;
  focused=actor?.id||null;guides.visible=!focused;guides.traverse(o=>{if(o.geometry)o.userData.skipMorph=Boolean(focused);});
  for(const a of actors){a.holder.visible=!focused||focused===a.id;a.holder.traverse(o=>{if(o.geometry)o.userData.skipMorph=!a.holder.visible||Boolean(o.userData.originalSkipMorph??(o.userData.originalSkipMorph=o.userData.skipMorph));});}
  return true;
 }
 update(0);
 return {group,materials,textures,variant:'constructed-scene',update,focus,state:()=>last,plan};
}
