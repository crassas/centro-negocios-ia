import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=figures-1';

// Match the complete subject. A hand plane, a geometric plane and a named
// aircraft must never silently become this generic passenger aircraft.
export function aircraftSubject(value){
 const t=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
  .replace(/^(?:(?:a|an|the|um|uma|o)\s+)+/,'').replace(/[.!?]+$/,'').trim();
 return /^(?:(?:passenger|commercial) )?(?:airplane|aeroplane|airliner|aircraft|plane)$|^(?:aviao|aeroplano|aeronave)(?: (?:comercial|de passageiros))?$/.test(t)?'Airplane':null;
}

// Original illustrative twin-engine airliner, not a manufacturer's measured CAD.
// Volumetric sections and airfoils share Travis's existing sand/morph material.
export function createAircraft(THREE,{reducedMotion=false}={}){
 const group=new THREE.Group(),fans=[];group.name='TravisAirplane';
 const materials=[
  createHolographicSurfaceMaterial(THREE,{natural:true,tint:0xe3eaf0,porosity:.004,gain:1.1}),
  createHolographicSurfaceMaterial(THREE,{natural:true,tint:0x1d354d,porosity:.004,gain:.85}),
  createHolographicSurfaceMaterial(THREE,{natural:true,tint:0xbc9261,porosity:.006,gain:1.15})
 ];
 const add=(name,geometry,material=0,parent=group)=>{const m=new THREE.Mesh(geometry,materials[material]);m.name=name;parent.add(m);return m;};
 const merge=geometries=>{
  const arrays={position:[],normal:[],uv:[]};
  for(const indexed of geometries){const g=indexed.index?indexed.toNonIndexed():indexed;
   if(!g.attributes.normal)g.computeVertexNormals();
   for(const key of Object.keys(arrays))arrays[key].push(...g.attributes[key].array);
   if(g!==indexed)g.dispose();indexed.dispose();
  }
  const g=new THREE.BufferGeometry();for(const [key,a] of Object.entries(arrays))g.setAttribute(key,new THREE.Float32BufferAttribute(a,key==='uv'?2:3));return g;
 };
 const ellipsoid=(x,y,z,sx,sy,sz)=>new THREE.SphereGeometry(1,12,8).scale(sx,sy,sz).translate(x,y,z);
 // Smooth fuselage cross sections; the two tips close the body completely.
 const profile=[[-1.53,0],[-1.40,.045],[-1.12,.11],[-.76,.175],[-.35,.193],[.25,.195],[.78,.18],[1.06,.145],[1.29,.09],[1.43,.032],[1.47,0]];
 const curve=new THREE.CatmullRomCurve3(profile.map(([z,r])=>new THREE.Vector3(r,z,0)));
 const points=curve.getPoints(88).map(p=>new THREE.Vector2(Math.max(0,p.x),p.y));
 add('Fuselage',new THREE.LatheGeometry(points,48).rotateX(Math.PI/2));
 // Closed, tapered airfoil lofts. Actual thickness, sweep and dihedral; no cards.
 function wing(name,side,span,rootZ,rootChord,tipChord,sweep,y,vertical=false){
  const positions=[],uv=[],indices=[],rows=8,cols=24;
  for(let face=0;face<2;face++)for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
   const u=i/rows,t=j/cols,chord=rootChord+(tipChord-rootChord)*u;
   const thick=5*.10*chord*(.2969*Math.sqrt(t)-.126*t-.3516*t*t+.2843*t**3-.1036*t**4)*(face?-1:1);
   const spread=.13+span*u,height=y+u*.085,z=rootZ-sweep*u-chord*t;
   positions.push(vertical?thick:side*spread,vertical?y+span*u:height+thick,z);uv.push(u,t);
  }
  const layer=(rows+1)*(cols+1),quad=(a,b,c,d)=>indices.push(a,b,d,b,c,d);
  for(let f=0;f<2;f++)for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
   const a=f*layer+i*(cols+1)+j,b=a+cols+1;f?quad(a,a+1,b+1,b):quad(a,b,b+1,a+1);
  }
  for(let j=0;j<cols;j++)for(const i of [0,rows]){const a=i*(cols+1)+j;quad(a,a+layer,a+layer+1,a+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return add(name,g);
 }
 for(const side of [-1,1]){
  const label=side<0?'Port':'Starboard';
  wing(label+' wing',side,1.22,.34,.72,.14,.70,-.055);
  wing(label+' tailplane',side,.43,-.92,.37,.12,.27,.105);
  const winglet=add(label+' winglet',new THREE.BoxGeometry(.025,.17,.13));winglet.position.set(side*1.35,.115,-.43);winglet.rotation.z=side*-.18;
  const windows=[];for(let i=0;i<24;i++){const z=-.70+i*.066;windows.push(ellipsoid(side*.182,.065,z,.012,.027,.018));}
  add(label+' cabin windows',merge(windows),1);
  const doors=[];for(const z of [-.77,.80])doors.push(new THREE.BoxGeometry(.008,.13,.060).translate(side*.174,-.003,z));add(label+' doors',merge(doors),2);
  const engine=new THREE.Group();engine.name=label+' engine';engine.position.set(side*.49,-.22,.10);group.add(engine);
  const housing=[[.0,-.28],[.072,-.28],[.099,-.20],[.118,.10],[.112,.23],[.09,.24],[.081,.16],[.076,-.08]].map(([r,z])=>new THREE.Vector2(r,z));
  add(label+' nacelle',new THREE.LatheGeometry(housing,40).rotateX(Math.PI/2),0,engine);
  add(label+' intake',new THREE.CircleGeometry(.084,40).translate(0,0,.155),1,engine);
  add(label+' spinner',new THREE.ConeGeometry(.030,.068,24).rotateX(Math.PI/2).translate(0,0,.19),2,engine);
  const blades=[];for(let i=0;i<18;i++){const a=i/18*Math.PI*2;blades.push(new THREE.BoxGeometry(.009,.043,.006).rotateZ(-.35).translate(0,.056,.17).rotateZ(a));}
  const fan=add(label+' fan',merge(blades),2,engine);fans.push(fan);
  const pylon=add(label+' pylon',new THREE.BoxGeometry(.032,.12,.22));pylon.position.set(side*.49,-.105,.05);
 }
 function cockpit(){
  const patches=[];for(const side of [-1,1])for(let i=0;i<3;i++){
   const z=1.04+i*.066,x=side*(.111-i*.022),g=ellipsoid(x,.071-i*.014,z,.029,.027,.042);patches.push(g);
  }add('Cockpit glazing',merge(patches),1);
 }
 cockpit();wing('Vertical stabilizer',1,.46,-.91,.43,.15,.28,.115,true);
 group.rotation.set(.18,-.64,-.055);group.userData.visualBody='Airplane';group.userData.dynamic=true;
 let time=0;const vertexCount=()=>{let n=0;group.traverse(o=>{if(o.geometry)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;};
 const triangles=vertexCount();
 return {group,materials,textures:[],variant:'airplane',update(t){time=t;if(!reducedMotion){group.rotation.z=-.055+Math.sin(t*.34)*.022;for(const fan of fans)fan.rotation.z=t*2;}},state:()=>({type:'airplane',time,triangles,representation:'illustrative-3d',engines:2})};
}
