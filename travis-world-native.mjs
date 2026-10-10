/*
 * Travis Native Earth — 3D globe drawn by the existing Travis Three renderer.
 * Textures: three.js planet sample assets. No second WebGL canvas, iframe,
 * API token, new port, or subscription required for this mobile mode.
 *
 * Globe is a genuine rotating textured 3D sphere, NOT live satellite video.
 */
const PLACES=Object.freeze({
  earth:{lat:18,lon:-19},
  newyork:{lat:40.758,lon:-73.9855},
  porto:{lat:41.1496,lon:-8.6109},
  lisboa:{lat:38.7223,lon:-9.1393},
  london:{lat:51.5072,lon:-0.1276},
  paris:{lat:48.8566,lon:2.3522},
  tokyo:{lat:35.6762,lon:139.6503}
});
const DAY_IMAGE='./assets/travis/earth/earth-day-2048.jpg';
const CLOUD_IMAGE='./assets/travis/earth/earth-clouds-1024.png';
const RADIUS=2.0;
const DEG=Math.PI/180;
export function createTravisNativeEarth(THREE,canvas){
  const hud=document.getElementById('travis-hud');
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x010207);
  const camera=new THREE.PerspectiveCamera(36,1,0.1,150);
  scene.add(new THREE.AmbientLight(0x93a4bd,.42));
  const sun=new THREE.DirectionalLight(0xfff6e8,2.5);
  sun.position.set(-3.8,3.5,8);
  scene.add(sun);
  const edge=new THREE.DirectionalLight(0xb5cde9,.7);
  edge.position.set(3,-2,-5);
  scene.add(edge);

  const globe=new THREE.Group();
  scene.add(globe);
  const geo=new THREE.SphereGeometry(RADIUS,80,56);
  const surfaceMat=new THREE.MeshStandardMaterial({
    color:0x9bb2bb,roughness:1,metalness:0
  });
  const earth=new THREE.Mesh(geo,surfaceMat);
  globe.add(earth);

  const cloudsMat=new THREE.MeshBasicMaterial({
    color:0xf0f0e9,transparent:true,opacity:.17,
    depthWrite:false,blending:THREE.NormalBlending
  });
  const clouds=new THREE.Mesh(new THREE.SphereGeometry(RADIUS*1.006,64,40),cloudsMat);
  globe.add(clouds);
  const atmosphere=new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS*1.026,64,40),
    new THREE.ShaderMaterial({
      uniforms:{uColor:{value:new THREE.Color(0xb7ad9c)}},
      transparent:true,depthWrite:false,side:THREE.FrontSide,
      vertexShader:[
        'varying vec3 vNormal;',
        'varying vec3 vViewPosition;',
        'void main(){',
        'vec4 mvPosition=modelViewMatrix*vec4(position,1.0);',
        'vNormal=normalize(normalMatrix*normal);',
        'vViewPosition=-mvPosition.xyz;',
        'gl_Position=projectionMatrix*mvPosition;',
        '}'
      ].join('\n'),
      fragmentShader:[
        'uniform vec3 uColor;',
        'varying vec3 vNormal;',
        'varying vec3 vViewPosition;',
        'void main(){',
        'float facing=abs(dot(normalize(vNormal),normalize(vViewPosition)));',
        'float rim=pow(1.0-clamp(facing,0.0,1.0),3.2);',
        'gl_FragColor=vec4(uColor,clamp(rim*.42,0.0,.40));',
        '}'
      ].join('\n')
    })
  );
  globe.add(atmosphere);

  // Location pin anchored to the selected location on the actual sphere.
  const pin=new THREE.Group();
  const dot=new THREE.Mesh(
    new THREE.SphereGeometry(.030,12,10),
    new THREE.MeshBasicMaterial({color:0xffe7b9,depthTest:true})
  );
  pin.add(dot);
  const ring=new THREE.Mesh(
    new THREE.RingGeometry(.069,.080,36),
    new THREE.MeshBasicMaterial({color:0xefc58e,transparent:true,opacity:.86,side:THREE.DoubleSide,depthWrite:false})
  );
  pin.add(ring);
  globe.add(pin);
  pin.visible=false;

  // Observed USGS seismic locations. One instanced draw call for up to 95 dots.
  const quakeMaterial=new THREE.MeshBasicMaterial({color:0xe6a36c});
  const quakeDots=new THREE.InstancedMesh(
    new THREE.SphereGeometry(.034,8,6),quakeMaterial,95
  );
  quakeDots.count=0;
  quakeDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  quakeDots.frustumCulled=false;
  globe.add(quakeDots);

  // ISS public geodetic position, NOT live orbital video or guessed path.
  const issMarker=new THREE.Mesh(
    new THREE.SphereGeometry(.057,10,9),
    new THREE.MeshBasicMaterial({color:0xffe3a5})
  );
  issMarker.visible=false;
  globe.add(issMarker);
  let visibleQuakes=0;
  let issPosition=null;
  let enabledLayers=new Set(['earthquakes','iss','weather']);
  const scratch=new THREE.Object3D();
  function geoSurface(lat,lon,height=1.014){
    const clat=Math.cos(lat*DEG),phi=(180+lon)*DEG;
    const nx=-Math.cos(phi)*clat,ny=Math.sin(lat*DEG),nz=Math.sin(phi)*clat;
    return new THREE.Vector3(nx,ny,nz).multiplyScalar(RADIUS*height);
  }
  function setData(data){
    const quakes=data?.earthquakes?.earthquakes||[];
    visibleQuakes=Math.min(95,quakes.length);
    for(let i=0;i<visibleQuakes;i++){
      const q=quakes[i];
      scratch.position.copy(geoSurface(q.lat,q.lon,1.017));
      scratch.rotation.set(0,0,0);
      const radius=.75+Math.max(0,Math.min(8,q.mag))*.13;
      scratch.scale.setScalar(radius);
      scratch.updateMatrix();
      quakeDots.setMatrixAt(i,scratch.matrix);
    }
    quakeDots.count=visibleQuakes;
    quakeDots.instanceMatrix.needsUpdate=true;
    issPosition=data?.iss&&Number.isFinite(data.iss.lat)&&Number.isFinite(data.iss.lon)
      ?data.iss:null;
    if(issPosition){
      issMarker.position.copy(geoSurface(issPosition.lat,issPosition.lon,
        1+Math.max(0,Math.min(600,issPosition.altKm||0))/6371));
    }
    quakeDots.visible=enabledLayers.has('earthquakes')&&visibleQuakes>0;
    issMarker.visible=enabledLayers.has('iss')&&Boolean(issPosition);
  }
  window.addEventListener('travis:world-data',e=>setData(e.detail));
  window.addEventListener('travis:world-layers',e=>{
    enabledLayers=new Set(e.detail?.layers||[]);
    quakeDots.visible=enabledLayers.has('earthquakes')&&visibleQuakes>0;
    issMarker.visible=enabledLayers.has('iss')&&Boolean(issPosition);
  });

  // Original God's Eye View public CCTV catalogue: one draw call for all
  // public camera locations. These are location markers, not live-status pins.
  const cctvMaterial=new THREE.PointsMaterial({
    size:.064,sizeAttenuation:true,vertexColors:true,
    transparent:true,opacity:.94,depthWrite:false,depthTest:true
  });
  const cctvMarkers=new THREE.Points(new THREE.BufferGeometry(),cctvMaterial);
  cctvMarkers.visible=false;
  cctvMarkers.frustumCulled=false;
  globe.add(cctvMarkers);
  let cctvRecords=[];
  const cctvRaycaster=new THREE.Raycaster();
  cctvRaycaster.params.Points.threshold=.10;
  const cctvNdc=new THREE.Vector2();
  function setCctvCatalog(rows){
    const filtered=(Array.isArray(rows)?rows:[]).filter(item=>
      typeof item.id==='string'&&Number.isFinite(item.lat)&&Number.isFinite(item.lon)
      &&Math.abs(item.lat)<=90&&Math.abs(item.lon)<=180).slice(0,5000);
    const positions=new Float32Array(filtered.length*3);
    const colors=new Float32Array(filtered.length*3);
    for(let i=0;i<filtered.length;i++){
      const item=filtered[i];
      const pos=geoSurface(item.lat,item.lon,1.020);
      positions[i*3]=pos.x;positions[i*3+1]=pos.y;positions[i*3+2]=pos.z;
      const isVideo=item.feedType==='hls';
      colors[i*3]=isVideo?1:.93;
      colors[i*3+1]=isVideo?.73:.81;
      colors[i*3+2]=isVideo?.37:.63;
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    cctvMarkers.geometry.dispose();
    cctvMarkers.geometry=geometry;
    cctvRecords=filtered;
    cctvMarkers.visible=filtered.length>0;
  }
  window.addEventListener('travis:cctv-catalog',()=>{
    const data=window.TravisCctv?.locations?.()||[];
    if(data.length)setCctvCatalog(data);
  });
  if(window.TravisCctv?.locations?.()?.length)
    setCctvCatalog(window.TravisCctv.locations());
  function selectCameraAtPoint(event){
    if(!cctvRecords.length||!window.TravisWorld?.status?.()?.cameraPins)return false;
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return false;
    cctvNdc.set((event.clientX-rect.left)/rect.width*2-1,
      -((event.clientY-rect.top)/rect.height*2-1));
    scene.updateMatrixWorld(true);
    cctvRaycaster.setFromCamera(cctvNdc,camera);
    const hits=cctvRaycaster.intersectObject(cctvMarkers,false);
    if(!hits.length)return false;
    const earthHit=cctvRaycaster.intersectObject(earth,false)[0];
    const point=hits.find(hit=>!earthHit||hit.distance<=earthHit.distance+.13);
    if(!point)return false;
    const item=cctvRecords[point.index];
    if(!item)return false;
    window.dispatchEvent(new CustomEvent('travis:cctv-select',{
      detail:{id:item.id,provider:item.provider,
        name:item.name,feedType:item.feedType}
    }));
    return true;
  }

  // Very light starfield. Deterministic, no animated heavy textures.
  const stars=[];
  let seed=20931;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<200;i++){
    const a=random()*Math.PI*2;
    const y=(random()-.5)*15;
    const r=9+random()*13;
    stars.push(Math.cos(a)*r,y,-13-random()*11);
  }
  const starGeo=new THREE.BufferGeometry();
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));
  scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({
    color:0xe6dac6,size:.024,sizeAttenuation:true,transparent:true,opacity:.8,
    depthWrite:false
  })));

  const qAim=new THREE.Quaternion();
  const qX=new THREE.Quaternion();
  const qY=new THREE.Quaternion();
  const xAxis=new THREE.Vector3(1,0,0);
  const yAxis=new THREE.Vector3(0,1,0);
  let place=null;
  let dragYaw=0,dragPitch=0;
  let lastTime=0,lastW=0,lastH=0;
  let distance=8;
  let userScale=1;
  let hasDayTexture=false;
  let startSignalled=false;
  let error=null;

  function notify(type,detail={}){
    window.dispatchEvent(new CustomEvent('travis:world-native-'+type,{detail}));
  }
  function targetPin(lat,lon){
    const clat=Math.cos(lat*DEG);
    const phi=(180+lon)*DEG;
    const nx=-Math.cos(phi)*clat;
    const ny=Math.sin(lat*DEG);
    const nz=Math.sin(phi)*clat;
    const normal=new THREE.Vector3(nx,ny,nz);
    pin.position.copy(normal).multiplyScalar(RADIUS*1.019);
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
    pin.visible=true;
  }
  function setPlace(next='earth'){
    if(!(next in PLACES))next='earth';
    if(place===next)return;
    place=next;
    dragYaw=0;dragPitch=0;userScale=1;
    const coord=PLACES[place];
    pin.visible=place!=='earth';
    if(pin.visible)targetPin(coord.lat,coord.lon);
    notify('location',{place});
  }
  function aim(){
    const p=PLACES[place]||PLACES.earth;
    const x=(p.lat+dragPitch)*DEG;
    const y=(-90-p.lon+dragYaw)*DEG;
    // Aim geographic lat/lon toward the actual forward-facing camera.
    qX.setFromAxisAngle(xAxis,x);
    qY.setFromAxisAngle(yAxis,y);
    qAim.copy(qX).multiply(qY);
    return qAim;
  }
  function resize(renderer,w,h){
    lastW=w;lastH=h;
    const aspect=w/h;
    camera.aspect=aspect;
    camera.updateProjectionMatrix();
    // Entire globe visible on a narrow upright handset as well as desktop.
    distance=Math.max(8.15,RADIUS/(Math.tan(18*DEG)*Math.max(.36,aspect)*.78));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.35));
    renderer.setSize(w,h,false);
  }
  function render(renderer,now,w,h){
    try{
      if(w!==lastW||h!==lastH)resize(renderer,w,h);
      if(!place)setPlace('earth');
      const delta=lastTime?Math.min((now-lastTime)/1000,.05):.016;
      lastTime=now;
      const target=aim();
      globe.quaternion.slerp(target,1-Math.exp(-delta*3.9));
      clouds.rotation.y+=delta*.002;
      // Only the overview turns slowly. City views remain centered.
      if(place==='earth' && Math.abs(dragYaw)<.01)dragYaw+=delta*.17;
      camera.position.set(0,0,distance*userScale);
      camera.lookAt(0,0,0);
      ring.scale.setScalar(1+Math.sin(now*.003)*.14);
      cctvMarkers.visible=Boolean(window.TravisWorld?.status?.()?.cameraPins)&&cctvRecords.length>0;
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.render(scene,camera);
      if(!startSignalled){startSignalled=true;notify('ready',{texture:hasDayTexture});}
    }catch(e){
      const next=String(e?.message||e);
      if(error!==next){error=next;notify('error',{message:next});}
    }
  }
  const loader=new THREE.TextureLoader();
  loader.load(DAY_IMAGE,t=>{
    t.colorSpace=THREE.SRGBColorSpace;
    t.anisotropy=2;
    surfaceMat.color.set(0xffffff);
    surfaceMat.map=t;
    surfaceMat.needsUpdate=true;
    hasDayTexture=true;
    notify('ready',{texture:true});
  },undefined,e=>{
    notify('error',{message:'A textura terrestre não carregou; globo básico disponível.'});
  });
  loader.load(CLOUD_IMAGE,t=>{
    t.colorSpace=THREE.SRGBColorSpace;
    cloudsMat.map=t;
    cloudsMat.needsUpdate=true;
  },undefined,()=>{
    clouds.visible=false;
  });

  // Capture canvas gestures before the Travis face hit-test handlers.
  const pointers=new Map();
  let lastPinch=0;
  const inWorld=()=>hud?.dataset.world==='open';
  function pointerDown(e){
    if(!inWorld())return;
    e.stopImmediatePropagation();e.preventDefault();
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,at:performance.now()});
    try{canvas.setPointerCapture(e.pointerId);}catch{}
  }
  function pointerMove(e){
    if(!inWorld())return;
    if(pointers.has(e.pointerId)){
      const previous=pointers.get(e.pointerId);
      const dx=e.clientX-previous.x;
      const dy=e.clientY-previous.y;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===1){
        dragYaw+=dx*.22;
        dragPitch=Math.max(-68,Math.min(68,dragPitch+dy*.20));
      }
      if(pointers.size>1){
        const p=[...pointers.values()];
        const pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
        if(lastPinch>1&&pinch>1)userScale=Math.max(.61,Math.min(2.3,userScale*lastPinch/pinch));
        lastPinch=pinch;
      }
    }
    e.stopImmediatePropagation();e.preventDefault();
  }
  function pointerUp(e){
    if(!inWorld())return;
    const start=pointers.get(e.pointerId);
    const isTap=start && pointers.size===1 && e.type==='pointerup'
      && performance.now()-start.at<800
      && Math.hypot(e.clientX-start.startX,e.clientY-start.startY)<12;
    pointers.delete(e.pointerId);
    if(pointers.size<2)lastPinch=0;
    if(isTap)selectCameraAtPoint(e);
    e.stopImmediatePropagation();e.preventDefault();
  }
  function wheel(e){
    if(!inWorld())return;
    userScale=Math.max(.61,Math.min(2.3,userScale*Math.exp(e.deltaY*.0008)));
    e.stopImmediatePropagation();e.preventDefault();
  }
  for(const name of ['pointerdown','pointermove','pointerup','pointercancel']){
    const handler=name==='pointerdown'?pointerDown:name==='pointermove'?pointerMove:pointerUp;
    canvas.addEventListener(name,handler,{capture:true,passive:false});
  }
  canvas.addEventListener('wheel',wheel,{capture:true,passive:false});

  return {
    render,setPlace,setData,setCctvCatalog,
    status(){return {place,hasDayTexture,distance,scale:userScale,error,
      observedQuakes:visibleQuakes,issPosition,cctvPins:cctvRecords.length};},
    resetRenderSize(){lastW=lastH=0;}
  };
}
