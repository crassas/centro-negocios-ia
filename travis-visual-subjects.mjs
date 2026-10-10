import {earthLand} from './travis-earth-land.mjs?v=1';
import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=worlds-1';
export const foldVisual=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const celestialNames={mercury:['mercury','mercurio'],venus:['venus'],earth:['earth','terra'],mars:['mars','marte'],jupiter:['jupiter'],saturn:['saturn','saturno'],uranus:['uranus','urano'],neptune:['neptune','neptuno'],pluto:['pluto','plutao'],moon:['moon','lua'],sun:['sun','sol']};
export function identifyVisualSubject(scene,subject){
 const text=foldVisual(subject);
 if(scene==='text')return 'text';if(scene==='reference')return 'reference';
 if(scene==='diagram'&&/\b(?:dna|adn)\b/.test(text))return 'dna';
 if(scene==='diagram'&&/\b(?:atom|atomo)\b/.test(text))return 'atom';
 if(scene==='object')for(const [key,re] of [['cube',/\b(?:cube|cubo)\b/],['sphere',/\b(?:sphere|esfera)\b/],['pyramid',/\b(?:pyramid|piramide)\b/]])if(re.test(text))return key;
 if(/\b(?:solar system|sistema solar|planetary system)\b/.test(text))return 'solar-system';
 if(/\b(?:space|espaco|universe|universo|galaxy|galaxia|cosmos|via lactea|milky way|stars|estrelas)\b/.test(text)||scene==='space')return 'galaxy';
 if(scene==='planet'){
  for(const [name,aliases] of Object.entries(celestialNames))if(aliases.some(a=>new RegExp('\\b'+a+'\\b').test(text)))return name;
  return 'earth';
 }
 return scene;
}
const noise=(x,y)=>{const v=Math.sin(x*12.9898+y*78.233)*43758.5453;return v-Math.floor(v);};
const smoothNoise=(x,y)=>Math.sin(x*3.3+Math.sin(y*2.7))*Math.cos(y*4.2+Math.cos(x*1.9))*.5+.5;
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
// Cached CPU canvases survive disposal of individual GPU textures. Bounded to
// the 12 named bodies; vector coastlines and bands avoid millions of trig calls.
const planetCanvases=new Map();
function planetMap(THREE,name){
 let c=planetCanvases.get(name);
 if(!c){
  c=canvas(1024,512);const ctx=c.getContext('2d');
  const palettes={earth:['#082553','#164576'],mars:['#63392c','#c97948'],jupiter:['#805f4c','#e9cfac'],saturn:['#ac9272','#edd7aa'],sun:['#ec5411','#fff3a4'],uranus:['#448a94','#b1e5e7'],neptune:['#152d81','#397cdf'],venus:['#b7985f','#f2d59f'],moon:['#50525a','#b1b5be'],mercury:['#555058','#aca198'],pluto:['#695850','#cbb49b']};
  const [dark,light]=palettes[name]||palettes.moon;
  ctx.fillStyle=dark;ctx.fillRect(0,0,1024,512);
  if(['jupiter','saturn','uranus','neptune','venus'].includes(name)){
   for(let y=-8;y<520;y+=2){
    const wave=name==='jupiter'?6:name==='venus'?13:2;
    ctx.globalAlpha=.38+.30*Math.sin(y*(name==='jupiter'?.21:.095))+.12*Math.sin(y*.73);
    ctx.fillStyle=light;ctx.beginPath();
    for(let x=0;x<=1024;x+=16){const yy=y+Math.sin(x*.019+y*.07)*wave+Math.sin(x*.043+y*.02)*wave*.4;x?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}
    for(let x=1024;x>=0;x-=16)ctx.lineTo(x,y+2+Math.sin(x*.019+y*.07)*wave+Math.sin(x*.043+y*.02)*wave*.4);
    ctx.fill();
   }
  }else if(name!=='earth'){
   for(let i=0;i<220;i++){
    const x=noise(i,3)*1024,y=noise(i,4)*512,rad=12+noise(i,5)*95;
    const g=ctx.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,light);g.addColorStop(1,dark+'00');ctx.globalAlpha=.12+noise(i,6)*.36;ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,rad*2,rad*2);
   }
  }
  ctx.globalAlpha=1;
  if(name==='earth'){
   const land=ctx.createLinearGradient(0,0,0,512);land.addColorStop(0,'#e4eeee');land.addColorStop(.16,'#839e81');land.addColorStop(.40,'#b49c68');land.addColorStop(.53,'#547b51');land.addColorStop(.85,'#91a57b');land.addColorStop(1,'#e4eeee');ctx.fillStyle=land;ctx.strokeStyle='#8cb497';ctx.lineWidth=.6;
   for(const polygon of earthLand){ctx.beginPath();polygon.forEach(([lon,lat],i)=>{const x=(lon+180)/360*1024,y=(90-lat)/180*512;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fill();ctx.stroke();}
  }
  if(name==='jupiter'){
   ctx.save();ctx.translate(287,302);ctx.scale(1.8,1);const g=ctx.createRadialGradient(0,0,1,0,0,29);g.addColorStop(0,'#ce8661');g.addColorStop(.66,'#9f4d36');g.addColorStop(1,'#b1744a00');ctx.fillStyle=g;ctx.fillRect(-30,-30,60,60);ctx.restore();
  }
  if(['moon','mercury','mars','pluto'].includes(name)){
   for(let i=0;i<(name==='mercury'?165:name==='moon'?110:32);i++){
    const x=noise(i,2)*1024,y=(.12+noise(i,3)*.76)*512,rad=2+noise(i,4)*12,g=ctx.createRadialGradient(x-rad*.18,y+rad*.18,rad*.2,x,y,rad);
    g.addColorStop(0,'#12101c88');g.addColorStop(.70,'#15152455');g.addColorStop(.87,'#fff6df66');g.addColorStop(1,'#fff6df00');ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,rad*2,rad*2);
   }
   if(name==='mars'){ctx.fillStyle='#e4dfd5';ctx.fillRect(0,0,1024,20);ctx.fillRect(0,495,1024,17);ctx.strokeStyle='#673b32';ctx.lineWidth=2;ctx.beginPath();for(let x=180;x<440;x+=4){const y=291+Math.sin(x*.09)*4+Math.sin(x*.22)*2;x===180?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
  }
  // Fine texture costs one small tile, independent of projected body size.
  const tile=canvas(64,64),tc=tile.getContext('2d'),grain=tc.createImageData(64,64);
  for(let i=0;i<4096;i++){const v=noise(i,19)>.5?255:0;grain.data.set([v,v,v,Math.round(noise(i,20)*19)],i*4);}tc.putImageData(grain,0,0);ctx.fillStyle=ctx.createPattern(tile,'repeat');ctx.fillRect(0,0,1024,512);
  planetCanvases.set(name,c);if(planetCanvases.size>12)planetCanvases.delete(planetCanvases.keys().next().value);
 }
 const texture=new THREE.CanvasTexture(c);texture.wrapS=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;
 texture.userData.generatedVisual=name;return texture;
}
export function createDetailedSubject(THREE,scene,subject,{reference=null}={}){
 const variant=identifyVisualSubject(scene,subject),group=new THREE.Group(),materials=[],textures=[];
 let animate=null;
 group.name='TravisSubject:'+variant;
 const surface=(geometry,{map=null,mask=false,gain=1,photo=false,natural=false,tint=0xffffff}={})=>{const mat=createHolographicSurfaceMaterial(THREE,{map,mask,gain,photo,natural,tint});materials.push(mat);const mesh=new THREE.Mesh(geometry,mat);group.add(mesh);return mesh;};
 const line=(points,opacity=.5)=>{const mat=new THREE.LineBasicMaterial({color:0xc8a876,transparent:true,opacity,depthWrite:false});mat.userData.baseOpacity=opacity;materials.push(mat);const o=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),mat);group.add(o);return o;};
 const body=(name,r=.82)=>{const map=planetMap(THREE,name);textures.push(map);const mesh=surface(new THREE.SphereGeometry(r,r<.25?40:96,r<.25?24:64),{map,natural:true,gain:name==='sun'?1.6:1.2});mesh.userData.visualBody=name;return mesh;};
 if(celestialNames[variant]){
  const mesh=body(variant);mesh.rotation.y=variant==='earth'?-.55:0;
  const baseRotation=mesh.rotation.y;animate=time=>{mesh.rotation.y=baseRotation+time*.11;};
  if(variant==='jupiter'||variant==='saturn')mesh.scale.y=.93;
  if(variant==='saturn'){
   for(const [inner,outer] of [[1.02,1.21],[1.25,1.48]]){
    const ring=surface(new THREE.RingGeometry(inner,outer,128,5),{gain:1.25});ring.rotation.x=1.04;ring.rotation.y=.22;
   }
  }
  if(variant==='sun')for(let i=0;i<6;i++){
   const a=i*2.39996,points=[];for(let j=0;j<=48;j++){const t=j/48*Math.PI;const r=.80+Math.sin(t)*(.06+.06*noise(i,31));const angle=a+t*(.045+noise(i,32)*.07);points.push([Math.cos(angle)*r,Math.sin(angle)*r,Math.sin(t)*.12]);}line(points,.4);
  }
 }else if(variant==='solar-system'){
  body('sun',.18);
  const names=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'],orbits=[];
  names.forEach((name,i)=>{
   const radius=.38+i*.16,r=[.029,.044,.047,.035,.105,.09,.064,.062][i],mesh=body(name,r),phase=i*2.39996;
   let rings=null;if(name==='saturn'){rings=surface(new THREE.RingGeometry(r*1.3,r*1.8,64),{gain:1.1});rings.rotation.x=1.03;}
   line(Array.from({length:97},(_,j)=>[Math.cos(j/96*Math.PI*2)*radius,Math.sin(j/96*Math.PI*2)*radius,0]),.18);
   orbits.push({mesh,rings,radius,phase,speed:.11/Math.pow(radius,1.5)});
  });
  animate=time=>{for(const o of orbits){const a=o.phase+time*o.speed;o.mesh.position.set(Math.cos(a)*o.radius,Math.sin(a)*o.radius,0);o.mesh.rotation.y=time*.17;if(o.rings)o.rings.position.copy(o.mesh.position);}};
  animate(0);group.rotation.x=-.58;
 }else if(variant==='galaxy'){
  const positions=[],tones=[],colors=[],warm=new THREE.Color('#ffe1ae'),cool=new THREE.Color('#8caaff');
  for(let i=0;i<6500;i++){
   const r=Math.pow(noise(i,8),.65)*1.45,a=(i%4)*Math.PI/2+r*3.3+(noise(i,9)-.5)*.42;
   const width=(noise(i,10)-.5)*(.06+r*.15);
   positions.push(Math.cos(a)*r+width,(noise(i,11)-.5)*(.045+(1-r/1.45)*.10),Math.sin(a)*r+width);tones.push(.32+noise(i,12)*.68);
   const blend=Math.min(1,r/1.1)*(.5+noise(i,16)*.5);colors.push(warm.r+(cool.r-warm.r)*blend,warm.g+(cool.g-warm.g)*blend,warm.b+(cool.b-warm.b)*blend);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('aTone',new THREE.Float32BufferAttribute(tones,1));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const mat=new THREE.PointsMaterial({vertexColors:true,size:.008,transparent:true,opacity:.85,depthWrite:false});mat.userData.baseOpacity=.85;materials.push(mat);
  const stars=new THREE.Points(geo,mat);stars.rotation.x=.70;stars.rotation.z=-.28;group.add(stars);
  surface(new THREE.SphereGeometry(.055,20,14),{gain:1.8});animate=time=>{stars.rotation.y=time*.035;};
 }else if(['cube','sphere','pyramid'].includes(variant)){
  surface(variant==='cube'?new THREE.BoxGeometry(1.3,1.3,1.3):variant==='sphere'?new THREE.SphereGeometry(.8,64,48):new THREE.ConeGeometry(.95,1.65,4));group.rotation.y=.35;
 }else if(variant==='dna'){
  const left=[],right=[];
  for(let i=0;i<=100;i++){const y=(i/100-.5)*2.5,a=i/100*Math.PI*4.2;left.push([Math.cos(a)*.42,y,Math.sin(a)*.42]);right.push([-Math.cos(a)*.42,y,-Math.sin(a)*.42]);}
  for(const strand of [left,right]){const curve=new THREE.CatmullRomCurve3(strand.map(p=>new THREE.Vector3(...p)));surface(new THREE.TubeGeometry(curve,100,.025,6,false));}
  for(let i=3;i<100;i+=6){const a=new THREE.Vector3(...left[i]),b=new THREE.Vector3(...right[i]),curve=new THREE.LineCurve3(a,b);surface(new THREE.TubeGeometry(curve,1,.019,6,false),{gain:1.4});}
 }else if(variant==='atom'){
  for(let i=0;i<9;i++){const a=i*2.39996;const node=surface(new THREE.SphereGeometry(.105,16,12),{gain:1.25});node.position.set(Math.cos(a)*.18,Math.sin(a)*.18,(i%3-1)*.10);}
  for(let j=0;j<3;j++){const points=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2,x=Math.cos(a)*1.05,y=Math.sin(a)*.4;points.push([x*Math.cos(j*Math.PI/3)-y*Math.sin(j*Math.PI/3),x*Math.sin(j*Math.PI/3)+y*Math.cos(j*Math.PI/3),Math.sin(a)*.16]);}line(points,.85);const electron=surface(new THREE.SphereGeometry(.045,14,10),{gain:1.8});electron.position.set(...points[20+j*19]);}
 }else if(variant==='text'){
  const words=String(subject||'ABC'),c=canvas(1200,640),ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
  let lines=[],font=170;
  function wrap(){
   const rows=[];let row='';
   for(const paragraph of words.split('\n')){
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
     if(ctx.measureText(word).width>1080){
      if(row){rows.push(row);row='';}
      for(const letter of [...word]){if(ctx.measureText(row+letter).width>1080){rows.push(row);row='';}row+=letter;}
     }else if(ctx.measureText((row+' '+word).trim()).width>1080&&row){rows.push(row);row=word;}else row=(row+' '+word).trim();
    }
    if(row){rows.push(row);row='';}
   }
   return rows.length?rows:[''];
  }
  for(;font>=16;font-=2){ctx.font=`600 ${font}px sans-serif`;lines=wrap();if(lines.length*font*1.12<=570)break;}
  lines.forEach((line,i)=>ctx.fillText(line,600,320+(i-(lines.length-1)/2)*font*1.12));
  group.userData.textLayout={text:words,lines,font};
  const map=new THREE.CanvasTexture(c);textures.push(map);
  const plane=surface(new THREE.PlaneGeometry(2.7,1.44,32,16),{map,mask:true,gain:1.35});plane.userData.skipMorph=true;
  const data=ctx.getImageData(0,0,c.width,c.height).data,positions=[];
  for(let y=0;y<c.height;y+=4)for(let x=0;x<c.width;x+=4)if(data[(y*c.width+x)*4+3]>100)positions.push((x/c.width-.5)*2.7,(.5-y/c.height)*1.44,.003);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const mat=new THREE.PointsMaterial({color:0xd6b88c,size:.005,transparent:true,opacity:.35,depthWrite:false});mat.userData.baseOpacity=.35;materials.push(mat);group.add(new THREE.Points(geo,mat));
 }else if(variant==='reference'&&reference?.image){
  const image=reference.image,scale=Math.min(1,960/Math.max(image.width,image.height)),c=canvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);
  const depth=canvas(48,48),dc=depth.getContext('2d',{willReadFrequently:true});dc.drawImage(image,0,0,48,48);
  const data=dc.getImageData(0,0,48,48),aspect=c.width/c.height;
  // A depth relief of a sourced image, explicitly not a recovered 3D model.
  const width=aspect>=1?2.4:2.1*aspect,height=aspect>=1?2.4/aspect:2.1;
  const geo=new THREE.PlaneGeometry(width,height,96,96),a=geo.attributes.position,uv=geo.attributes.uv;
  for(let i=0;i<a.count;i++){const x=Math.min(47,Math.floor(uv.getX(i)*48)),y=Math.min(47,Math.floor((1-uv.getY(i))*48)),j=(y*48+x)*4,l=(data.data[j]*.2126+data.data[j+1]*.7152+data.data[j+2]*.0722)/255;a.setZ(i,l*.025);}
  geo.computeVertexNormals();const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;textures.push(map);surface(geo,{map,gain:1.05,photo:true});
 }else return null;
 group.userData.visualVariant=variant;
 group.userData.dynamic=Boolean(animate);
 return {group,materials,textures,variant,update:animate,state:()=>({type:variant,time:group.userData.animationTime||0,textLayout:group.userData.textLayout})};
}
