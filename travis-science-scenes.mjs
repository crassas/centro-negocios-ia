import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=sand-1';
const rand=n=>{const f=Math.sin(n*127.1+311.7)*43758.5453123;return f-Math.floor(f);};
export function createScienceScene(THREE,subject){
 const title=String(subject).toLowerCase(),group=new THREE.Group(),materials=[],textures=[];
 group.name='TravisDiscovery';group.userData.dynamic=true;let state={};
 const gold=createHolographicSurfaceMaterial(THREE,{gain:1.25});materials.push(gold);
 function surface(geo,parent=group){const m=new THREE.Mesh(geo,gold);parent.add(m);return m;}
 function grains(positions,{size=2,alpha=.72}={}){
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const seeds=Float32Array.from({length:positions.length/3},(_,i)=>rand(i+33));geo.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
  const mat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uBuild:{value:0},uVoice:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`attribute float aSeed;uniform float uTime,uBuild;varying float vLight;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(${size.toFixed(2)}*5./max(2.,-p.z),1.,5.);vLight=uBuild*(.68+.32*sin(aSeed*40.+uTime*.8));}`,
   fragmentShader:`precision highp float;varying float vLight;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(1.,.76,.40,(1.-smoothstep(.08,.5,d))*vLight*${alpha.toFixed(2)});}`});
  materials.push(mat);const points=new THREE.Points(geo,mat);group.add(points);return points;
 }
 // Merge local solid pieces into a single mesh so molecular detail remains
 // inexpensive on a phone. The shared particle sampler sees the full geometry.
 function merge(geometries){
  const output=new THREE.BufferGeometry();for(const key of ['position','normal','uv']){
   const size=key==='uv'?2:3,values=[];for(const geo of geometries)values.push(...geo.attributes[key].array);
   output.setAttribute(key,new THREE.Float32BufferAttribute(values,size));
  }for(const geo of geometries)geo.dispose();return output;
 }
 function local(geo,position,quaternion){const g=geo.index?geo.toNonIndexed():geo.clone();geo.dispose();if(quaternion)g.applyQuaternion(quaternion);if(position)g.translate(...position);return g;}
 if(/dna|adn/.test(title)){
  const pieces=[],strands=[[],[]],n=42,height=2.5,r=.48,turns=3.8;
  for(let i=0;i<=190;i++){const y=i/190*height-height/2,a=i/190*Math.PI*2*turns;for(let k=0;k<2;k++){const angle=a+k*Math.PI;strands[k].push(new THREE.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r));}}
  for(const points of strands)pieces.push(local(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),190,.027,7,false)));
  const up=new THREE.Vector3(0,1,0);
  for(let i=0;i<n;i++){
   const a=i/(n-1)*Math.PI*2*turns,y=i/(n-1)*height-height/2;
   const p=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r),q=new THREE.Vector3(-p.x,y,-p.z);
   const orientation=new THREE.Quaternion().setFromUnitVectors(up,q.clone().sub(p).normalize());
   pieces.push(local(new THREE.CylinderGeometry(.017,.017,r*2,7),[0,y,0],orientation));
   for(const end of [p,q])pieces.push(local(new THREE.SphereGeometry(.043,8,6),end.toArray()));
  }
  surface(merge(pieces));group.rotation.z=-.15;
  return {group,materials,textures,variant:'dna-double-helix',update(time){group.rotation.y=time*.17;state={type:'dna-double-helix',time,basePairs:n,schematic:true};},state:()=>state};
 }
 if(/hydrogen|atom/.test(title)){
  // Ground-state hydrogen: r has a Gamma(3, 1/2) distribution in Bohr units.
  // Uniform solid angle, capped tail for framing. Dots are samples of one
  // electron's probability, not moving particles or multiple electrons.
  const positions=[];for(let i=0;i<6200;i++){
   const r=Math.min(6,-.5*Math.log(Math.max(1e-9,rand(i*7+1)*rand(i*7+2)*rand(i*7+3))))*.25;
   const z=rand(i*7+4)*2-1,a=rand(i*7+5)*Math.PI*2,s=Math.sqrt(1-z*z);
   positions.push(Math.cos(a)*s*r,z*r,Math.sin(a)*s*r);
  }
  const cloud=grains(positions,{size:1.7,alpha:.52});surface(new THREE.SphereGeometry(.05,24,16));
  return {group,materials,textures,variant:'hydrogen-1s',update(time){group.rotation.y=time*.07;cloud.material.uniforms.uTime.value=time;state={type:'hydrogen-1s',time,samples:6200,orbital:'1s',schematic:true};},state:()=>state};
 }
 if(/black hole/.test(title)){
  const positions=[];for(let i=0;i<5800;i++){
   const r=.49+Math.pow(rand(i*5+1),1.65)*1.05,a=rand(i*5+2)*Math.PI*2;
   positions.push(Math.cos(a)*r,(rand(i*5+3)-.5)*.055,Math.sin(a)*r);
  }
  const disc=grains(positions,{size:1.9,alpha:.83});
  const discMaterial=new THREE.ShaderMaterial({uniforms:{uBuild:{value:0},uTime:{value:0},uVoice:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`precision highp float;varying vec3 vP;uniform float uBuild,uTime;void main(){float r=length(vP.xy),a=atan(vP.y,vP.x);float filaments=.48+.52*pow(.5+.5*sin(r*160.+sin(a*3.+uTime*.18)*2.),3.);float grain=fract(sin(dot(floor(vP.xy*550.),vec2(12.9898,78.233)))*43758.54);float inner=1.-smoothstep(.48,1.52,r);float glow=pow(inner,1.4)*(.35+.65*grain)*filaments;gl_FragColor=vec4(1.,.69,.28,glow*uBuild*.78);}`});
  materials.push(discMaterial);const discSurface=new THREE.Mesh(new THREE.RingGeometry(.48,1.54,160,14),discMaterial);discSurface.rotation.x=-Math.PI/2;group.add(discSurface);
  // The shadow and luminous rings are artistic geometry, not ray tracing.
  const dark=new THREE.ShaderMaterial({uniforms:{uBuild:{value:0},uTime:{value:0},uVoice:{value:0}},vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float uBuild;void main(){if(uBuild<.5)discard;gl_FragColor=vec4(.009,.006,.003,1.);}',depthWrite:true});materials.push(dark);
  group.add(new THREE.Mesh(new THREE.SphereGeometry(.41,48,32),dark));
  const photon=surface(new THREE.TorusGeometry(.44,.012,8,150));photon.rotation.x=Math.PI/2;
  // A fine arc suggests the distant side of a lensed accretion disc.
  const arc=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI;arc.push(new THREE.Vector3(Math.cos(a)*.57,Math.sin(a)*.47,-.035));}
  surface(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc),100,.011,6,false));
  group.rotation.x=.40;
  return {group,materials,textures,variant:'black-hole-accretion',update(time){disc.rotation.y=time*.24;disc.material.uniforms.uTime.value=time;discMaterial.uniforms.uTime.value=time;state={type:'black-hole-accretion',time,particles:5800,schematic:true};},state:()=>state};
 }
 if(/aurora/.test(title)){
  const positions=[],count=3900;for(let i=0;i<count;i++)positions.push(0,0,0);
  const curtains=grains(positions,{size:1.5,alpha:.65}),attribute=curtains.geometry.attributes.position;
  function pose(time){for(let i=0;i<count;i++){
   const x=(rand(i*3+1)-.5)*2.7,h=rand(i*3+2),sheet=i%3;
   const wave=Math.sin(x*2.8+time*.35+sheet*.8)*.19+Math.sin(x*6.-time*.23)*.10;
   attribute.setXYZ(i,x,-.55+h*(.75+.6*Math.sin(x*1.7+1.2)**2)+wave,(sheet-1)*.25+Math.sin(x*2.+time*.3)*.25);
  }attribute.needsUpdate=true;curtains.geometry.computeBoundingSphere();}
  pose(0);
  const ribbonGeometry=new THREE.PlaneGeometry(2.7,1,180,24);
  const ribbonMaterial=new THREE.ShaderMaterial({uniforms:{uBuild:{value:0},uTime:{value:0},uVoice:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
   vertexShader:`varying vec2 vUv;uniform float uTime;void main(){vUv=uv;vec3 p=position;float wave=sin(p.x*2.8+uTime*.35)*.19+sin(p.x*6.-uTime*.23)*.10;p.y=-.55+uv.y*(.75+.6*pow(sin(p.x*1.7+1.2),2.))+wave;p.z=sin(p.x*2.+uTime*.3)*.25;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
   fragmentShader:`precision highp float;varying vec2 vUv;uniform float uBuild,uTime;void main(){float thread=pow(.5+.5*sin(vUv.x*540.+sin(vUv.x*40.+uTime*.3)*3.),5.);float edge=smoothstep(0.,.08,vUv.x)*(1.-smoothstep(.92,1.,vUv.x));float fade=sin(vUv.y*3.14159)*edge;gl_FragColor=vec4(.94,.65,.29,fade*(.08+thread*.20)*uBuild);}`});
  materials.push(ribbonMaterial);group.add(new THREE.Mesh(ribbonGeometry,ribbonMaterial));
  const horizon=[];for(let i=0;i<340;i++){const x=(i/339-.5)*2.7;horizon.push(x,-.77+Math.sin(x*6.)*.045+Math.cos(x*13.)*.02,.2);}
  grains(horizon,{size:1.25,alpha:.38});
  return {group,materials,textures,variant:'aurora-curtains',update(time){pose(time);curtains.material.uniforms.uTime.value=time;ribbonMaterial.uniforms.uTime.value=time;state={type:'aurora-curtains',time,particles:count,schematic:true};},state:()=>state};
 }
 gold.dispose();return null;
}
