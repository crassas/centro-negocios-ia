import { createTravisParticleMorph } from './travis-particle-morph.mjs?v=2';
// Film-inspired schematic projections. Unprovided geographic/CAD/person
// geometry stays visibly conceptual; real source links are separate.
export function createConceptProjection(THREE,{reducedMotion=false}={}){
 const root=new THREE.Group();root.name='TravisConceptProjection';root.position.y=.34;
 const matter=createTravisParticleMorph(THREE,{count:2600,reducedMotion});
 let sourceProvider=null;
 root.add(matter.root);
 let active=new THREE.Group(),ghost=null,kind='',objects=[],mats=[],born=0;
 let zoom=1,dx=0,dy=0,spin=0,planetName='',label='';
 root.add(active);root.visible=false;
 const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
 const colours={earth:0x6785a7,mars:0xb97856,jupiter:0xbda180,saturn:0xcab391,venus:0xcbb393,
  mercury:0x8b8580,uranus:0x77949b,neptune:0x506e9b,moon:0xbab7af,sun:0xcfa26e};
 function dispose(group,materials){
  if(!group)return;
  group.traverse(o=>o.geometry?.dispose?.());
  group.removeFromParent();
  for(const material of materials)material.dispose?.();
 }
 function style(color,{lines=false,points=false,wire=false,alpha=.8}={}){
  const opts={color,transparent:true,opacity:alpha,depthWrite:false};
  const mat=points?new THREE.PointsMaterial({...opts,size:.024}):lines?
   new THREE.LineBasicMaterial(opts):new THREE.MeshBasicMaterial({...opts,wireframe:wire,side:THREE.DoubleSide});
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
 function planet(){
  const color=colours[planetName]||0xbda18b;
  const surface=sphere(.66,color);
  const meshWire=sphere(.677,0xd4bc9d,0,0,0,true);
  ring(.98,.92);ring(1.28,.18);
  if(planetName==='saturn')ring(1.13,1.24);
  const moon=sphere(.065,0xded0ad,1,0,0);
  objects.push({type:'planet',surface,meshWire,moon});
  const positions=new Float32Array(110*3);
  for(let i=0;i<110;i++){
    const y=1-i/109*2,a=i*2.399963,r=Math.sqrt(1-y*y);let j=i*3;
    positions[j]=Math.cos(a)*r*1.36;positions[j+1]=y*1.03;positions[j+2]=Math.sin(a)*r*1.14;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  add(new THREE.Points(geometry,style(0xddc5a6,{points:true,alpha:.55})));
 }
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
  const house=new THREE.Group();active.add(house);
  const block=(w,h,d,y,z=0)=>{
   const filled=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),style(0x767067,{alpha:.15}));
   filled.position.set(0,y,z);house.add(filled);
   const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),
    style(0xd9c29d,{lines:true,alpha:.85}));
   edge.position.set(0,y,z);house.add(edge);
  };
  block(1.7,1.13,1.05,-.22);
  const coords=[[-1.0,.36,-.60],[0,1.10,-.60],[1.0,.36,-.60],
    [1.0,.36,.60],[0,1.10,.60],[-1.0,.36,.60]];
  for(const [i,j] of [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]]){
   house.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
    [new THREE.Vector3(...coords[i]),new THREE.Vector3(...coords[j])]),
    style(0xe0c69e,{lines:true,alpha:.88})));
  }
  for(const x of [-.48,.48]){
   const windowFrame=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.32,.32,.025)),
    style(0xc6b599,{lines:true,alpha:.9}));
   windowFrame.position.set(x,-.19,.54);house.add(windowFrame);
  }
  objects.push({type:'house',house});ring(1.56,1.14);
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
 function show(scene,now,subject=''){
  if(ghost){dispose(ghost.group,ghost.mats);ghost=null;}
  if(active.children.length)ghost={group:active,mats,start:now};
  else dispose(active,mats);
  active=new THREE.Group();root.add(active);mats=[];objects=[];
  kind=['orbit','atom','network','wave','planet','map','house','person','vehicle','landscape','diagram','object'].includes(scene)?scene:'network';
  planetName=['earth','mars','venus','saturn','jupiter','uranus','neptune','mercury','moon','sun'].find(x=>
   new RegExp('\\b'+x+'\\b').test(String(subject).toLowerCase()))||'';
  born=now;zoom=1;dx=dy=spin=0;label=subject;
  if(kind==='planet')planet();else if(kind==='map')map();else if(kind==='house')house();
  else if(kind==='person')person();else if(kind==='vehicle')vehicle();
  else if(kind==='landscape')landscape();else if(kind==='diagram')diagram();
  else if(kind==='object')object();else classic(kind);
  matter.setSource(typeof sourceProvider==='function'?sourceProvider():sourceProvider);
  matter.go(active,now,{label:String(subject||kind).slice(0,100)});
  // The topology only determines particle destinations; never display solid meshes.
  active.visible=false;
  root.visible=true;
 }
 function hide(){
  kind='';root.visible=false;
  if(ghost){dispose(ghost.group,ghost.mats);ghost=null;}
  dispose(active,mats);active=new THREE.Group();root.add(active);objects=[];mats=[];matter.hide();
  zoom=1;dx=dy=spin=0;
 }
 function setSource(provider){sourceProvider=provider;}
 function returnToCore(now){
  if(!kind)return;
  matter.setSource(typeof sourceProvider==='function'?sourceProvider():sourceProvider);
  matter.returnToSource(now);
 }
 function control(action){
  if(!kind)return false;
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
  const reveal=limit(projection.panel,0,1)*limit((now-born)/(reducedMotion?.01:.82),0,1);
  root.visible=reveal>.001;
  active.scale.setScalar((.5+.5*reveal)*zoom);
  active.position.set(dx,dy,0);
  active.rotation.y=spin+(reducedMotion?0:Math.sin(now*.19)*.08);
  matter.update(now,projection,{zoom,spin,dx,dy,pixelRatio:typeof devicePixelRatio==='number'?devicePixelRatio:1});
  for(const m of mats)m.opacity=m.userData.baseOpacity*reveal;
  if(ghost){
   const remaining=1-limit((now-ghost.start)/(reducedMotion?.01:.74),0,1);
   for(const m of ghost.mats)m.opacity=m.userData.baseOpacity*remaining;
   ghost.group.scale.setScalar(.75+remaining*.25);
   if(remaining<=0){dispose(ghost.group,ghost.mats);ghost=null;}
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
 return {root,show,hide,update,control,setSource,returnToCore,
  state:()=>({kind,zoom,dx,dy,rotation:spin,morphing:Boolean(ghost)||matter.state().morphProgress<1,
   visible:root.visible,matter:matter.state()})};
}
