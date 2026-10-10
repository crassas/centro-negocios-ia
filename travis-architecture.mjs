import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=worlds-1';

// Static detail is batched by material: thousands of small architectural parts
// remain a handful of draw calls on a phone, including during the particle fit.
export function createArchitecture(THREE,subject='House'){
 const name=String(subject).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const apartment=/^(?:building|buildings|edificio|edificios|apartment building|predio)$/.test(name);
 const modern=/modern|moderna|contempor/.test(name);
 const variant=apartment?'apartment-building':modern?'modern-house':'detailed-house';
 const group=new THREE.Group(),materials=[],batches=new Map(),outlines=[];
 const gains={wall:.84,stone:.60,trim:1.12,roof:.48,glass:.12,door:.36,interior:.055};
 const materialsByName=Object.fromEntries(Object.entries(gains).map(([key,gain])=>{
  const mat=createHolographicSurfaceMaterial(THREE,{gain});materials.push(mat);return [key,mat];
 }));
 function geometry(geo,key,position=[0,0,0],rotation=[0,0,0]){
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1));
  const flat=geo.index?geo.toNonIndexed():geo;flat.applyMatrix4(matrix);
  const batch=batches.get(key)||{position:[],normal:[],uv:[]};
  for(const attr of ['position','normal','uv'])for(const value of flat.getAttribute(attr).array)batch[attr].push(value);
  batches.set(key,batch);flat.dispose();if(flat!==geo)geo.dispose();
 }
 const box=(w,h,d,x,y,z,key='wall')=>geometry(new THREE.BoxGeometry(w,h,d),key,[x,y,z]);
 const rod=(a,b,r=.012,key='trim')=>{
  const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.clone().normalize());
  const e=new THREE.Euler().setFromQuaternion(q);geometry(new THREE.CylinderGeometry(r,r,v.length(),6),key,av.add(bv).multiplyScalar(.5).toArray(),[e.x,e.y,e.z]);
 };
 const line=(a,b)=>outlines.push(...a,...b);
 // Front and side joinery have recessed glazing, reveals, individual panes,
 // a sill and lintel. The facade plane is behind the glazing to avoid z fighting.
 function windowAt(x,y,z,w=.43,h=.47,side=false){
  const point=(a,b,c)=>side?[x+c,y+b,z-a]:[x+a,y+b,z+c];
  const part=(a,b,c,px,py,pz,key)=>{const p=point(px,py,pz);box(side?c:a,b,side?a:c,...p,key);};
  part(w+.09,h+.09,.042,0,0,0,'stone');
  part(w,h,.028,0,0,.025,'interior');
  part(w-.052,h-.052,.018,0,0,.044,'glass');
  for(const sign of [-1,1]){
   part(.027,h+.025,.07,sign*w/2,0,.062,'trim');
   part(w+.052,.027,.07,0,sign*h/2,.062,'trim');
  }
  part(.019,h,.045,0,0,.072,'trim');part(w,.017,.045,0,0,.074,'trim');
  part(w+.15,.045,.15,0,-h/2-.04,.058,'stone');
  part(w+.12,.046,.07,0,h/2+.045,.033,'trim');
 }
 const width=apartment?1.65:1.9,depth=1.24,bottom=-.99,top=apartment?1.30:.63;
 box(width+.24,.13,depth+.24,0,bottom-.04,0,'stone');
 box(width,top-bottom,depth,0,(top+bottom)/2,0);
 // Stone courses and corner quoins give the walls scale without a solid glow.
 for(let y=bottom+.12;y<top;y+=.12){
  line([-width/2,y,depth/2+.002],[width/2,y,depth/2+.002]);
  line([width/2+.002,y,depth/2],[width/2+.002,y,-depth/2]);
 }
 for(const x of [-width/2,width/2])for(let y=bottom+.12;y<top;y+=.21)box(.13,.115,.035,x,y,depth/2+.02,'stone');
 const floors=apartment?4:2,spacing=apartment?.52:.73;
 for(let floor=0;floor<floors;floor++){
  const y=bottom+.42+floor*spacing;
  for(const x of [-.56,.56])windowAt(x,y,depth/2+.027,apartment?.35:.44,apartment?.33:.43);
  if(floor>0&&apartment)windowAt(0,y,depth/2+.027,.30,.33);
  for(const z of [-.33,.32])windowAt(width/2+.027,y,z,.32,apartment?.33:.43,true);
  if(floor>0)box(width+.06,.045,depth+.055,0,y-spacing/2,0,'stone');
 }
 // Entrance: panelled door, stone surround, brass knob and three real steps.
 const front=depth/2;
 box(.34,.61,.03,0,bottom+.305,front+.04,'interior');
 box(.29,.57,.035,0,bottom+.29,front+.07,'door');
 for(const y of [bottom+.16,bottom+.41])box(.21,.18,.012,0,y,front+.094,'stone');
 for(const sign of [-1,1])box(.04,.64,.11,sign*.18,bottom+.32,front+.075,'trim');
 box(.40,.045,.11,0,bottom+.645,front+.075,'trim');
 geometry(new THREE.SphereGeometry(.018,8,6),'trim',[.103,bottom+.32,front+.125]);
 for(let i=0;i<3;i++)box(.60-i*.06,.065,.45-i*.10,0,bottom-.09+i*.04,front+.17-i*.03,'stone');
 if(!apartment){
  // Upper balcony, fine balusters and wall-mounted porch lights.
  box(.72,.055,.33,0,bottom+spacing+.08,front+.12,'stone');
  windowAt(0,bottom+spacing+.39,front+.027,.32,.49);
  for(let i=0;i<=8;i++)rod([-.34+i*.085,bottom+spacing+.10,front+.29],[-.34+i*.085,bottom+spacing+.34,front+.29],.007);
  rod([-.37,bottom+spacing+.35,front+.29],[.37,bottom+spacing+.35,front+.29]);
  for(const sign of [-1,1]){
   rod([sign*.37,bottom+spacing+.35,front+.29],[sign*.37,bottom+spacing+.35,front+.02]);
   box(.065,.12,.045,sign*.28,bottom+.50,front+.075,'door');
   box(.041,.067,.05,sign*.28,bottom+.50,front+.101,'trim');
  }
 }
 if(modern||apartment){
  box(width+.17,.085,depth+.18,0,top+.04,0,'trim');
  box(width+.12,.035,depth+.11,0,top+.10,0,'roof');
  for(const z of [-depth/2,depth/2])box(width+.10,.12,.045,0,top+.16,z,'stone');
  for(const x of [-width/2,width/2])box(.045,.12,depth,x,top+.16,0,'stone');
  // Roof plant and solar panels stay subordinate to the building silhouette.
  box(.36,.18,.26,-.38,top+.20,-.18,'stone');
  for(const x of [.1,.42]){box(.27,.03,.54,x,top+.16,0,'glass');for(let j=0;j<5;j++)line([x-.13,top+.181,-.24+j*.12],[x+.13,top+.181,-.24+j*.12]);}
 }else{
  const ridge=1.20,eave=top+.03,half=width/2+.15,z=depth/2+.15;
  const vertices=[[-half,eave,-z],[0,ridge,-z],[half,eave,-z],[-half,eave,z],[0,ridge,z],[half,eave,z]];
  for(const [a,b,c,key] of [[0,1,2,'wall'],[3,5,4,'wall'],[0,3,4,'roof'],[0,4,1,'roof'],[1,4,5,'roof'],[1,5,2,'roof']]){
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...vertices[a],...vertices[b],...vertices[c]],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));g.computeVertexNormals();geometry(g,key);
  }
  // Tile courses follow both pitched planes, with staggered short vertical joints.
  for(const sign of [-1,1])for(let row=0;row<9;row++){
   const t=row/9,nt=(row+1)/9,x=sign*half*t,y=ridge+(eave-ridge)*t+.007;
   line([x,y,-z],[x,y,z]);
   for(let col=0;col<15;col++){
    const zz=-z+(col+(row%2)*.5)/15*2*z;
    line([x,y,zz],[sign*half*nt,ridge+(eave-ridge)*nt+.007,zz]);
   }
  }
  rod([0,ridge+.018,-z],[0,ridge+.018,z],.026,'stone');
  for(const sign of [-1,1]){
   rod([sign*half,eave,-z],[sign*half,eave,z],.028,'trim');
   rod([sign*(width/2+.015),eave,front+.05],[sign*(width/2+.015),bottom+.05,front+.05],.012,'stone');
  }
  // Chimney with cap, flue and brick courses.
  box(.22,.48,.25,-.47,1.15,-.22,'stone');box(.28,.048,.31,-.47,1.41,-.22,'trim');
  box(.12,.023,.14,-.47,1.437,-.22,'interior');
  for(let y=1.01;y<1.39;y+=.065)line([-.58,y,-.09],[-.36,y,-.09]);
  // Round gable vent above the first-floor joinery.
  geometry(new THREE.CylinderGeometry(.075,.075,.022,24),'interior',[0,.91,z+.008],[Math.PI/2,0,0]);
  geometry(new THREE.TorusGeometry(.08,.014,6,24),'trim',[0,.91,z+.03]);
 }
 for(const [key,batch] of batches){
  const geo=new THREE.BufferGeometry();
  for(const attr of ['position','normal','uv'])geo.setAttribute(attr,new THREE.Float32BufferAttribute(batch[attr],attr==='uv'?2:3));
  group.add(new THREE.Mesh(geo,materialsByName[key]));
 }
 const lineMaterial=new THREE.LineBasicMaterial({color:0xd7b88b,transparent:true,opacity:.32,depthWrite:false});lineMaterial.userData.baseOpacity=.32;materials.push(lineMaterial);
 const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.Float32BufferAttribute(outlines,3));group.add(new THREE.LineSegments(lines,lineMaterial));
 group.userData.visualVariant=variant;
 return {group,materials,textures:[],variant};
}
