import {earthLand} from './travis-earth-land.mjs?v=1';
import {createHolographicSurfaceMaterial} from './travis-holographic-surface.mjs?v=cinema-2';
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
function planetMap(THREE,name){
 const c=canvas(1024,512),ctx=c.getContext('2d'),im=ctx.createImageData(c.width,c.height);
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
  const u=x/c.width,v=y/c.height,lon=u*Math.PI*2,lat=(v-.5)*Math.PI;
  const grain=noise(x,y),cloud=smoothNoise(lon*2,lat*2);let level=.5;
  if(name==='earth')level=.10+cloud*.05;
  else if(name==='jupiter'){
   const bands=Math.sin(lat*36+Math.sin(lon*3+lat*11)*.36)+Math.sin(lat*73+Math.sin(lon*5)*.3)*.30;
   level=.49+bands*.22+grain*.05;
   const spot=((u-.28)/.074)**2+((v-.59)/.058)**2;
   if(spot<1)level=.16+.16*Math.sin(spot*18);
  }else if(name==='saturn')level=.52+Math.sin(lat*45)*.10+Math.sin(lat*87)*.04+grain*.04;
  else if(name==='mars'){
   level=.42+cloud*.22+smoothNoise(lon*5,lat*6)*.11+grain*.08;
   const canyon=Math.abs(v-.57-.011*Math.sin(u*48)-.007*Math.sin(u*107));const taper=Math.max(0,1-Math.abs(u-.31)/.14);level*=1-.46*Math.exp(-canyon*canyon/Math.max(.000001,.000020*taper))*taper;
   if(v<.075||v>.94)level=.93;
  }else if(name==='sun')level=.30+cloud*.15+smoothNoise(lon*22,lat*24)*.39+grain*.09;
  else if(name==='uranus')level=.42+Math.sin(lat*14)*.055+grain*.02;
  else if(name==='neptune')level=.30+Math.sin(lat*17+Math.sin(lon*2))*.12+grain*.04;
  else if(name==='venus')level=.57+Math.sin(lon*2+lat*14+cloud*5)*.17;
  else if(name==='moon'){level=.35+cloud*.23+grain*.10;const mare=((u-.26)/.13)**2+((v-.41)/.15)**2;if(mare<1)level*=.56;}
  else if(name==='mercury')level=.30+smoothNoise(lon*4+2,lat*5)*.29+grain*.15;
  else if(name==='pluto'){level=.36+smoothNoise(lon*3,lat*2+3)*.25;const heart=Math.min(((u-.23)/.075)**2+((v-.5)/.11)**2,((u-.32)/.075)**2+((v-.5)/.11)**2);if(heart<1)level=.87;}

  else level=.42+cloud*.19+grain*.12;
  const j=(y*c.width+x)*4,value=Math.round(Math.max(.03,Math.min(1,level))*255);
  im.data[j]=im.data[j+1]=im.data[j+2]=value;im.data[j+3]=255;
 }
 ctx.putImageData(im,0,0);
 if(name==='earth'){
  ctx.fillStyle='#d1d1d1';ctx.strokeStyle='#eeeeee';ctx.lineWidth=.7;
  for(const polygon of earthLand){ctx.beginPath();polygon.forEach(([lon,lat],i)=>{const x=(lon+180)/360*c.width,y=(90-lat)/180*c.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fill();ctx.stroke();}
 }else if(['moon','mercury','mars','pluto'].includes(name)){
  for(let i=0;i<(name==='mars'?32:name==='mercury'?165:name==='pluto'?18:110);i++){
   const x=noise(i,2)*c.width,y=(.12+noise(i,3)*.76)*c.height,r=2+noise(i,4)*12;
   const gradient=ctx.createRadialGradient(x-r*.18,y+r*.18,r*.2,x,y,r);
   gradient.addColorStop(0,'rgba(10,10,10,.55)');gradient.addColorStop(.70,'rgba(20,20,20,.3)');gradient.addColorStop(.87,'rgba(245,245,245,.48)');gradient.addColorStop(1,'rgba(180,180,180,0)');
   ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
 }
 const texture=new THREE.CanvasTexture(c);texture.wrapS=THREE.RepeatWrapping;texture.colorSpace=THREE.NoColorSpace;
 texture.userData.generatedVisual=name;return texture;
}
export function createDetailedSubject(THREE,scene,subject,{reference=null}={}){
 const variant=identifyVisualSubject(scene,subject),group=new THREE.Group(),materials=[],textures=[];
 group.name='TravisSubject:'+variant;
 const surface=(geometry,{map=null,mask=false,gain=1}={})=>{const mat=createHolographicSurfaceMaterial(THREE,{map,mask,gain});materials.push(mat);const mesh=new THREE.Mesh(geometry,mat);group.add(mesh);return mesh;};
 const line=(points,opacity=.5)=>{const mat=new THREE.LineBasicMaterial({color:0xc8a876,transparent:true,opacity,depthWrite:false});mat.userData.baseOpacity=opacity;materials.push(mat);const o=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),mat);group.add(o);return o;};
 const body=(name,r=.82)=>{const map=planetMap(THREE,name);textures.push(map);const mesh=surface(new THREE.SphereGeometry(r,96,64),{map,gain:name==='sun'?1.5:1.12});mesh.userData.visualBody=name;return mesh;};
 if(celestialNames[variant]){
  const mesh=body(variant);mesh.rotation.y=variant==='earth'?-.55:0;
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
  body('sun',.23).position.set(-1.43,0,0);
  const names=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];
  names.forEach((name,i)=>{const r=[.05,.08,.085,.062,.20,.17,.12,.115][i],x=-.93+i*.33;const m=body(name,r);m.position.set(x,Math.sin(i*1.7)*.30,0);
   if(name==='saturn'){const ring=surface(new THREE.RingGeometry(r*1.3,r*1.8,64),{gain:1.1});ring.position.copy(m.position);ring.rotation.x=1.03;}
   line([[x,-.48,0],[x,.48,0]],.12);
  });
 }else if(variant==='galaxy'){
  const positions=[],tones=[];
  for(let i=0;i<6500;i++){
   const r=Math.pow(noise(i,8),.65)*1.45,a=(i%4)*Math.PI/2+r*3.3+(noise(i,9)-.5)*.42;
   const width=(noise(i,10)-.5)*(.06+r*.15);
   positions.push(Math.cos(a)*r+width,(noise(i,11)-.5)*(.045+(1-r/1.45)*.10),Math.sin(a)*r+width);tones.push(.32+noise(i,12)*.68);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('aTone',new THREE.Float32BufferAttribute(tones,1));
  const mat=new THREE.PointsMaterial({color:0xe5c592,size:.012,transparent:true,opacity:.7,depthWrite:false});mat.userData.baseOpacity=.7;materials.push(mat);
  const stars=new THREE.Points(geo,mat);stars.rotation.x=.70;stars.rotation.z=-.28;group.add(stars);
  surface(new THREE.SphereGeometry(.055,20,14),{gain:1.8});
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
  const words=String(subject||'ABC').slice(0,90),c=canvas(1200,640),ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 170px sans-serif';
  const lines=[];let row='';
  for(const word of words.split(/\s+/)){if(ctx.measureText((row+' '+word).trim()).width>1080&&row){lines.push(row);row=word;}else row=(row+' '+word).trim();}if(row)lines.push(row);
  const shown=lines.slice(0,3),font=Math.min(170,Math.floor(570/shown.length));ctx.font=`600 ${font}px sans-serif`;
  shown.forEach((line,i)=>{const width=ctx.measureText(line).width;ctx.save();ctx.translate(600,320+(i-(shown.length-1)/2)*font*1.12);ctx.scale(Math.min(1,1080/width),1);ctx.fillText(line,0,0);ctx.restore();});
  const map=new THREE.CanvasTexture(c);textures.push(map);
  const plane=surface(new THREE.PlaneGeometry(2.7,1.44,32,16),{map,mask:true,gain:1.35});plane.userData.skipMorph=true;
  const data=ctx.getImageData(0,0,c.width,c.height).data,positions=[];
  for(let y=0;y<c.height;y+=4)for(let x=0;x<c.width;x+=4)if(data[(y*c.width+x)*4+3]>100)positions.push((x/c.width-.5)*2.7,(.5-y/c.height)*1.44,.003);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const mat=new THREE.PointsMaterial({color:0xd6b88c,size:.005,transparent:true,opacity:.35,depthWrite:false});mat.userData.baseOpacity=.35;materials.push(mat);group.add(new THREE.Points(geo,mat));
 }else if(variant==='reference'&&reference?.image){
  const image=reference.image,c=canvas(Math.min(512,image.width),Math.min(512,Math.round(image.height*Math.min(512,image.width)/image.width)));
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);
  const data=ctx.getImageData(0,0,c.width,c.height),aspect=c.width/c.height;
  // A depth relief of a sourced image, explicitly not a recovered 3D model.
  const width=aspect>=1?2.4:2.1*aspect,height=aspect>=1?2.4/aspect:2.1;
  const geo=new THREE.PlaneGeometry(width,height,96,96),a=geo.attributes.position,uv=geo.attributes.uv;
  for(let i=0;i<a.count;i++){const x=Math.min(c.width-1,Math.floor(uv.getX(i)*c.width)),y=Math.min(c.height-1,Math.floor((1-uv.getY(i))*c.height)),j=(y*c.width+x)*4,l=(data.data[j]*.2126+data.data[j+1]*.7152+data.data[j+2]*.0722)/255;a.setZ(i,l*.12);}
  geo.computeVertexNormals();const map=new THREE.CanvasTexture(c);textures.push(map);surface(geo,{map,gain:1.12});
 }else return null;
 group.userData.visualVariant=variant;
 return {group,materials,textures,variant};
}
