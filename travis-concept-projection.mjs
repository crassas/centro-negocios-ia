import {createMechanical} from './travis-mechanical.mjs?v=motion-1';
import {createArchitecture} from './travis-architecture.mjs?v=motion-1';
import {createDetailedSubject,identifyVisualSubject} from './travis-visual-subjects.mjs?v=motion-1';
import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=motion-1';
import { createTravisParticleMorph } from './travis-particle-morph.mjs?v=motion-1';
// Film-inspired schematic projections. Unprovided geographic/CAD/person
// geometry stays visibly conceptual; real source links are separate.
export function createConceptProjection(THREE,{reducedMotion=false}={}){
 const root=new THREE.Group();root.name='TravisConceptProjection';root.position.y=.34;
 const matter=createTravisParticleMorph(THREE,{count:12000,reducedMotion});
 let sourceProvider=null,cameraProvider=null;
 root.add(matter.root);
 let active=new THREE.Group(),activeFrame=new THREE.Group(),ghost=null,kind='',objects=[],mats=[],textures=[],born=0,variant='';
 let zoom=1,dx=0,dy=0,spin=0,planetName='',label='';
 activeFrame.add(active);root.add(activeFrame);root.visible=false;
 const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
 const colours={earth:0x6785a7,mars:0xb97856,jupiter:0xbda180,saturn:0xcab391,venus:0xcbb393,
  mercury:0x8b8580,uranus:0x77949b,neptune:0x506e9b,moon:0xbab7af,sun:0xcfa26e};
 function dispose(group,materials,maps=[]){
  if(!group)return;
  group.traverse(o=>o.geometry?.dispose?.());
  group.removeFromParent();
  for(const material of materials)material.dispose?.();
  for(const texture of maps)texture.dispose?.();
 }
 function style(color,{lines=false,points=false,wire=false,alpha=.8}={}){
  const opts={color,transparent:true,opacity:alpha,depthWrite:false};
  const mat=points?new THREE.PointsMaterial({...opts,size:.024}):lines?
   new THREE.LineBasicMaterial(opts):createHolographicSurfaceMaterial(THREE,{gain:wire?1.1:1});
  mat.userData.baseOpacity=alpha;mats.push(mat);return mat;
 }
 function add(object,x=0,y=0,z=0){object.position.set(x,y,z);active.add(object);return object;}
 function mesh(geometry,color,options={},x=0,y=0,z=0){return add(new THREE.Mesh(geometry,style(color,options)),x,y,z);}
 function sphere(radius,color,x=0,y=0,z=0,wire=false){
  return mesh(new THREE.SphereGeometry(radius,22,14),color,{alpha:wire?.65:.52,wire},x,y,z);
 }
 function line(points,color=0xc9ad86){
  return add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),
   style(color,{lines:true,alpha:.74})));
 }
 function ring(radius,tilt=0){
  const vertices=[];
  for(let i=0;i<=84;i++){const a=i/84*Math.PI*2;vertices.push([radius*Math.cos(a),radius*Math.sin(a),0]);}
  const result=line(vertices,0x9c8a76);result.rotation.x=tilt;return result;
 }
 function planet(){const detailed=createDetailedSubject(THREE,'planet',label);active.add(detailed.group);mats.push(...detailed.materials);textures.push(...detailed.textures);variant=detailed.variant;}
 function map(){
  const grid=new THREE.Group();active.add(grid);grid.rotation.x=-.30;grid.rotation.z=.14;
  const gridLine=(a,b,color=0x777369)=>{
   grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]),
    style(color,{lines:true,alpha:.40})));
  };
  for(let i=-6;i<=6;i++){
   let v=i*.215;gridLine([v,-1.3,0],[v,1.3,0]);gridLine([-1.3,v,0],[1.3,v,0]);
  }
  const path=[[-1.08,-.6],[-.67,-.32],[-.4,.28],[.11,.08],[.5,.62],[1.05,.78]];
  grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
   path.map(([x,y])=>new THREE.Vector3(x,y,.035))),style(0xe1b98b,{lines:true,alpha:.95})));
  for(const index of [0,2,5]){
   const [x,y]=path[index];
   const pin=new THREE.Mesh(new THREE.SphereGeometry(.062,12,8),style(0xebc999,{alpha:.90}));
   pin.position.set(x,y,.08);grid.add(pin);
  }
  objects.push({type:'map',grid});
 }
 function house(){
  const detailed=createArchitecture(THREE,label);active.add(detailed.group);
  mats.push(...detailed.materials);variant=detailed.variant;
  objects.push({type:'house',house:detailed.group});
 }
 function person(){
  const head=sphere(.32,0xc8b299,0,.73,0);
  const torso=mesh(new THREE.CylinderGeometry(.42,.30,1.01,14,1,true),0x987f6b,
   {wire:true,alpha:.69},0,-.29,0);
  for(const sign of [-1,1]){
   line([[sign*.36,.08,0],[sign*.65,-.45,0],[sign*.56,-1.0,0]]);
   line([[sign*.17,-.80,0],[sign*.23,-1.42,0]]);
  }
  ring(.52,1.02).position.y=.72;
  objects.push({type:'person',head,torso});
 }
 function object(){
  const geometric=mesh(new THREE.DodecahedronGeometry(.80,1),0xcfb38d,{wire:true,alpha:.84});
  const inner=mesh(new THREE.IcosahedronGeometry(.65,1),0x777787,{alpha:.28});
  ring(1.16,.84);ring(1.36,-.41);
  objects.push({type:'object',geometric,inner});
 }

 function vehicle(){
  const car=new THREE.Group();active.add(car);
  const kind=String(planetName||'')+' '+String(label||'').toLowerCase();
  const flying=/drone|helicopter|helicoptero|aviao|airplane|jet/.test(kind);
  const spacecraft=/spaceship|spacecraft|rocket|foguetao|nave|satelite/.test(kind);
  const transport=/train|comboio|ship|boat|barco/.test(kind);
  const shell=(geometry,color=0xbea381,x=0,y=0,z=0)=>{
    const meshObject=new THREE.Mesh(geometry,style(color,{wire:true,alpha:.75}));
    meshObject.position.set(x,y,z);car.add(meshObject);return meshObject;
  };
  if(spacecraft){
   shell(new THREE.CylinderGeometry(.25,.39,1.55,12,1),0xc9aa83,0,0,0).rotation.z=Math.PI/2;
   shell(new THREE.ConeGeometry(.28,.54,12),0xe2bf94,1.05,0,0).rotation.z=-Math.PI/2;
   shell(new THREE.ConeGeometry(.45,.55,4),0x9c7d5a,-.80,0,0).rotation.z=Math.PI/2;
   for(const side of [-1,1])shell(new THREE.BoxGeometry(.65,.025,.53),0xcba87d,-.2,0,side*.47);
  }else if(flying){
   shell(new THREE.SphereGeometry(.45,12,9),0xc7a880);
   for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    const x=Math.cos(a)*1.05,z=Math.sin(a)*1.05;
    const beam=shell(new THREE.CylinderGeometry(.04,.04,1.2,7),0xbb9d74,x/2,0,z/2);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(x,0,z).normalize());
    shell(new THREE.TorusGeometry(.23,.022,5,20),0xe7bc87,x,.12,z).rotation.x=Math.PI/2;
   }
  }else{
   shell(new THREE.BoxGeometry(1.75,.39,.84),0xcda780,0,-.15,0);
   shell(new THREE.BoxGeometry(.94,.34,.75),0xe5bc92,-.15,.22,0);
   if(transport)shell(new THREE.BoxGeometry(.66,.35,.83),0xa88a6d,.64,.20,0);
   for(const side of [-1,1])for(const x of [-.57,.62]){
    const wheel=shell(new THREE.TorusGeometry(.24,.075,8,18),0xe0c7a0,x,-.42,side*.46);
    wheel.rotation.y=Math.PI/2;
   }
  }
  objects.push({type:'vehicle',car});
 }
 function landscape(){
  const earth=new THREE.Group();active.add(earth);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(2.9,1.75,15,8),style(0x817861,{wire:true,alpha:.55}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.58;earth.add(ground);
  for(let i=0;i<3;i++){
   const x=(i-1)*1.03,height=.48+(i%2)*.46;
   const mountain=new THREE.Mesh(new THREE.ConeGeometry(.66,height,5,4,true),
      style(0xb1a083,{wire:true,alpha:.7}));
   mountain.position.set(x,-.50+height/2,-.32);earth.add(mountain);
  }
  for(let i=0;i<6;i++){
   const x=(i-2.5)*.42;
   const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.025,.055,.42,6),
      style(0xc9b494,{wire:true,alpha:.7}));
   trunk.position.set(x,-.43,.57);earth.add(trunk);
   const crown=new THREE.Mesh(new THREE.ConeGeometry(.21,.52,7,3),
      style(0x78917c,{wire:true,alpha:.8}));
   crown.position.set(x,-.08,.57);earth.add(crown);
  }
  objects.push({type:'landscape',earth});
 }
 function diagram(){
  const nodes=[];
  for(let i=0;i<12;i++){
   const ringIndex=Math.floor(i/6),angle=i%6/6*Math.PI*2;
   const x=Math.cos(angle)*(.63+ringIndex*.57),y=Math.sin(angle)*(.58+ringIndex*.52);
   nodes.push(sphere(i%6===0?.14:.075,i%6===0?0xe3c99c:0xaf9276,x,y,Math.cos(angle*2)*.2));
  }
  const points=[];
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)
   if(nodes[i].position.distanceTo(nodes[j].position)<1.25)
    points.push(nodes[i].position.clone(),nodes[j].position.clone());
  add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),
     style(0x937f68,{lines:true,alpha:.74})));
  objects.push(...nodes.map(node=>({type:'node',node})));
 }

 function classic(type){
  if(type==='orbit'||type==='atom'){planet();return;}
  if(type==='network'){
   const nodes=[];
   for(let i=0;i<19;i++){
    const y=1.3-i/18*2.6,a=i*2.39996,r=Math.sqrt(Math.max(0,1.8-y*y));
    nodes.push(sphere(i===9?.105:.055,0xbca88a,Math.cos(a)*r,y,Math.sin(a)*r*.6));
   }
   const points=[];
   for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)
    if(nodes[i].position.distanceTo(nodes[j].position)<1.05)points.push(nodes[i].position.clone(),nodes[j].position.clone());
   add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),
    style(0x927e67,{lines:true,alpha:.6})));
   objects=nodes.map(node=>({type:'node',node}));
   return;
  }
  for(let i=0;i<6;i++){
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(120*3),3));
   const wave=add(new THREE.Line(geometry,style(0xc8b397,{lines:true,alpha:.7})));
   objects.push({type:'wave',wave,row:i});
  }
 }
 function show(scene,now,subject='',options={}){
  if(ghost){dispose(ghost.group,ghost.mats,ghost.textures);ghost=null;}
  if(active.children.length)ghost={group:activeFrame,mats,textures,start:now};
  else dispose(activeFrame,mats,textures);
  active=new THREE.Group();activeFrame=new THREE.Group();activeFrame.add(active);root.add(activeFrame);mats=[];objects=[];textures=[];
  kind=['orbit','atom','network','wave','planet','map','house','person','vehicle','landscape','diagram','object','text','space','reference','mechanical'].includes(scene)?scene:'network';
  planetName=['earth','mars','venus','saturn','jupiter','uranus','neptune','mercury','moon','sun'].find(x=>
   new RegExp('\\b'+x+'\\b').test(String(subject).toLowerCase()))||'';
  born=now;zoom=1;dx=dy=spin=0;label=subject;variant=identifyVisualSubject(kind,subject);
  if(['text','space','reference'].includes(kind)||['dna','atom','cube','sphere','pyramid'].includes(variant)){const detailed=createDetailedSubject(THREE,kind,subject,options);if(detailed){active.add(detailed.group);mats.push(...detailed.materials);textures.push(...detailed.textures);variant=detailed.variant;}}
  else if(kind==='mechanical'){const built=createMechanical(THREE,{exploded:options.exploded===true});active.add(built.group);mats.push(...built.materials);variant=built.variant;}
  else if(kind==='planet')planet();else if(kind==='map')map();else if(kind==='house')house();
  else if(kind==='person')person();else if(kind==='vehicle')vehicle();
  else if(kind==='landscape')landscape();else if(kind==='diagram')diagram();
  else if(kind==='object')object();else classic(kind);
  if(kind==='house')active.rotation.y=-.50;
  matter.setSource(typeof sourceProvider==='function'?sourceProvider():sourceProvider);
  matter.setTheme(kind,subject);
  matter.go(active,now,{label:String(subject||kind).slice(0,100),camera:typeof cameraProvider==='function'?cameraProvider():cameraProvider});
  // Fine holographic surfaces share the head lighting; particles carry the transition.
  active.visible=false;
  root.visible=true;
 }
 function hide(){
  kind='';root.visible=false;
  if(ghost){dispose(ghost.group,ghost.mats,ghost.textures);ghost=null;}
  dispose(activeFrame,mats,textures);active=new THREE.Group();activeFrame=new THREE.Group();activeFrame.add(active);root.add(activeFrame);objects=[];mats=[];textures=[];matter.hide();
  zoom=1;dx=dy=spin=0;
 }
 function setSource(provider){sourceProvider=provider;}
 function setCamera(provider){cameraProvider=provider;}
 function returnToCore(now){
  if(!kind)return;
  matter.setSource(typeof sourceProvider==='function'?sourceProvider():sourceProvider);
  matter.returnToSource(now);
 }
 function control(action,now=performance.now()/1000){
  if(!kind)return false;
  if(['explode','assemble'].includes(action)){if(kind!=='mechanical')return false;show('mechanical',now,label,{exploded:action==='explode'});return true;}
  const step=.25;
  if(action==='zoom-in')zoom=limit(zoom*1.3,.5,2.5);
  else if(action==='zoom-out')zoom=limit(zoom/1.3,.5,2.5);
  else if(action==='rotate-right')spin+=Math.PI/6;
  else if(action==='rotate-left')spin-=Math.PI/6;
  else if(action==='move-left')dx=limit(dx-step,-1,1);
  else if(action==='move-right')dx=limit(dx+step,-1,1);
  else if(action==='move-up')dy=limit(dy+step,-.8,.8);
  else if(action==='move-down')dy=limit(dy-step,-.8,.8);
  else if(action==='reset-view'){zoom=1;dx=dy=spin=0;}
  else return false;
  return true;
 }
 function update(now,projection,voice=0){
  if(!kind)return;
  const reveal=limit(projection.amount,0,1);

  matter.update(now,projection,{
    zoom,spin,dx,dy,camera:typeof cameraProvider==='function'?cameraProvider():cameraProvider,
    pixelRatio:typeof devicePixelRatio==='number'?devicePixelRatio:1,voice
  });
  root.visible=matter.state().active&&matter.state().opacity>.001;
  const state=matter.state(),frame=matter.presentation();
  if(frame){activeFrame.position.set(...frame.position);activeFrame.scale.setScalar(frame.scale);activeFrame.rotation.y=frame.rotation;}
  const build=state.returning?1-limit(state.morphProgress/.40,0,1):limit((state.morphProgress-.42)/.48,0,1);
  active.visible=state.active&&build>.001;
  for(const m of mats){if(m.uniforms?.uBuild){m.uniforms.uBuild.value=build;m.uniforms.uTime.value=now;m.uniforms.uVoice.value=voice;}else m.opacity=(m.userData.baseOpacity||.5)*build;}
  if(ghost){
   const remaining=1-limit((now-ghost.start)/(reducedMotion?.01:.74),0,1);
   for(const m of ghost.mats){if(m.uniforms?.uBuild)m.uniforms.uBuild.value=Math.min(m.uniforms.uBuild.value,remaining);else m.opacity=(m.userData.baseOpacity||.5)*remaining;}
   if(remaining<=0){dispose(ghost.group,ghost.mats,ghost.textures);ghost=null;}
  }
  if(reducedMotion)return;
  for(const o of objects){
   if(o.type==='planet'){o.surface.rotation.y=now*.22;o.meshWire.rotation.y=-now*.10;
    o.moon.position.set(Math.cos(now*.6)*1.03,Math.sin(now*.6)*.3,Math.sin(now*.6)*.77);}
   else if(o.type==='object'){o.geometric.rotation.y=now*.26;o.geometric.rotation.x=now*.13;
    o.inner.rotation.y=-now*.14;}
   else if(o.type==='house')o.house.rotation.y=Math.sin(now*.20)*.12;
   else if(o.type==='wave'){
    const a=o.wave.geometry.attributes.position;
    for(let i=0;i<a.count;i++){
     const x=i/(a.count-1)*3.5-1.75;
     a.setXYZ(i,x,Math.sin(x*4-now*2+o.row*.15)*(.25+voice*.22)+(o.row-2.5)*.18,o.row*.1);
    }
    a.needsUpdate=true;
   }else if(o.type==='node')o.node.scale.setScalar(.95+Math.sin(now*1.3)*.12+voice*.22);
  }
 }
 return {root,show,hide,update,control,setSource,setCamera,returnToCore,
  state:()=>({kind,variant,label,quality:'fine-surface-and-particles',zoom,dx,dy,rotation:spin,morphing:Boolean(ghost)||matter.state().morphProgress<1,
   visible:root.visible,matter:matter.state()})};
}
