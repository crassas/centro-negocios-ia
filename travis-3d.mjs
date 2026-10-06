import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (s, r=document) => r.querySelector(s);
const hud = $('#travis-hud');
const launcher = $('#travis-launcher');
const closeButton = $('#travis-hud-close');
const canvas = $('#travis-three-canvas');
const statusMessage = $('#travis-status-message');
const statusState = $('#travis-status-state');
const loadingLabel = $('#travis-loading');
const clockEl = $('#travis-clock-time');
const dateEl = $('#travis-clock-date');

if (!hud || !launcher || !canvas) {
  console.warn('Travis 3D: interface em falta.');
} else {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stateCopy = {
    idle: ['Em repouso.', 'EM ESPERA'],
    booting: ['A materializar núcleo.', 'A INICIAR'],
    ready: ['Estou aqui.', 'PRONTO'],
    listening: ['A ouvir.', 'A OUVIR'],
    thinking: ['A processar.', 'A PENSAR'],
    speaking: ['A responder.', 'A FALAR']
  };

  let renderer;
  let scene;
  let camera;
  let composer;
  let bloom;
  let pmrem;
  let model;
  let coreRoot;
  let energyMesh;
  let glassMesh;
  let emblem;
  let rotors = [];
  let dust;
  let floorHalo;
  let beamTop;
  let beamBottom;
  let commandRoot;
  let commandNodes = [];
  let commandLines = [];
  let coreHit;
  let ready = false;
  let opened = false;
  let commandsOpen = false;
  let state = 'idle';
  let startTime = performance.now();
  let lastFrame = performance.now();
  let intro = 0;
  let commandAmount = 0;
  let commandTarget = 0;
  let hoverNode = null;
  let pointerDown = null;
  let audioContext = null;
  let cameraTarget = new THREE.Vector2();
  let cameraNow = new THREE.Vector2();
  let tiltTarget = new THREE.Vector2();
  let tiltNow = new THREE.Vector2();
  let resizeTimer = 0;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const clamp = THREE.MathUtils.clamp;
  const lerp = THREE.MathUtils.lerp;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t,0,1), 3);
  }

  function smooth01(t) {
    t = clamp(t,0,1);
    return t*t*(3-2*t);
  }

  function setState(next='ready', message='') {
    state = next;
    hud.dataset.state = next;
    const [copy,label] = stateCopy[next] || stateCopy.ready;
    if (statusMessage) statusMessage.textContent = message || copy;
    if (statusState) statusState.textContent = label;
  }

  function updateClock() {
    const now = new Date();
    if (clockEl) clockEl.textContent = new Intl.DateTimeFormat('pt-PT',{
      hour:'2-digit',minute:'2-digit',hour12:false
    }).format(now);
    if (dateEl) dateEl.textContent = new Intl.DateTimeFormat('pt-PT',{
      weekday:'short',day:'2-digit',month:'short'
    }).format(now).replaceAll('.','').toUpperCase();
  }

  function haptic(value=12) {
    try { navigator.vibrate?.(value); } catch {}
  }

  function audio() {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      return audioContext;
    } catch {
      return null;
    }
  }

  function pulseTone(opening=true) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + .01;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(opening ? 118 : 168, t);
    osc.frequency.exponentialRampToValueAtTime(opening ? 264 : 92, t + .16);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(.028,t+.018);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.18);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t+.19);
  }

  function bootSound() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + .015;

    const body = ac.createOscillator();
    const bodyGain = ac.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(45,t);
    body.frequency.exponentialRampToValueAtTime(72,t+.85);
    bodyGain.gain.setValueAtTime(.0001,t);
    bodyGain.gain.exponentialRampToValueAtTime(.055,t+.045);
    bodyGain.gain.exponentialRampToValueAtTime(.0001,t+.9);
    body.connect(bodyGain).connect(ac.destination);
    body.start(t); body.stop(t+.92);

    [0,.22,.45,.70].forEach((d,i)=>{
      const o=ac.createOscillator();
      const g=ac.createGain();
      o.type = i%2 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(86+i*24,t+d);
      o.frequency.exponentialRampToValueAtTime(154+i*35,t+d+.14);
      g.gain.setValueAtTime(.0001,t+d);
      g.gain.exponentialRampToValueAtTime(.026,t+d+.018);
      g.gain.exponentialRampToValueAtTime(.0001,t+d+.17);
      o.connect(g).connect(ac.destination);
      o.start(t+d); o.stop(t+d+.18);
    });
  }

  function radialTexture(inner='#bff8ff', outer='rgba(72,216,255,0)') {
    const c=document.createElement('canvas');
    c.width=c.height=256;
    const ctx=c.getContext('2d');
    const g=ctx.createRadialGradient(128,128,0,128,128,128);
    g.addColorStop(0,inner);
    g.addColorStop(.08,'rgba(104,235,255,.9)');
    g.addColorStop(.32,'rgba(36,165,255,.25)');
    g.addColorStop(1,outer);
    ctx.fillStyle=g;
    ctx.fillRect(0,0,256,256);
    const tex=new THREE.CanvasTexture(c);
    tex.colorSpace=THREE.SRGBColorSpace;
    return tex;
  }

  function labelTexture(title, subtitle='') {
    const c=document.createElement('canvas');
    c.width=512; c.height=160;
    const ctx=c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.font='700 44px Arial, sans-serif';
    ctx.fillStyle='#e7fbff';
    ctx.shadowColor='rgba(90,225,255,.65)';
    ctx.shadowBlur=16;
    ctx.fillText(title,256,72);
    ctx.shadowBlur=0;
    if (subtitle) {
      ctx.font='500 20px Arial, sans-serif';
      ctx.fillStyle='rgba(132,188,211,.9)';
      ctx.fillText(subtitle,256,119);
    }
    const tex=new THREE.CanvasTexture(c);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.minFilter=THREE.LinearFilter;
    return tex;
  }

  function iconTexture(kind) {
    const c=document.createElement('canvas');
    c.width=c.height=192;
    const ctx=c.getContext('2d');
    ctx.strokeStyle='#bdf5ff';
    ctx.lineWidth=7;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.shadowColor='rgba(84,220,255,.7)';
    ctx.shadowBlur=12;

    if (kind==='centre') {
      [[45,45],[105,45],[45,105],[105,105]].forEach(([x,y])=>ctx.strokeRect(x,y,42,42));
    } else if (kind==='projects') {
      ctx.beginPath();
      ctx.moveTo(35,60);ctx.lineTo(75,60);ctx.lineTo(88,76);ctx.lineTo(157,76);
      ctx.lineTo(157,140);ctx.lineTo(35,140);ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.moveTo(62,100);ctx.lineTo(132,100);ctx.moveTo(62,120);ctx.lineTo(115,120);ctx.stroke();
    } else if (kind==='seo') {
      ctx.beginPath();ctx.arc(83,82,45,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(116,116);ctx.lineTo(158,158);ctx.stroke();
    } else {
      ctx.strokeRect(55,36,82,118);
      ctx.beginPath();ctx.moveTo(36,79);ctx.lineTo(36,114);ctx.moveTo(156,79);ctx.lineTo(156,114);ctx.stroke();
    }
    const tex=new THREE.CanvasTexture(c);
    tex.colorSpace=THREE.SRGBColorSpace;
    return tex;
  }

  function createAtmosphere() {
    const dustCount = innerWidth < 700 ? 240 : 420;
    const pos=new Float32Array(dustCount*3);
    for(let i=0;i<dustCount;i++){
      pos[i*3]=(Math.random()-.5)*12;
      pos[i*3+1]=(Math.random()-.5)*9;
      pos[i*3+2]=(Math.random()-.5)*7-1.5;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({
      color:0x70ddff,size:innerWidth<700?.018:.022,transparent:true,opacity:.32,
      blending:THREE.AdditiveBlending,depthWrite:false
    });
    dust=new THREE.Points(geo,mat);
    scene.add(dust);

    const beamMat=new THREE.MeshBasicMaterial({
      color:0x48cfff,transparent:true,opacity:.025,
      blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide
    });
    beamTop=new THREE.Mesh(new THREE.ConeGeometry(2.8,8.2,48,1,true),beamMat.clone());
    beamTop.position.set(0,4.4,-1.6);
    scene.add(beamTop);

    beamBottom=new THREE.Mesh(new THREE.ConeGeometry(2.4,6.8,48,1,true),beamMat.clone());
    beamBottom.rotation.z=Math.PI;
    beamBottom.position.set(0,-4.3,-1.8);
    scene.add(beamBottom);

    const haloMat=new THREE.MeshBasicMaterial({
      color:0x36cfff,transparent:true,opacity:.07,
      blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide
    });
    floorHalo=new THREE.Mesh(new THREE.RingGeometry(1.55,3.6,128),haloMat);
    floorHalo.rotation.x=1.18;
    floorHalo.position.set(0,-2.35,-1.15);
    scene.add(floorHalo);

    const glow=new THREE.Sprite(new THREE.SpriteMaterial({
      map:radialTexture(),transparent:true,opacity:.12,
      blending:THREE.AdditiveBlending,depthWrite:false
    }));
    glow.scale.set(7.5,7.5,1);
    glow.position.set(0,.2,-1.8);
    scene.add(glow);
  }

  function createLights() {
    scene.add(new THREE.HemisphereLight(0x86dfff,0x020508,.28));

    const cyan=new THREE.PointLight(0x38cfff,5.5,12,2);
    cyan.position.set(-3.5,2.4,4.2);
    scene.add(cyan);

    const red=new THREE.PointLight(0xff3159,2.8,10,2);
    red.position.set(3.4,-1.5,3.1);
    scene.add(red);

    const rim=new THREE.PointLight(0xdafcff,3.5,9,2);
    rim.position.set(0,3.5,2.5);
    scene.add(rim);
  }

  function materialTune(obj) {
    if (!obj.isMesh || !obj.material) return;
    const name=obj.material.name || '';
    obj.frustumCulled=true;

    if (name==='MetalDark' || name==='MetalGraphite') {
      obj.material.envMapIntensity=1.18;
      obj.material.metalness=Math.max(.62,obj.material.metalness ?? .72);
      obj.material.roughness=Math.max(.28,obj.material.roughness ?? .3);
    }
    if (name.includes('EmissiveCyan') || name.includes('EmissiveIce')) {
      obj.material.emissiveIntensity=name.includes('Ice')?1.65:1.2;
      obj.material.toneMapped=false;
    }
    if (name.includes('EmissiveRed')) {
      obj.material.emissiveIntensity=1.35;
      obj.material.toneMapped=false;
    }
    if (name.includes('EmissiveWhite')) {
      obj.material.emissiveIntensity=1.8;
      obj.material.toneMapped=false;
    }
    if (name==='CoreEnergy') {
      obj.material.emissiveIntensity=1.55;
      obj.material.toneMapped=false;
      energyMesh=obj;
    }
    if (name==='CoreGlass') {
      const glass=new THREE.MeshPhysicalMaterial({
        color:0x061722,metalness:.18,roughness:.06,
        transmission:.38,thickness:.42,ior:1.46,
        transparent:true,opacity:.52,envMapIntensity:1.1,
        clearcoat:1,clearcoatRoughness:.08
      });
      obj.material=glass;
      glassMesh=obj;
    }
    if (obj.name==='Emblem') emblem=obj;
  }

  function createCommandNode({label,panel,icon:iconKey,color=0x58ddff}) {
    const group=new THREE.Group();
    group.userData.panel=panel;

    const plateMat=new THREE.MeshPhysicalMaterial({
      color:0x06131d,metalness:.62,roughness:.28,clearcoat:.7,
      clearcoatRoughness:.16,envMapIntensity:.9,
      transparent:true,opacity:.72
    });
    const plate=new THREE.Mesh(new THREE.BoxGeometry(1.35,.52,.065),plateMat);
    group.add(plate);

    const edges=new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.38,.55,.072)),
      new THREE.LineBasicMaterial({
        color,transparent:true,opacity:.42,blending:THREE.AdditiveBlending
      })
    );
    group.add(edges);

    const accent=new THREE.Mesh(
      new THREE.PlaneGeometry(.055,.36),
      new THREE.MeshBasicMaterial({
        color,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,
        depthWrite:false
      })
    );
    accent.position.set(-.59,0,.038);
    group.add(accent);

    const icon=new THREE.Sprite(new THREE.SpriteMaterial({
      map:iconTexture(iconKey),transparent:true,depthWrite:false
    }));
    icon.scale.set(.26,.26,1);
    icon.position.set(-.36,.01,.06);
    group.add(icon);

    const labelSprite=new THREE.Sprite(new THREE.SpriteMaterial({
      map:labelTexture(label),transparent:true,depthWrite:false
    }));
    labelSprite.scale.set(.78,.25,1);
    labelSprite.position.set(.22,-.005,.06);
    group.add(labelSprite);

    const hit=new THREE.Mesh(
      new THREE.BoxGeometry(1.5,.68,.16),
      new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false})
    );
    hit.position.z=.07;
    hit.userData.panel=panel;
    hit.userData.node=group;
    group.add(hit);

    group.scale.setScalar(.001);
    commandRoot.add(group);
    commandNodes.push({group,hit,edge:edges,target:new THREE.Vector3()});
    return group;
  }

  function createCommands() {
    commandRoot=new THREE.Group();
    commandRoot.position.y=.35;
    scene.add(commandRoot);

    createCommandNode({label:'CENTRO',panel:'visao',icon:'centre'});
    createCommandNode({label:'PROJECTOS',panel:'crm',icon:'projects'});
    createCommandNode({label:'SEO',panel:'seo',icon:'seo',color:0x75eaff});
    createCommandNode({label:'AGENTES',panel:'agentes',icon:'agents',color:0xff4668});

    commandLines=commandNodes.map((node)=>{
      const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
      const mat=new THREE.LineBasicMaterial({
        color:node.group.userData.panel==='agentes'?0xff4668:0x5fe2ff,
        transparent:true,opacity:0,blending:THREE.AdditiveBlending
      });
      const line=new THREE.Line(geo,mat);
      commandRoot.add(line);
      return line;
    });
    layoutCommands();
  }

  function layoutCommands() {
    if (!commandNodes.length) return;
    const portrait=innerWidth/innerHeight < .72;
    const positions=portrait
      ? [
          [-1.72,.95,.5],
          [1.72,.95,.5],
          [-1.68,-1.18,.38],
          [1.68,-1.18,.38]
        ]
      : [
          [-3.0,1.2,.45],
          [3.0,1.2,.45],
          [-2.5,-1.65,.35],
          [2.5,-1.65,.35]
        ];
    commandNodes.forEach((n,i)=>n.target.set(...positions[i]));
  }

  function updateCommandLines() {
    commandNodes.forEach((node,i)=>{
      const arr=commandLines[i].geometry.attributes.position.array;
      arr[0]=0;arr[1]=0;arr[2]=-.2;
      arr[3]=node.group.position.x*.84;
      arr[4]=node.group.position.y*.84;
      arr[5]=node.group.position.z-.1;
      commandLines[i].geometry.attributes.position.needsUpdate=true;
      commandLines[i].material.opacity=.22*commandAmount;
    });
  }

  function createCoreHit() {
    coreHit=new THREE.Mesh(
      new THREE.SphereGeometry(1.08,24,14),
      new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false})
    );
    coreHit.userData.core=true;
    coreRoot.add(coreHit);
  }

  function sizeForViewport() {
    const portrait=innerWidth/innerHeight < .72;
    if (portrait) {
      camera.fov=40;
      camera.position.z=10.4;
      coreRoot.scale.setScalar(.47);
      coreRoot.position.y=.62;
    } else {
      camera.fov=34;
      camera.position.z=8.3;
      coreRoot.scale.setScalar(.70);
      coreRoot.position.y=.35;
    }
    if (commandRoot) commandRoot.position.y=coreRoot.position.y;
    camera.updateProjectionMatrix();
    layoutCommands();
  }

  function resize() {
    if (!renderer || !camera) return;
    const w=Math.max(1,innerWidth);
    const h=Math.max(1,innerHeight);
    const dpr=Math.min(devicePixelRatio||1,innerWidth<700?1.35:1.65);
    camera.aspect=w/h;
    sizeForViewport();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w,h,false);
    composer.setPixelRatio(dpr);
    composer.setSize(w,h);
  }

  function setLoading(text,done=false) {
    if (!loadingLabel) return;
    loadingLabel.textContent=text;
    loadingLabel.classList.toggle('is-done',done);
  }

  async function init3D() {
    setLoading('A preparar núcleo 3D…');
    renderer=new THREE.WebGLRenderer({
      canvas,alpha:false,antialias:false,powerPreference:'high-performance'
    });
    renderer.setClearColor(0x02070b,1);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=.78;

    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x02070b);
    scene.fog=new THREE.FogExp2(0x02070b,.045);

    camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,60);
    camera.position.set(0,.3,9);
    camera.lookAt(0,.2,0);

    pmrem=new THREE.PMREMGenerator(renderer);
    const env=new RoomEnvironment();
    scene.environment=pmrem.fromScene(env,.04).texture;
    env.dispose();

    createLights();
    createAtmosphere();

    composer=new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene,camera));
    bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.55,.42,.62);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    setLoading('A carregar geometria…');
    const loader=new GLTFLoader();
    const gltf=await loader.loadAsync('./assets/travis/travis-core.glb?v=1');

    coreRoot=new THREE.Group();
    model=gltf.scene;
    model.traverse((obj)=>{
      materialTune(obj);
      if (/^Rotor_\d+$/.test(obj.name) || obj.name==='Rotor_Ticks') rotors.push(obj);
      if (obj.name==='Emblem') emblem=obj;
    });
    coreRoot.add(model);
    scene.add(coreRoot);
    createCoreHit();
    createCommands();

    sizeForViewport();
    resize();
    setLoading('NÚCLEO 3D PRONTO',true);
    ready=true;
  }

  function stateBloom() {
    if (state==='booting') return .72;
    if (state==='listening') return .68;
    if (state==='thinking') return .82;
    if (state==='speaking') return .92;
    return .55;
  }

  function animate(now) {
    requestAnimationFrame(animate);
    if (!renderer || !composer) return;
    if (!opened) { lastFrame=now; return; }
    const dt=Math.min(.05,(now-lastFrame)/1000);
    lastFrame=now;

    const t=(now-startTime)/1000;
    if (opened) intro=Math.min(1,intro+dt*1.05);
    else intro=Math.max(0,intro-dt*2.4);
    const introEase=easeOutCubic(intro);

    cameraNow.lerp(cameraTarget,.055);
    tiltNow.lerp(tiltTarget,.05);

    if (coreRoot) {
      const baseScale=(innerWidth/innerHeight<.72?.47:.70)*(.35+.65*introEase);
      coreRoot.scale.setScalar(baseScale);
      coreRoot.rotation.x=lerp(-.24,-.08,introEase)+tiltNow.y*.035;
      coreRoot.rotation.y=tiltNow.x*.055;
      coreRoot.rotation.z=Math.sin(t*.12)*.01;

      const baseY=innerWidth/innerHeight<.72?.62:.35;
      coreRoot.position.y=baseY + (1-introEase)*-.55;
      coreRoot.position.x=cameraNow.x*.08;

      rotors.forEach((r,i)=>{
        const direction=i%2?1:-1;
        const speed=(.055+i*.017)*(state==='thinking'?1.85:state==='speaking'?1.45:1);
        r.rotation.z += direction*speed*dt;
      });

      if (energyMesh) {
        const pulse=1+Math.sin(t*2.5)*(state==='speaking'?.065:.025);
        energyMesh.scale.setScalar(pulse);
      }
      if (emblem) {
        emblem.position.z=Math.sin(t*1.7)*.015;
      }
    }

    commandTarget=commandsOpen?1:0;
    commandAmount += (commandTarget-commandAmount)*Math.min(1,dt*7.5);
    const ca=smooth01(commandAmount);
    commandNodes.forEach((node,i)=>{
      node.group.position.lerpVectors(new THREE.Vector3(0,.05,.2),node.target,ca);
      const s=Math.max(.001,ca*(innerWidth<700?.78:.92));
      node.group.scale.setScalar(s*(node.group===hoverNode?1.08:1));
      node.edge.material.opacity=.18+.42*ca;
    });
    if (commandRoot) commandRoot.visible=commandAmount>.01;
    updateCommandLines();

    if (dust) {
      dust.rotation.z=t*.006;
      dust.position.y=Math.sin(t*.18)*.08;
    }
    if (floorHalo) {
      floorHalo.material.opacity=.09+.04*Math.sin(t*1.1);
      floorHalo.rotation.z=t*.035;
    }
    if (beamTop) beamTop.material.opacity=.018+.012*(.5+.5*Math.sin(t*.7));
    if (beamBottom) beamBottom.material.opacity=.012+.008*(.5+.5*Math.sin(t*.6+1));

    if (bloom) bloom.strength += (stateBloom()-bloom.strength)*.055;

    const portrait=innerWidth/innerHeight<.72;
    const cameraBaseZ=portrait?10.4:8.3;
    camera.position.x += ((cameraNow.x*(portrait?.18:.28))-camera.position.x)*.06;
    camera.position.y += ((portrait?.22:.28)+cameraNow.y*.16-camera.position.y)*.06;
    camera.position.z += (cameraBaseZ-camera.position.z)*.08;
    camera.lookAt(0,portrait?.48:.26,0);

    composer.render();
  }

  function rayFromEvent(event) {
    const rect=canvas.getBoundingClientRect();
    pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
  }

  function interactiveObjects() {
    const nodes=commandsOpen?commandNodes.map(n=>n.hit):[];
    return [...nodes,coreHit].filter(Boolean);
  }

  function onPointerMove(event) {
    if (!opened || !ready) return;
    const nx=(event.clientX/innerWidth-.5)*2;
    const ny=(event.clientY/innerHeight-.5)*2;
    cameraTarget.set(clamp(nx,-1,1),clamp(-ny,-1,1));

    rayFromEvent(event);
    const hit=raycaster.intersectObjects(interactiveObjects(),true)[0];
    const next=hit?.object?.userData?.node || null;
    hoverNode=next;
    canvas.style.cursor=hit?'pointer':'default';
  }

  function onPointerDown(event) {
    pointerDown={x:event.clientX,y:event.clientY,time:performance.now()};
  }

  function onPointerUp(event) {
    if (!opened || !ready || !pointerDown) return;
    const moved=Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y);
    const elapsed=performance.now()-pointerDown.time;
    pointerDown=null;
    if (moved>18 || elapsed>700) return;

    rayFromEvent(event);
    const hit=raycaster.intersectObjects(interactiveObjects(),true)[0];
    if (!hit) return;
    const panel=hit.object.userData?.panel;
    if (panel) {
      haptic(12);
      pulseTone(false);
      closeHud();
      document.querySelector('[data-panel-target="'+panel+'"]')?.click();
      return;
    }
    if (hit.object.userData?.core) toggleCommands();
  }

  function toggleCommands(force) {
    if (!ready) return;
    commandsOpen=typeof force==='boolean'?force:!commandsOpen;
    hud.classList.toggle('commands-open',commandsOpen);
    setState('ready',commandsOpen?'Escolhe um módulo.':'Estou aqui.');
    haptic(commandsOpen?18:10);
    pulseTone(commandsOpen);
  }

  function openHud() {
    opened=true;
    intro=0;
    commandsOpen=false;
    commandTarget=0;
    hud.classList.add('is-open');
    hud.classList.remove('commands-open');
    hud.setAttribute('aria-hidden','false');
    launcher.setAttribute('aria-expanded','true');
    document.body.classList.add('travis-hud-open');
    setState('booting');
    bootSound();
    haptic([10,35,10]);
    startTime=performance.now();

    setTimeout(()=>{
      if (opened) setState('ready');
    },ready?1550:2100);
  }

  function closeHud() {
    opened=false;
    commandsOpen=false;
    commandTarget=0;
    hud.classList.remove('commands-open','is-open');
    hud.setAttribute('aria-hidden','true');
    launcher.setAttribute('aria-expanded','false');
    document.body.classList.remove('travis-hud-open');
    setState('idle');
    cameraTarget.set(0,0);
    tiltTarget.set(0,0);
  }

  function onOrientation(event) {
    if (!opened || event.gamma==null || event.beta==null) return;
    tiltTarget.x=clamp(event.gamma/35,-1,1);
    tiltTarget.y=clamp((event.beta-45)/50,-1,1);
  }

  launcher.addEventListener('click',openHud);
  closeButton?.addEventListener('click',closeHud);
  canvas.addEventListener('pointermove',onPointerMove,{passive:true});
  canvas.addEventListener('pointerdown',onPointerDown,{passive:true});
  canvas.addEventListener('pointerup',onPointerUp,{passive:true});
  canvas.addEventListener('pointercancel',()=>{pointerDown=null},{passive:true});
  addEventListener('deviceorientation',onOrientation,{passive:true});
  addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(resize,80);
  },{passive:true});
  document.addEventListener('keydown',(event)=>{
    if (event.key==='Escape' && opened) closeHud();
  });

  setInterval(updateClock,30000);
  updateClock();

  window.TravisVisual=Object.freeze({
    open:openHud,
    close:closeHud,
    commands:toggleCommands,
    setState,
    ready(message='Estou aqui.') {
      if (!opened) openHud();
      setState('ready',message);
    },
    listen(message='A ouvir.') {
      if (!opened) openHud();
      setState('listening',message);
    },
    think(message='A processar.') {
      if (!opened) openHud();
      setState('thinking',message);
    },
    speak(message='A responder.') {
      if (!opened) openHud();
      setState('speaking',message);
    }
  });

  // Keeps existing Centro callbacks from opening a second/legacy Travis.
  window.TravisPanel={
    open:openHud,
    completeTask(id,text) {
      if (opened) setState('ready',text?'Tarefa concluída.':'Pronto.');
    }
  };

  init3D().catch((error)=>{
    console.error('Travis 3D:',error);
    setLoading('Falha ao carregar o núcleo 3D');
    setState('ready','Interface 3D indisponível.');
  });

  requestAnimationFrame(animate);
}