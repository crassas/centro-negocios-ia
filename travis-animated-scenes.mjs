import {createDetailedSubject} from './travis-visual-subjects.mjs?v=worlds-1';
import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=worlds-1';
import {transferState} from './travis-scene-planner.mjs?v=worlds-1';
const clamp=t=>Math.max(0,Math.min(1,t));
export function createAnimatedScene(THREE,kind,subject){
 const group=new THREE.Group(),materials=[],textures=[];let last={};
 group.userData.dynamic=true;group.name='TravisAnimatedScene';
 const surface=(geo,parent=group)=>{const m=createHolographicSurfaceMaterial(THREE,{gain:1.2});materials.push(m);const mesh=new THREE.Mesh(geo,m);parent.add(mesh);return mesh;};
 const line=(points,opacity=.35)=>{const m=new THREE.LineBasicMaterial({color:0xd9b77f,transparent:true,opacity,depthWrite:false});m.userData.baseOpacity=opacity;materials.push(m);const o=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),m);group.add(o);return o;};
 const ring=(r,opacity=.2)=>line(Array.from({length:129},(_,i)=>[Math.cos(i/128*Math.PI*2)*r,Math.sin(i/128*Math.PI*2)*r,0]),opacity);
 const planet=(name,r)=>{const built=createDetailedSubject(THREE,'planet',name);materials.push(...built.materials);textures.push(...built.textures);built.group.scale.setScalar(r/.82);group.add(built.group);return built.group;};
 function rocket(){
  const vessel=new THREE.Group();vessel.userData.visualBody='rocket';group.add(vessel);
  surface(new THREE.CylinderGeometry(.06,.075,.40,24),vessel);
  surface(new THREE.ConeGeometry(.06,.16,24),vessel).position.y=.28;
  for(let i=0;i<4;i++){const fin=surface(new THREE.BoxGeometry(.13,.12,.014),vessel);fin.position.set(Math.cos(i*Math.PI/2)*.065,-.16,Math.sin(i*Math.PI/2)*.065);fin.rotation.y=-i*Math.PI/2;}
  const nozzle=surface(new THREE.CylinderGeometry(.028,.055,.08,18),vessel);nozzle.position.y=-.24;
  const flame=surface(new THREE.ConeGeometry(.038,.22,16),vessel);flame.rotation.z=Math.PI;flame.position.y=-.37;flame.userData.skipMorph=true;
  return {vessel,flame};
 }
 if(kind==='journey'){
  const mars=/mars|marte/i.test(subject),r1=mars?1:.55,r2=mars?1.524:1.4;
  const origin=planet(mars?'Sun':'Earth',mars?.18:.31),earth=mars?planet('Earth',.10):null,destination=planet(mars?'Mars':'Moon',mars?.085:.12);
  ring(r1);ring(r2,.28);const guide=Array.from({length:161},(_,i)=>{const s=transferState(i/160,r1,r2);return [...s.rocket,0];});
  line(guide,.13);const trail=line(guide,.9);const {vessel,flame}=rocket();vessel.scale.setScalar(.40);
  const direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  function update(time,progress=null){
   const p=clamp(progress??time/22),transfer=clamp((p-.12)/.76),s=transferState(transfer,r1,r2),next=transferState(Math.min(1,transfer+.002),r1,r2),previous=transferState(Math.max(0,transfer-.002),r1,r2);
   if(earth){earth.position.set(Math.cos(s.originAngle)*r1,Math.sin(s.originAngle)*r1,0);earth.rotation.y=time*.12;}
   destination.position.set(Math.cos(s.destinationAngle)*r2,Math.sin(s.destinationAngle)*r2,0);destination.rotation.y=time*.10;origin.rotation.y=time*.06;
   vessel.position.set(s.rocket[0],s.rocket[1],.03);
   // A short schematic launch vignette precedes the orbital transfer.
   if(p<.12){const launch=p/.12,ease=launch*launch*(3-2*launch);const start=new THREE.Vector3(mars?r1:0,mars?.13:.35,.03);start.y+=Math.sin(launch*Math.PI)*.24;vessel.position.lerpVectors(start,vessel.position,ease);}
   direction.set(next.rocket[0]-previous.rocket[0],next.rocket[1]-previous.rocket[1],0).normalize();vessel.quaternion.setFromUnitVectors(up,direction);
   flame.visible=transfer<.055||transfer>.95;flame.scale.y=.7+Math.sin(time*17)*.2;
   trail.geometry.setDrawRange(0,Math.max(2,Math.floor(transfer*160)+1));
   last={type:mars?'earth-mars-transfer':'earth-moon-transfer',progress:p,phase:p<.12?'departure':p<.88?'transfer':'arrival',rocket:vessel.position.toArray(),destination:destination.position.toArray(),schematic:true};
  }
  update(0);group.rotation.x=-.32;
  return {group,materials,textures,variant:mars?'earth-mars-transfer':'earth-moon-transfer',update,state:()=>last};
 }
 if(kind==='vehicle'){
  const {vessel,flame}=rocket();vessel.scale.setScalar(2.8);
  return {group,materials,textures,variant:'rocket',update(time){vessel.rotation.y=time*.14;flame.scale.y=.8+Math.sin(time*9)*.15;last={type:'rocket',rotation:vessel.rotation.y};},state:()=>last};
 }
 if(kind==='weather'&&String(subject).toLowerCase()==='drop'){
  const profile=Array.from({length:49},(_,i)=>{const t=i/48;return new THREE.Vector2(Math.sqrt(Math.max(0,Math.sin(t*Math.PI)*(1-t)))*.50,t*1.45-.7);});
  const drop=surface(new THREE.LatheGeometry(profile,64));drop.userData.visualBody='Drop';
  return {group,materials,textures,variant:'drop',update(time){drop.rotation.y=time*.16;drop.scale.x=1+Math.sin(time*1.4)*.025;drop.scale.z=drop.scale.x;last={type:'drop',time};},state:()=>last};
 }
 if(kind!=='weather')return null;
 const variant=String(subject).toLowerCase(),fire=variant==='fire',snow=variant==='snow',ocean=variant==='ocean',clouds=variant==='clouds',storm=variant==='storm',rain=variant==='rain'||storm;
 if(ocean)group.rotation.x=.38;
 const count=clouds?1800:ocean?4800:fire?2000:2600;
 const positions=new Float32Array(count*3),seeds=new Float32Array(count);
 const rand=i=>{const n=Math.sin(i*12.9898+78.233)*43758.5453;return n-Math.floor(n);};
 for(let i=0;i<count;i++){positions.set([(rand(i+1)-.5)*2.6,(rand(i+count)-.5)*2.2,(rand(i+count*2)-.5)*1.15],i*3);seeds[i]=rand(i+count*3);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
 const mat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uBuild:{value:0},uVoice:{value:0}},vertexShader:`attribute float aSeed;uniform float uTime,uBuild;varying float vSeed,vAlpha;
 void main(){vec3 p=position;float t=uTime;vSeed=aSeed;vAlpha=uBuild*(1.-smoothstep(.95,1.3,abs(p.x)));
 ${ocean?'p.y=-.25+sin(p.x*4.+t*1.2)*.16+cos(p.z*6.-t*.8)*.13;':fire?'float age=fract(aSeed+t*(.18+aSeed*.13));p.y=-1.+age*2.;p.x*=.5*(1.-age);p.x+=sin(age*9.+t*1.3)*age*.15;p.z*=.45*(1.-age);vAlpha*=1.-age;':clouds?'p.y=.45+sin(p.x*3.+p.z*4.)*.15;p.x+=sin(t*.18+aSeed)*.10;':snow?'p.y=1.1-mod(1.1-p.y+t*(.24+aSeed*.22),2.2);p.x+=sin(t*.5+aSeed*30.)*.12;':'p.y=1.1-mod(1.1-p.y+t*(1.5+aSeed*.8),2.2);p.x-=sin(t*.4)*.09;'}
 vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(${clouds?'14.':rain?'7.':snow?'3.':'2.'}*5./max(2.,-mv.z),1.,${clouds?'18.':rain?'10.':'4.'});}`,
 fragmentShader:`precision highp float;varying float vSeed,vAlpha;void main(){vec2 uv=gl_PointCoord-.5;${rain?'uv.x*=4.;':''}float d=length(uv);if(d>.5)discard;gl_FragColor=vec4(${fire?'mix(vec3(1.,.19,.025),vec3(1.,.91,.43),vSeed)':snow||clouds?'mix(vec3(.55,.72,.92),vec3(.92,.98,1.),vSeed)':'mix(vec3(.13,.43,.86),vec3(.60,.90,1.),vSeed)'},vAlpha*(1.-smoothstep(.05,.5,d))*${clouds?'.12':'.85'});}`,
 transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});materials.push(mat);group.add(new THREE.Points(geo,mat));
 let rippleMaterial=null;
 if(rain){
  const data=[],angles=[],phases=[];
  for(let i=0;i<18;i++)for(let j=0;j<24;j++)for(const k of [j,j+1]){data.push((rand(i+170)-.5)*2.25,-1.09,(rand(i+230)-.5)*1.05);angles.push(k/24*Math.PI*2);phases.push(rand(i+370));}
  const rippleGeometry=new THREE.BufferGeometry();rippleGeometry.setAttribute('position',new THREE.Float32BufferAttribute(data,3));rippleGeometry.setAttribute('aAngle',new THREE.Float32BufferAttribute(angles,1));rippleGeometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(phases,1));
  rippleMaterial=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uBuild:{value:0},uVoice:{value:0}},vertexShader:`attribute float aAngle,aSeed;uniform float uTime,uBuild;varying float vAlpha;void main(){float age=fract(aSeed+uTime*.7);vec3 p=position;p.x+=cos(aAngle)*age*.16;p.z+=sin(aAngle)*age*.16;vAlpha=(1.-age)*uBuild*.35;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`precision highp float;varying float vAlpha;void main(){gl_FragColor=vec4(.34,.72,1.,vAlpha);}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});materials.push(rippleMaterial);group.add(new THREE.LineSegments(rippleGeometry,rippleMaterial));
 }
 let bolt=null;
 if(storm){bolt=line([[-.3,1,0],[.05,.65,0],[-.1,.35,0],[.25,.1,0]],.85);}
 return {group,materials,textures,variant,update(time){mat.uniforms.uTime.value=time;if(rippleMaterial)rippleMaterial.uniforms.uTime.value=time;if(bolt)bolt.visible=time%7<.13;last={type:variant,time,particles:count};},state:()=>last};
}
