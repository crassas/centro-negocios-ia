/**
 * Travis / Michael Jackson holographic portrait
 * VISUAL ONLY: Travis remains the assistant; this does not clone Jackson's voice.
 *
 * Photo: Michael Jackson publicity photo, 1984, by Matthew Rolston / Epic Records.
 * Source: https://commons.wikimedia.org/wiki/File:Michael_Jackson_publicity_photo_1984.jpg
 * Commons describes the work as public domain in the United States. Check local
 * rights before distributing this photo in commercial or public installations.
 */
export const MICHAEL_JACKSON_PORTRAIT = Object.freeze({
  remote: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Michael_Jackson_publicity_photo_1984.jpg',
  local: './assets/travis/michael-jackson-1984.jpg',
  credit: 'Michael Jackson publicity photograph (1984), Matthew Rolston / Epic Records',
  source: 'https://commons.wikimedia.org/wiki/File:Michael_Jackson_publicity_photo_1984.jpg'
});

async function loadPortrait(url, timeout=9000) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { image.src=''; reject(new Error('Portrait loading timeout')); }, timeout);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('Portrait unavailable: '+url)); };
    image.src = url;
  });
}

function makeCutout(THREE, image) {
  // Portrait crop. All coordinates are ratios of the original Wikimedia photo.
  const w=512,h=640;
  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Canvas 2D unavailable.');
  context.drawImage(image,image.naturalWidth*.365,0,image.naturalWidth*.335,
    image.naturalHeight*.325,0,0,w,h);

  // Soft, asymmetric head + hair silhouette. No rectangular photography card.
  const outline=[
    [.33,-.04],[.58,-.04],[.72,.01],[.81,.06],[.88,.16],
    [.89,.29],[.86,.43],[.82,.54],[.73,.65],[.70,.76],
    [.80,.87],[.87,1.03],[.13,1.03],[.20,.88],[.31,.76],
    [.27,.66],[.16,.56],[.11,.43],[.09,.29],[.11,.17],
    [.17,.08],[.24,.02]
  ];
  const mask=document.createElement('canvas');mask.width=w;mask.height=h;
  const m=mask.getContext('2d');
  m.fillStyle='white';m.shadowColor='white';m.shadowBlur=10;
  m.beginPath();outline.forEach(([x,y],i)=>i?m.lineTo(x*w,y*h):m.moveTo(x*w,y*h));
  m.closePath();m.fill();
  context.globalCompositeOperation='destination-in';
  context.drawImage(mask,0,0);
  context.globalCompositeOperation='source-over';
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  return {texture,canvas};
}

function visibleBounds(geometry) {
  const pos=geometry?.attributes?.position,indices=geometry?.index?.array;
  if(!pos)return null;
  const out={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,maxZ:-Infinity};
  for(let i=0,n=indices?.length??pos.count;i<n;i++){
    const k=indices?indices[i]:i,x=pos.getX(k),y=pos.getY(k),z=pos.getZ(k);
    if(y<.17)continue;
    out.minX=Math.min(x,out.minX);out.maxX=Math.max(x,out.maxX);
    out.minY=Math.min(y,out.minY);out.maxY=Math.max(y,out.maxY);
    out.maxZ=Math.max(z,out.maxZ);
  }
  return Number.isFinite(out.minX)&&Number.isFinite(out.maxZ)?out:null;
}

function makePortraitMaterial(THREE,texture) {
  const uniforms={
    uPortrait:{value:texture},uTime:{value:0},uBuild:{value:0},
    uDissolve:{value:0},uVoice:{value:0},uOpacity:{value:1}
  };
  const material=new THREE.ShaderMaterial({
    uniforms,
    vertexShader:String.raw`
      varying vec2 vUv;
      uniform float uTime,uVoice;
      void main(){
        vUv=uv;
        vec3 p=position;
        float r=(uv.x-.5)*2.;
        p.z += .095*(1.-r*r);
        float mouth=exp(-pow((uv.y-.40)/.067,2.))*exp(-pow((uv.x-.51)/.17,2.));
        p.y-=mouth*uVoice*.026;
        p.z+=mouth*uVoice*.010;
        p.z+=.003*sin(uTime*.8+uv.y*7.);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }
    `,
    fragmentShader:String.raw`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uPortrait;
      uniform float uTime,uBuild,uDissolve,uVoice,uOpacity;
      void main(){
        vec4 photo=texture2D(uPortrait,vUv);
        if(photo.a<.028)discard;
        vec2 cell=floor(vUv*vec2(238.,360.));
        float grain=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
        float materialise=(1.-vUv.y)*.91+grain*.09;
        if(uBuild<.995&&materialise>uBuild)discard;
        float field=vUv.y*.57+grain*.32+(.5+.5*sin(vUv.x*13.))*.11;
        if(uDissolve>=.995||(uDissolve>.002&&field<uDissolve))discard;
        float edge=1.-smoothstep(0.,.06,field-uDissolve);
        float luma=dot(photo.rgb,vec3(.2126,.7152,.0722));
        float ink=pow(luma,.92);
        vec3 shadow=vec3(.012,.045,.084);
        vec3 light=vec3(.50,.85,1.05);
        vec3 colour=mix(shadow,light,ink);
        colour+=vec3(.24,.14,.07)*edge*uDissolve*.5;
        colour*=.92+.08*sin(vUv.y*760.-uTime*2.0);
        colour*=1.+.06*sin(vUv.y*20.-uTime*.9);
        colour+=vec3(.08,.21,.29)*uVoice*.16;
        float rim=1.-smoothstep(0.,.03,photo.a);
        float alpha=photo.a*(.89+.09*luma)*uOpacity*(1.-rim*.10);
        gl_FragColor=vec4(colour,alpha);
      }
    `,
    transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
    blending:THREE.NormalBlending,toneMapped:false
  });
  return {material,uniforms};
}

function createSandHalo(THREE,canvas,shared) {
  const W=canvas.width,H=canvas.height;
  const data=canvas.getContext('2d').getImageData(0,0,W,H).data;
  const coordinates=[],seeds=[];
  // Deterministic particle pattern so hologram doesn't flicker between sessions.
  for(let i=0;i<3200;i++){
    const u=((i*457)%3199+.5)/3200, v=((i*1493)%3197+.5)/3200;
    const ix=Math.min(W-1,Math.floor(u*W));
    const iy=Math.min(H-1,Math.floor((1.-v)*H));
    if(data[(iy*W+ix)*4+3]<85)continue;
    const seed=((i*1877)%3209)/3209;
    coordinates.push(u-.5,v-.5,.103+.006*seed);
    seeds.push(seed);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));
  geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:shared.uTime,uDissolve:shared.uDissolve,uOpacity:shared.uOpacity},
    vertexShader:String.raw`
      attribute float aSeed;
      uniform float uTime,uDissolve,uOpacity;
      varying float vAlpha;
      void main(){
        float field=(position.y+.5)*.57+aSeed*.43;
        float age=uDissolve-field;
        float edge=smoothstep(-.05,.014,age)*(1.-smoothstep(.025,.29,age));
        vAlpha=edge*uOpacity*(1.-step(.995,uDissolve));
        vec3 p=position;
        float scatter=max(0.,age);
        p.x+=sin(aSeed*41.+uTime*1.6)*scatter*.5;
        p.y+=scatter*(.28+aSeed*.4);
        p.z+=cos(aSeed*23.+uTime)*scatter*.25;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(3.2/max(.5,-mv.z),1.,3.);
      }
    `,
    fragmentShader:String.raw`
      precision mediump float;
      varying float vAlpha;
      void main(){
        float d=length(gl_PointCoord-.5);
        if(d>.5)discard;
        gl_FragColor=vec4(.67,.90,1.,vAlpha*(1.-d*2.));
      }
    `,
    transparent:true,depthWrite:false,depthTest:true,
    blending:THREE.AdditiveBlending,toneMapped:false
  });
  const points=new THREE.Points(geometry,material);
  points.name='TravisMichaelJacksonSand';
  points.renderOrder=5;
  return points;
}

export async function createMichaelJacksonHologram(THREE,parent,head) {
  if(!parent||!head?.isMesh)throw new Error('Travis head not ready.');
  let image,lastError;
  const assets=[
    new URL(MICHAEL_JACKSON_PORTRAIT.local,import.meta.url).href,
    MICHAEL_JACKSON_PORTRAIT.remote
  ];
  for(const url of assets) {
    try {image=await loadPortrait(url);break;}catch(error){lastError=error;}
  }
  if(!image)throw lastError||new Error('Michael Jackson portrait unavailable.');
  const {texture,canvas}=makeCutout(THREE,image);
  const {material,uniforms}=makePortraitMaterial(THREE,texture);
  const root=new THREE.Group();
  root.name='TravisMichaelJacksonIdentity';
  const bounds=visibleBounds(head.geometry);
  if(!bounds)throw new Error('Travis face bounds unavailable.');
  const w=Math.min(1.30,Math.max(.86,(bounds.maxX-bounds.minX)*1.09));
  const h=Math.min(1.60,Math.max(1.14,(bounds.maxY-bounds.minY)*1.17));
  root.position.set((bounds.minX+bounds.maxX)/2,
    (bounds.minY+bounds.maxY)/2+.055,bounds.maxZ+.065);
  root.scale.set(w,h,1);
  const portrait=new THREE.Mesh(new THREE.PlaneGeometry(1,1,40,54),material);
  portrait.name='TravisMichaelJacksonFace';
  portrait.renderOrder=4;
  root.add(portrait);
  root.add(createSandHalo(THREE,canvas,uniforms));
  // Parent is the same GLTF space as the original bust; the old 3D mesh remains
  // a low-light depth/backlight fallback, including when projection starts.
  parent.add(root);
  let disposed=false,animationFrame=0;
  const avatar={
    root,
    update({time=0,build=1,dissolve=0,voice=0,opacity=1}={}){
      uniforms.uTime.value=time;
      uniforms.uBuild.value=Math.max(0,Math.min(1,build));
      uniforms.uDissolve.value=Math.max(0,Math.min(1,dissolve));
      uniforms.uVoice.value=Math.max(0,Math.min(1,voice));
      uniforms.uOpacity.value=Math.max(0,Math.min(1,opacity));
      root.visible=opacity>.015;
    },
    dispose(){
      disposed=true;
      if(animationFrame)cancelAnimationFrame(animationFrame);
      root.parent?.remove(root);
      portrait.geometry.dispose();material.dispose();texture.dispose();
      root.getObjectByName('TravisMichaelJacksonSand')?.geometry.dispose();
      root.getObjectByName('TravisMichaelJacksonSand')?.material.dispose();
    }
  };
  // Follow the original Travis face's shader uniforms. This avoids brittle
  // hooks into specific versions of the local Android render loop.
  // The existing face material drives build, dissolve and voice state.
  function followFace(now){
    if(disposed||!root.parent)return;
    const facialUniforms=head.material?.uniforms||{};
    avatar.update({
      time:now/1000,
      build:facialUniforms.uBuild?.value??1,
      dissolve:facialUniforms.uDissolve?.value??0,
      voice:facialUniforms.uState?.value??0,
      opacity:1
    });
    animationFrame=requestAnimationFrame(followFace);
  }
  animationFrame=requestAnimationFrame(followFace);
  return avatar;
}
