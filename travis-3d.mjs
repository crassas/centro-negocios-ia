import {createMotionAudio} from './travis-motion-audio.mjs?v=motion-1';
import { createConceptProjection } from './travis-concept-projection.mjs?v=real-3d-1';
import './travis-action-cards.mjs?v=real-3d-1';
import { createVoiceInput } from './travis-voice-input.mjs?v=stt-fast-1';
import { automaticTravisForm, nextFormBlend, MANUAL_PREVIEW_MS, visibleProjectionAmount } from './travis-form-director.mjs?v=motion-1';
import { INTERFACE_COPY, interfaceLanguage, applyInterfaceLanguage, languageFromInterfaceCommand } from './travis-interface-language.mjs?v=1';
import { resolveWakePhrase } from './travis-wake-phrase.mjs?v=pt-1';
import { createTravisVision } from './travis-vision.mjs?v=scene-1';
import { buildSpeechEnvelope, speechEnvelopeLevel } from './travis-audio-sync.mjs?v=1';
import { sceneSignature } from './travis-scene-tracker.mjs?v=1';
import { cameraCommand } from './travis-vision-policy.mjs?v=objects-1';
import { createHolographicHeadMaterial, createAssemblyParticles } from './travis-holographic-head.mjs?v=motion-1';
import { projectWebAnswer } from './travis-web-projection.mjs?v=agent-1';
import { createPresenceMotion, hologramPresentation } from './travis-presence.mjs?v=motion-1';
import { createSpeechFace } from './travis-speech-face.mjs?v=articulation-2';
import { createBacklight } from './travis-atmosphere.mjs?v=cinema-1';
import { createFaceRig } from './travis-face-rig.mjs?v=articulation-2';
import * as THREE from 'three';
import { createNeuralField } from './travis-brain-view.mjs?v=motion-1';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
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
  console.warn('Travis 3D: interface missing.');
} else {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const presenceMotion=createPresenceMotion({reducedMotion});
  let presencePose={};
  const visionLook={x:0,y:0};
  const stateCopy = {
    idle: ['Standing by.', 'STANDBY'],
    booting: ['Materializing core.', 'BOOTING'],
    ready: ['I’m here.', 'READY'],
    listening: ['Listening.', 'LISTENING'],
    thinking: ['Processing.', 'THINKING'],
    speaking: ['Responding.', 'SPEAKING']
  };

  let renderer;
  let scene;
  let camera;
  let bloomComposer;
  let finalComposer;
  let bloomPass;
  let finalPass;
  let pmrem;
  let model;
  let coreRoot;
  let faceRoot;
  let assemblyParticles=null;
  let neuralField=null,conceptProjection=null,pendingConcept=null,pendingSubject='';
  window.addEventListener('travis:illustration',event=>{
    pendingConcept=event.detail?.scene||null;pendingSubject=event.detail?.subject||'';
    if(pendingConcept)conceptProjection?.show(pendingConcept,performance.now()/1000,pendingSubject,{reference:event.detail?.reference});
    else conceptProjection?.hide();
    if(pendingConcept)motionAudio.play('morph');
  });
  window.addEventListener('travis:visual-control',event=>{
    if(conceptProjection?.control?.(event.detail?.action))motionAudio.play('control');
  });
  window.addEventListener('travis:commands',event=>{
    if(event.detail?.open===false){conceptProjection?.returnToCore?.(performance.now()/1000);motionAudio.play('return');}
  });
  const holographicEyeMaterials=[];
  let faceHit;
  let faceEyeGroups=[];
  let realFaceModel=null;
  let realFaceHead=null;
  let faceRig=null;
  let speechFace=null,speechFacePromise=null,voiceFinishTimer=0,voiceOutputDelay=null;
  let speechClock=null,lastVisualPaint=0;
  let realFaceIris=[];
  let realFaceBaseMaterial=null;
  let realFaceReady=false;
  let avatarMaterial;
  let activeForm='core';
  let manualFormUntil=0,lastAutoFormCheck=0;
  const formBlend={core:1,face:0};
  const formTarget={core:1,face:0};
  let energyMesh;
  let glassMesh;
  let emblem;
  let rotors = [];
  let dust;
  let cinematicBacklight;
  let floorHalo;
  let beamTop;
  let beamBottom;
  let gridFloor;
  let orbitParticles;
  let filamentGroup;
  let hologramMaterial;
  let commandRoot;
  let commandNodes = [];
  let commandLines = [];
  let coreHit;
  let ready = false;
  let webglLost=false;
  let renderedFrames=0;
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
  let resizeTimer = 0;
  let externalVoiceLevel = null;
  let speechLevel = 0;
  let flashPower = 0;
  let glitchPower = 0;
  let nextGlitchAt = performance.now() + 4500;
  let stateChangedAt = performance.now();

  const IS_LOCAL_TRAVIS_UI=['127.0.0.1','localhost'].includes(location.hostname) && location.port==='8770';
  const LOCAL_TRAVIS_BASE=IS_LOCAL_TRAVIS_UI?location.origin:'http://127.0.0.1:8770';
  let voiceSession=0;
  const motionAudio=createMotionAudio({context:()=>audioContext,state:()=>({open:opened,listening:state==='listening'||voiceInput?.diagnostics().active||voiceRecorder?.state==='recording',paused:voicePaused,speaking:state==='speaking'||voiceBusy,reducedMotion})});
  window.addEventListener('travis:motion-sound',e=>motionAudio.setEnabled(e.detail?.enabled));
  window.addEventListener('travis:state',e=>{if(['listening','speaking'].includes(e.detail?.state))motionAudio.silence();});
  window.addEventListener('travis:close',()=>motionAudio.silence());
  window.addEventListener('travis:user-start',()=>motionAudio.silence());
  let voiceInput=null,voiceInputFailed=false,voicePaused=false,standby=false,initiativeTimer=0;
  const savedLanguage=(()=>{try{return sessionStorage.getItem('travis.language')||'auto';}catch{return 'auto';}})();
  let replyLanguage=savedLanguage==='pt'?'pt':'en',inputLanguage='auto',preferredLanguage=['pt','en'].includes(savedLanguage)?savedLanguage:'auto',proactive=true,lastInteraction=performance.now();
  // Display language is independent of the speaking language. Default: English.
  const savedInterfaceLanguage=(()=>{try{return sessionStorage.getItem('travis.ui.language')||'en';}catch{return 'en';}})();
  let uiLanguage='en';
  function setInterfaceLanguage(language,{persist=true}={}){
    uiLanguage=applyInterfaceLanguage(interfaceLanguage(language));
    if(persist){try{sessionStorage.setItem('travis.ui.language',uiLanguage);}catch{}}
    window.dispatchEvent(new CustomEvent('travis:interface-language',{detail:{language:uiLanguage}}));
    return uiLanguage;
  }
  setInterfaceLanguage(savedInterfaceLanguage,{persist:false});
  function interruptReply(){
    voiceSession++;voiceRequestController?.abort();voiceRequestController=null;
    clearTimeout(voiceFinishTimer);voiceFinishTimer=0;
    if(voiceSource){try{voiceSource.onended=null;voiceSource.stop();voiceSource.disconnect();}catch{}voiceSource=null;}
    if(voicePlaybackRaf)cancelAnimationFrame(voicePlaybackRaf);voicePlaybackRaf=0;
    speechClock=null;
    try{voiceOutputDelay?.disconnect();}catch{}voiceOutputDelay=null;speechFace?.reset();
    voiceBusy=false;externalVoiceLevel=0;
  }
  async function ensureVoiceInput(){
    if(voicePaused||!opened||voiceInputFailed)return false;
    if(!voiceInput)voiceInput=createVoiceInput({
      onStart(){if(!opened||voicePaused||voiceBusy||state==='speaking')return;lastInteraction=performance.now();window.dispatchEvent(new CustomEvent('travis:user-start'));interruptReply();setState('listening',standby?'Say Travis to wake me.':'I’m listening.');},
      onSpeech(blob,endedAt){if(!opened||voicePaused||voiceBusy||state==='speaking')return;voiceSpeechEndedAt=endedAt;handleVoiceBlob(blob,'audio/wav',voiceSession);},
      onLevel(level){if(state!=='speaking')externalVoiceLevel=level;},
      checkTurn:blob=>localJson('/turn',{body:blob,type:'audio/wav',signal:AbortSignal.timeout(1500)}),
      onError(error){console.warn('Neural voice input unavailable:',error.message);},
    });
    try{await voiceInput.start();return Boolean(voiceInput.diagnostics().active);}
    catch{voiceInputFailed=true;hud.dataset.voiceInput='silence-fallback';return false;}
  }
  function scheduleInitiative(){
    clearTimeout(initiativeTimer);
    if(!opened||voicePaused)return;
    initiativeTimer=setTimeout(async()=>{
      const epoch=voiceSession;
      try{
        const idleSeconds=(performance.now()-lastInteraction)/1000;
        if(proactive&&!standby&&!voiceBusy&&!voiceInput?.diagnostics().speaking&&!document.hidden&&idleSeconds>90&&!window.TravisProjection?.media().playing){
          const data=await localJson('/initiative',{body:{session:dialogueSession,idleSeconds}});
          if(data.event&&epoch===voiceSession&&!voiceBusy&&!voicePaused&&opened&&!voiceInput?.diagnostics().speaking){
            const session=voiceSession;voiceBusy=true;presentToolResult(data.event);
            const response=await localFetch('/speak',{body:{text:data.event.reply,language:data.event.language}});
            if(!response.ok)throw new Error('Initiative voice unavailable');
            await playVoiceArrayBuffer(await response.arrayBuffer(),session,data.event.reply);
          }else if(!voiceBusy&&idleSeconds>120)setState('idle','Standing by.');
        }
      }catch(error){console.warn('Travis initiative:',error.message);if(epoch===voiceSession&&!voiceSource){voiceBusy=false;scheduleListening(voiceSession,500);}}
      finally{scheduleInitiative();}
    },30000);
  }

  // Keep the conversation across reloads in this tab without mixing separate tabs.
  const dialogueSession=(()=>{
    try {
      const saved=sessionStorage.getItem('travis-dialogue-session');
      const id=/^[a-zA-Z0-9-]{8,80}$/.test(saved||'')?saved:crypto.randomUUID();
      sessionStorage.setItem('travis-dialogue-session',id);return id;
    } catch {return crypto.randomUUID();}
  })();
  let activeProject=null;
  let voiceBusy=false;
  let voiceStream=null;
  let voiceRecorder=null;
  let voiceChunks=[];
  let voiceVadTimer=0;
  let voiceRecordTimer=0;
  let voiceRestartTimer=0;
  let introVoiceTimer=0;
  let voiceStarting=false;
  let voiceRequestController=null;
  let voiceSource=null;
  let voicePlaybackRaf=0;
  let micSourceNode=null;
  let micAnalyser=null;
  let voiceSpeechEndedAt=0;
  const voiceMetrics=[];
  const pendingVoiceTasks=new Map();
  let voiceTaskTimer=0;
  let lastVoiceTaskResult=null;
  try {
    const saved=JSON.parse(localStorage.getItem('travis.voiceTasks')||'[]');
    if(Array.isArray(saved))saved.slice(0,4).forEach(taskId=>{
      if(/^travis-job-[0-9a-f]{16}$/.test(taskId))pendingVoiceTasks.set(taskId,{});
    });
  } catch {}
  function persistVoiceTasks() {
    try {localStorage.setItem('travis.voiceTasks',JSON.stringify([...pendingVoiceTasks.keys()]));} catch {}
  }

  const BLOOM_LAYER = 1;
  const bloomLayer=new THREE.Layers();bloomLayer.set(BLOOM_LAYER);
  const bloomOccluder=new THREE.MeshBasicMaterial({color:0x000000,depthWrite:true});
  const bloomRestore=new Map();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const clamp = THREE.MathUtils.clamp;
  const lerp = THREE.MathUtils.lerp;
  let pendingVisionScene=null,lastVisionSignature='',lastVisionSpeechAt=0,visionNarrationPreparing=false;
  const vision=createTravisVision({
    onScene(scene){pendingVisionScene=scene.active?scene:null;if(!scene.active)lastVisionSignature='';},
    isSpeechCritical:()=>Boolean(voiceSource),
    onGesture(action){
      if(!opened||!ready)return;
      if(action==='show_hologram')toggleCommands(true,{automatic:true});
      if(action==='hide_hologram')toggleCommands(false,{automatic:true});
      if(action==='show_face')setForm('face',{manual:true});
      if(action==='show_brain')setForm('core',{manual:true});
    }
  });

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t,0,1), 3);
  }

  function smooth01(t) {
    t = clamp(t,0,1);
    return t*t*(3-2*t);
  }

  function setState(next='ready', message='') {
    const previous=state;
    state = next;
    stateChangedAt = performance.now();
    if (next==='speaking' && previous!=='speaking') flashPower=1;
    if (next==='listening' && previous!=='listening') flashPower=Math.max(flashPower,.38);
    hud.dataset.state = next;
    window.dispatchEvent(new CustomEvent('travis:state',{detail:{state:next,message}}));
    const [copy,label] = stateCopy[next] || stateCopy.ready;
    if (statusMessage) statusMessage.textContent = message || copy;
    if (statusState) statusState.textContent = label;
    syncAutoForm(next);
  }

  function markBloom(object) {
    if (!object) return object;
    object.layers.enable(BLOOM_LAYER);
    return object;
  }

  function finalFxPass() {
    return new ShaderPass(new THREE.ShaderMaterial({
      uniforms:{
        tDiffuse:{value:null},
        bloomTexture:{value:null},
        uTime:{value:0},
        uResolution:{value:new THREE.Vector2(1,1)},
        uAberration:{value:.00055},
        uGrain:{value:.018},
        uScan:{value:.022},
        uGlitch:{value:0},
        uFlash:{value:0}
      },
      vertexShader:`
        varying vec2 vUv;
        void main(){
          vUv=uv;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `,
      fragmentShader:`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform sampler2D bloomTexture;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uAberration;
        uniform float uGrain;
        uniform float uScan;
        uniform float uGlitch;
        uniform float uFlash;

        float hash21(vec2 p){
          p=fract(p*vec2(123.34,456.21));
          p+=dot(p,p+45.32);
          return fract(p.x*p.y);
        }

        void main(){
          vec2 uv=vUv;
          float band=floor(uv.y*74.0);
          float glitchLine=(hash21(vec2(band,floor(uTime*28.0)))-.5)*uGlitch*.014;
          uv.x+=glitchLine;

          vec2 radial=uv-.5;
          vec2 off=radial*uAberration*smoothstep(.08,.65,length(radial))*(1.0+uGlitch*4.0);
          float r=texture2D(tDiffuse,uv+off).r;
          float g=texture2D(tDiffuse,uv).g;
          float b=texture2D(tDiffuse,uv-off).b;
          vec3 base=vec3(r,g,b);
          vec3 bloom=texture2D(bloomTexture,uv).rgb;

          float scan=.5+.5*sin(uv.y*uResolution.y*1.32);
          base*=1.0-uScan*scan;

          float grain=(hash21(uv*uResolution.xy+uTime*vec2(31.7,17.3))-.5)*uGrain;
          base+=grain*smoothstep(.008,.12,dot(base,vec3(.2126,.7152,.0722)));

          float d=distance(uv,vec2(.5));
          float vignette=1.0-smoothstep(.48,.78,d)*.34;
          vec3 color=(base+bloom*1.12)*vignette;
          color+=vec3(1.0,.84,.65)*uFlash*.12;

          gl_FragColor=vec4(max(color,vec3(0.0)),1.0);
        }
      `,
      depthWrite:false,
      depthTest:false
    }), 'tDiffuse');
  }

  function hologramShader() {
    return new THREE.ShaderMaterial({
      uniforms:{
        uTime:{value:0},
        uColor:{value:new THREE.Color(.62,.41,.23)},
        uOpacity:{value:.34},
        uGlitch:{value:0},
        uState:{value:0}
      },
      vertexShader:`
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        varying float vLocalY;
        uniform float uTime;
        uniform float uGlitch;
        void main(){
          vec3 p=position;
          float slice=step(.82,fract((p.y+2.0)*7.0+uTime*13.0));
          p.x+=sin(p.y*52.0+uTime*95.0)*uGlitch*slice*.025;
          vec4 mv=modelViewMatrix*vec4(p,1.0);
          vNormalV=normalize(normalMatrix*normal);
          vViewDir=normalize(-mv.xyz);
          vLocalY=p.y;
          gl_Position=projectionMatrix*mv;
        }
      `,
      fragmentShader:`
        precision highp float;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        varying float vLocalY;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uGlitch;
        uniform float uState;

        float hash11(float p){
          return fract(sin(p*127.1)*43758.5453123);
        }

        void main(){
          float fresnel=pow(1.0-clamp(dot(normalize(vNormalV),normalize(vViewDir)),0.0,1.0),2.15);
          float fine=.86+.14*sin((vLocalY+uTime*.22)*48.0);
          float scanPos=fract(uTime*.145);
          float localN=fract(vLocalY*.18+.5);
          float sweep=1.0-smoothstep(.0,.10,abs(localN-scanPos));
          float flick=.94+.06*sin(uTime*19.0)+uGlitch*(hash11(floor(uTime*44.0))-.5)*.35;
          float energy=.22+fresnel*1.65+sweep*.8+uState*.16;
          vec3 c=uColor*energy*fine*flick;
          float a=uOpacity*(.08+fresnel*.72+sweep*.14);
          gl_FragColor=vec4(c,a);
        }
      `,
      transparent:true,
      blending:THREE.AdditiveBlending,
      depthWrite:false,
      side:THREE.DoubleSide,
      toneMapped:false
    });
  }

  function modeForState(next=state,now=performance.now()) {
    return automaticTravisForm({
      state:next,
      elapsedMs:Math.max(0,now-stateChangedAt),
      faceReady:realFaceReady,
      brainConnected:neuralField?.diagnostics()?.backendConnected===true,
      projectionActive:Boolean(pendingConcept)||hud.dataset.immersive==='true'
    });
  }

  function applyForm(form='core') {
    if (!['core','face'].includes(form)) form='core';
    activeForm=form;
    formTarget.core=form==='core'?1:0;
    formTarget.face=form==='face'?1:0;
    hud.dataset.form=form;
    hud.dataset.formPolicy=manualFormUntil>performance.now()?'temporary':'auto';
  }

  // Gestures/API can preview another form; automation takes over again.
  function setForm(mode='auto',{manual=false}={}) {
    if (mode==='auto') {
      manualFormUntil=0;
      syncAutoForm(state);
    } else if (['core','face'].includes(mode)) {
      if(mode==='face'&&!realFaceReady)return;
      manualFormUntil=manual?performance.now()+MANUAL_PREVIEW_MS:0;
      applyForm(mode);
    }
  }

  function syncAutoForm(next=state,now=performance.now()) {
    if(now<manualFormUntil)return;
    const target=modeForState(next,now);
    if(target!==activeForm)applyForm(target);
    else hud.dataset.formPolicy='auto';
  }

  function holoLine(points,color=0xcaa373,opacity=.35,closed=false) {
    const geometry=new THREE.BufferGeometry().setFromPoints(points);
    const material=new THREE.LineBasicMaterial({
      color,transparent:true,opacity,
      blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false
    });
    const line=closed?new THREE.LineLoop(geometry,material):new THREE.Line(geometry,material);
    markBloom(line);
    return line;
  }

  function ellipseLine(rx,ry,z,color=0xd1ad81,opacity=.36,segments=64) {
    const points=[];
    for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2;
      points.push(new THREE.Vector3(Math.cos(a)*rx,Math.sin(a)*ry,z));
    }
    return holoLine(points,color,opacity,true);
  }


  function faceShellShader() {
    return createHolographicHeadMaterial(THREE,true);
  }

  async function createFaceAvatar() {
    faceRoot=new THREE.Group();
    faceRoot.name='TravisAnatomicalPortrait';
    faceRoot.visible=false;
    hud.dataset.faceAsset='loading';
    try {
      const gltf=await new GLTFLoader().loadAsync('./assets/travis/travis-face-bust.glb?v=1');
      realFaceModel=gltf.scene;
      realFaceModel.name='TravisRealFace';
      const head=realFaceModel.getObjectByName('TravisFace_Bust');
      if (!head?.isMesh) throw new Error('Busto anatómico em falta.');
      // Remove torso triangles from every render pass, including bloom/depth.
      const headPositions=head.geometry.attributes.position;
      const headIndices=head.geometry.index?.array;
      const clipped=[];
      for(let i=0;i<(headIndices?.length||headPositions.count);i+=3){
        const a=headIndices?headIndices[i]:i,b=headIndices?headIndices[i+1]:i+1,c=headIndices?headIndices[i+2]:i+2;
        if(Math.min(headPositions.getY(a),headPositions.getY(b),headPositions.getY(c))>=.17)clipped.push(a,b,c);
      }
      head.geometry.setIndex(clipped);
      realFaceHead=head;
      faceRig=createFaceRig(head.geometry);
      hud.dataset.lipSync="audio-envelope";
      const box=new THREE.Box3().setFromObject(realFaceModel);
      const size=box.getSize(new THREE.Vector3());
      const center=box.getCenter(new THREE.Vector3());
      if (![size.x,size.y,size.z].every(Number.isFinite) ||
          size.x<1 || size.x>4 || size.y<1 || size.y>4 || size.z<.2) {
        throw new Error('Escala do busto inválida.');
      }
      realFaceBaseMaterial=createHolographicHeadMaterial(THREE);
      head.material=realFaceBaseMaterial;
      // Keep the projected face readable; only its light contours receive bloom.
      head.layers.disable(BLOOM_LAYER);
      const glowShell=new THREE.Mesh(head.geometry,faceShellShader());
      glowShell.name='TravisFace_HologramShell';
      glowShell.position.copy(head.position);
      glowShell.quaternion.copy(head.quaternion);
      glowShell.scale.copy(head.scale);
      glowShell.renderOrder=3;
      markBloom(glowShell);
      head.parent.add(glowShell);
      avatarMaterial=glowShell.material;
      assemblyParticles=createAssemblyParticles(THREE,head.geometry);
      assemblyParticles.position.copy(head.position);assemblyParticles.quaternion.copy(head.quaternion);
      assemblyParticles.scale.copy(head.scale);markBloom(assemblyParticles);head.parent.add(assemblyParticles);

      for(const label of ['L','R']) {
        const sclera=realFaceModel.getObjectByName('TravisFace_Eye_'+label);
        const iris=realFaceModel.getObjectByName('TravisFace_Iris_'+label);
        const pupil=realFaceModel.getObjectByName('TravisFace_Pupil_'+label);
        if(!sclera?.isMesh || !iris?.isMesh || !pupil?.isMesh) throw new Error('Olho anatómico incompleto: '+label);
        for(const eyeMesh of [sclera,iris,pupil]){
          eyeMesh.material=createHolographicHeadMaterial(THREE);
          holographicEyeMaterials.push(eyeMesh.material);
        }
        const eyeCenter=new THREE.Box3().setFromObject(sclera).getCenter(new THREE.Vector3());
        realFaceModel.worldToLocal(eyeCenter);
        const pivot=new THREE.Group();pivot.name='TravisFace_Gaze_'+label;
        realFaceModel.add(pivot);pivot.position.copy(eyeCenter);
        pivot.updateMatrixWorld(true);
        [sclera,iris,pupil].forEach(mesh=>pivot.attach(mesh));
        const glint=markBloom(new THREE.Mesh(new THREE.SphereGeometry(.0017,8,6),
          new THREE.MeshBasicMaterial({color:0xcdb18b,toneMapped:false})));
        glint.name='TravisFace_EyeAccent_'+label;
        glint.position.set(-.009,.012,.053);pivot.add(glint);glint.visible=false;
        faceEyeGroups.push(pivot);realFaceIris.push(iris);
      }
      realFaceModel.position.set(-center.x,-.66,-center.z+.04);
      faceRoot.add(realFaceModel);realFaceReady=true;
      hud.dataset.faceAsset='bust';hud.dataset.avatarStyle='laser-hologram';
      console.info('Travis bust loaded',{meshes:realFaceModel.children.map(o=>o.name),
        bounds:size.toArray(),baseBloom:head.layers.isEnabled(BLOOM_LAYER),source:'Blender GLB'});
    } catch(error) {
      hud.dataset.faceAsset='error';
      console.error('Travis anatomical bust failed:',error);
      // Keep the real core available; never display a synthetic substitute head.
      setLoading('Face unavailable · core online');
      throw error;
    }
    scene.add(faceRoot);
    faceHit=realFaceHead;
    faceHit.userData.core=true;
  }

  async function createAdaptiveForms() {
    await createFaceAvatar();
    // The conversational identity is the face, not the internal network.
    // Materialization on first opening still follows the intro shader.
    manualFormUntil=0;
    applyForm('face');
    formBlend.face=1;
    formBlend.core=0;
    syncAutoForm();
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

  function localFetch(path,{body=null,type='application/json',method='POST',signal=null}={}) {
    const endpoint=path.split('?')[0],timeout=endpoint==='/jarvis'?120000:endpoint==='/visual-research'?35000:30000;
    const headers={};
    if (body!=null && type) headers['Content-Type']=type;
    const init={
      method,
      mode:'cors',
      cache:'no-store',
      credentials:'omit',
      headers,
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout)
    };
    if (!IS_LOCAL_TRAVIS_UI) init.targetAddressSpace='local';
    if (body!=null) init.body=type==='application/json'?JSON.stringify(body):body;
    return fetch(LOCAL_TRAVIS_BASE+path,init);
  }

  async function localJson(path,options={}) {
    const response=await localFetch(path,options);
    if (!response.ok) {
      let message='Pedido local falhou.';
      try {
        const data=await response.json();
        message=data.error||message;
      } catch {}
      throw new Error(message);
    }
    return response.json();
  }

  async function localHealth(signal) {
    const response=await localFetch('/health',{method:'GET',signal});
    if (!response.ok) throw new Error('Local Travis is unavailable.');
    return response.json();
  }

  function clearVoiceTimers() {
    clearInterval(voiceVadTimer);
    clearTimeout(voiceRecordTimer);
    clearTimeout(voiceRestartTimer);
    voiceVadTimer=0;
    voiceRecordTimer=0;
    voiceRestartTimer=0;
    clearTimeout(voiceTaskTimer);voiceTaskTimer=0;
  }

  function releaseVoiceMic({stopRecorder=false,keepStream=false}={}) {
    clearInterval(voiceVadTimer);
    clearTimeout(voiceRecordTimer);
    voiceVadTimer=0;
    voiceRecordTimer=0;
    if (stopRecorder && voiceRecorder?.state==='recording') {
      try {
        voiceRecorder.onstop=null;
        voiceRecorder.stop();
      } catch {}
    }
    voiceRecorder=null;
    micSourceNode?.disconnect?.();
    micSourceNode=null;
    micAnalyser=null;
    if(!keepStream){voiceStream?.getTracks?.().forEach(track=>track.stop());voiceStream=null;}
    externalVoiceLevel=0;
  }

  function stopVoiceConversation() {
    window.dispatchEvent(new CustomEvent('travis:speech-cancel'));
    voiceInput?.stop();clearTimeout(initiativeTimer);
    voiceSession++;
    clearTimeout(voiceFinishTimer);
    speechFace?.reset();
    try { voiceOutputDelay?.disconnect(); } catch {}
    voiceOutputDelay=null;
    voiceBusy=false;
    clearVoiceTimers();
    voiceRequestController?.abort();
    voiceRequestController=null;
    releaseVoiceMic({stopRecorder:true});
    if (voiceSource) {
      try { voiceSource.onended=null; voiceSource.stop(); } catch {}
      try { voiceSource.disconnect(); } catch {}
      voiceSource=null;
    }
    if (voicePlaybackRaf) cancelAnimationFrame(voicePlaybackRaf);
    voicePlaybackRaf=0;
    externalVoiceLevel=null;
    speechClock=null;
  }

  function scheduleListening(session,delay=260) {
    clearTimeout(voiceRestartTimer);
    if (!opened || voicePaused || session!==voiceSession) return;
    voiceRestartTimer=setTimeout(()=>{
      if (opened && session===voiceSession && !voiceBusy) startListening(session);
    },delay);
  }

  function prepareSpeechFace(ac) {
    if(!ac) return Promise.resolve(null);
    if(!speechFacePromise) speechFacePromise=createSpeechFace(ac).then(driver=>speechFace=driver).catch(error=>{
      hud.dataset.lipSync='audio-envelope-fallback';console.warn('Travis visemes unavailable',error.message);return null;
    });
    return speechFacePromise;
  }

  async function playVoiceArrayBuffer(arrayBuffer,session,reply,metrics=null) {
    if(!opened||session!==voiceSession)return;
    const ac=audio();
    if(!ac)throw new Error('Áudio indisponível.');
    // Phone speakers can feed the microphone; do not let the VAD interrupt its own voice.
    voiceInput?.stop();
    releaseVoiceMic({stopRecorder:true});
    if(ac.state!=='running'){
      await Promise.race([ac.resume(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Toca para ativar o áudio.')),4000))]);
      if(ac.state!=='running')throw new Error('Audio playback needs a foreground gesture.');
    }
    if(!opened||session!==voiceSession)return;
    const decoded=await ac.decodeAudioData(arrayBuffer.slice(0));
    if(!opened||session!==voiceSession)return;
    const envelope=buildSpeechEnvelope(decoded);
    const source=ac.createBufferSource();
    source.buffer=decoded;
    const analyser=ac.createAnalyser();
    analyser.fftSize=1024;
    source.connect(analyser);
    analyser.connect(ac.destination);
    voiceSource=source;
    externalVoiceLevel=0;
    hud.dataset.lipSync='audio-clock-envelope';
    const startAt=ac.currentTime+.035;
    speechClock={source,context:ac,start:startAt,envelope};

    window.dispatchEvent(new CustomEvent('travis:transcript',{detail:{role:'assistant',text:reply}}));
    setState('speaking',String(reply||'Responding.').slice(0,96));
    flashPower=.08;

    source.onended=()=>{
      if(voiceSource!==source)return;
      try{analyser.disconnect();source.disconnect();}catch{}
      voiceSource=null;
      speechClock=null;
      externalVoiceLevel=0;
      speechFace?.reset();
      faceRig?.update(0);
      if(opened&&session===voiceSession){
        voiceBusy=false;
        lastInteraction=performance.now();
        window.dispatchEvent(new CustomEvent('travis:speech-end'));
        setState(standby||voicePaused?'idle':'ready',
          standby?'Standing by. Say Travis.':voicePaused?'Microphone off.':'I’m here.');
        if(!voicePaused)scheduleListening(session,220);
      }
    };

    window.TravisProjection?.beginNarration?.({text:reply,context:ac,start:startAt,duration:decoded.duration});
    source.start(startAt);
    if(metrics){
      metrics.replyToFirstAudioMs=Math.round(performance.now()-metrics.replyAt);
      metrics.speechEndToFirstAudioMs=Math.round(performance.now()-metrics.speechEndedAt);
      metrics.audioMode='single-source-clock';
      voiceMetrics.push({...metrics});if(voiceMetrics.length>20)voiceMetrics.shift();
      console.info('Travis voice latency',metrics);
    }
  }

  function presentToolResult(answer) {
    Object.assign(answer,projectWebAnswer(answer));
    const receipt=window.TravisProjection?.action(answer?.result);
    if(receipt?.reply&&receipt.ok===false){answer.reply=receipt.reply;replyLanguage='en';}
    if(!answer?.ui)return;
    if(answer.ui.project)activeProject=answer.ui.project;
    window.dispatchEvent(new CustomEvent('travis:result',{detail:answer}));
  }

  function scheduleVoiceTaskPoll() {
    clearTimeout(voiceTaskTimer);
    if(!opened || !pendingVoiceTasks.size) return;
    voiceTaskTimer=setTimeout(pollVoiceTasks,2200);
  }

  async function pollVoiceTasks() {
    const session=voiceSession;
    try {
      for(const [taskId] of pendingVoiceTasks) {
        if(!opened || session!==voiceSession) return;
        const task=await localJson('/voice-task',{body:{taskId}});
        if(!opened || session!==voiceSession) return;
        if(!['completed','failed'].includes(task.status) || voiceBusy || voiceInput?.diagnostics().speaking || voicePaused || standby) continue;
        voiceBusy=true;releaseVoiceMic({stopRecorder:true});
        const reply=task.status==='completed'
          ? String(task.answer?.reply||'The agent finished without a response.')
          : 'I could not complete the task: '+String(task.error||'Executor failure.');
        lastVoiceTaskResult=task;replyLanguage=task.answer?.language||replyLanguage;
        presentToolResult(task.answer || {ui:{kind:"agents",title:"Request failed",items:[{title:task.tool||"Agent",detail:task.error||"Execution failed"}]}});
        console.info('Travis agent result',task);
        setState('thinking','The agent finished. Preparing voice…');
        try {
          const speech=await localFetch('/speak',{body:{text:reply.slice(0,1800),language:replyLanguage}});
          if(!speech.ok) throw new Error('Completion voice is unavailable.');
          const wav=await speech.arrayBuffer();
          await playVoiceArrayBuffer(wav,session,reply);
          if(opened && session===voiceSession) {pendingVoiceTasks.delete(taskId);persistVoiceTasks();}
        } catch(error) {
          voiceBusy=false;setState('ready',error.message);scheduleListening(session,900);
        }
        break;
      }
    } catch(error) {
      console.warn('Travis task status:',error);
    } finally {scheduleVoiceTaskPoll();}
  }

  // Scene narration shares the existing voice engine and waits for a quiet turn.
  // It never interrupts user speech, another response, a video, or standby.
  const visionNarrationTimer=setInterval(async()=>{
    if(visionNarrationPreparing||!pendingVisionScene||!vision.narration()||!opened||standby||voicePaused||voiceBusy||voiceSource||document.hidden)return;
    if(voiceInput?.diagnostics().speaking||voiceRecorder?.state==='recording'||window.TravisProjection?.media().playing)return;
    const now=performance.now();
    if(now-lastInteraction<2500||now-lastVisionSpeechAt<9000)return;
    const scene=vision.snapshot(),signature=sceneSignature(scene);
    if(!signature||signature===lastVisionSignature)return;
    const epoch=voiceSession;
    const locale=preferredLanguage==='pt'?'pt':preferredLanguage==='en'?'en':replyLanguage;
    const reply=vision.describe(locale);
    visionNarrationPreparing=true;
    let startedPlayback=false;
    try{
      const speech=await localFetch('/speak',{body:{text:reply,language:locale},signal:AbortSignal.timeout(12000)});
      if(epoch!==voiceSession||!opened||voiceBusy||voiceInput?.diagnostics().speaking||!vision.snapshot().active||!vision.narration())return;
      if(!speech.ok)throw new Error('Scene voice unavailable');
      // Do not announce an object that disappeared while voice was prepared.
      if(sceneSignature(vision.snapshot())!==signature)return;
      const wav=await speech.arrayBuffer();
      if(epoch!==voiceSession||!opened||voiceBusy||voiceInput?.diagnostics().speaking||!vision.narration()||sceneSignature(vision.snapshot())!==signature)return;
      lastVisionSignature=signature;lastVisionSpeechAt=performance.now();voiceBusy=true;startedPlayback=true;
      await playVoiceArrayBuffer(wav,epoch,reply);
    }catch(error){
      console.debug('Vision narration:',error.message);lastVisionSpeechAt=performance.now();
      if(startedPlayback&&epoch===voiceSession&&!voiceSource){voiceBusy=false;scheduleListening(epoch,900);}
    }
    finally{visionNarrationPreparing=false;}
  },750);
  window.addEventListener('pagehide',()=>clearInterval(visionNarrationTimer),{once:true});

  async function handleVoiceBlob(blob,mime,session) {
    if (!opened || session!==voiceSession) return;
    voiceBusy=true;
    // Silero has finished this utterance. Keep the microphone off until playback finishes.
    if(typeof blob!=='string')voiceInput?.stop();
    voiceRequestController?.abort();
    const controller=new AbortController();
    voiceRequestController=controller;

    try {
      setState('thinking','Transcribing speech…');
      const metrics={speechEndedAt:voiceSpeechEndedAt||performance.now()};
      const recognitionLanguage=inputLanguage!=='auto'
        ? inputLanguage : (preferredLanguage==='en'||preferredLanguage==='pt' ? preferredLanguage : 'auto');
      const transcript=typeof blob==='string'?{text:blob}:await localJson('/transcribe?language='+recognitionLanguage,{
        body:blob,
        type:mime||'application/octet-stream',
        signal:controller.signal
      });
      if (!opened || session!==voiceSession) return;

      metrics.transcriptAt=performance.now();
      metrics.speechEndToTranscriptMs=Math.round(metrics.transcriptAt-metrics.speechEndedAt);
      metrics.sttDurationMs=transcript.durationMs??null;
      metrics.recognitionLanguage=recognitionLanguage;
      let text=String(transcript.text||'').trim();
      window.dispatchEvent(new CustomEvent('travis:transcript',{detail:{role:'user',text}}));
      if (!text) throw new Error('No speech recognized. Please speak again.');
      // Only audio may use narrow acoustic wake recovery. Typed messages never
      // receive fuzzy corrections, and raw ASR text remains visible.
      const wakeAddress=resolveWakePhrase(text,{allowFuzzy:typeof blob!=='string'});
      if(standby&&!wakeAddress.matched){
        voiceBusy=false;setState('idle','Standing by. Say Travis.');
        scheduleListening(session,100);return;
      }
      const wokeFromStandby=standby;
      if(standby){
        standby=false;
        text=wakeAddress.command||'acorda';
      }else if(wakeAddress.corrected && typeof blob!=='string'){
        text=wakeAddress.command||text;
      }
      if(wakeAddress.corrected)metrics.wakeRecoveryKind=wakeAddress.kind;
      lastInteraction=performance.now();
      // Bilingual presentation changes do not change voice-language settings.
      const requestedInterfaceLanguage=languageFromInterfaceCommand(text);
      if(requestedInterfaceLanguage){
        setInterfaceLanguage(requestedInterfaceLanguage);
        const spoken=INTERFACE_COPY[requestedInterfaceLanguage].applied;
        replyLanguage=requestedInterfaceLanguage;
        setState('thinking','Updating display language…');
        const speech=await localFetch('/speak',{
          body:{text:spoken,language:requestedInterfaceLanguage},
          signal:controller.signal
        });
        if(!speech.ok)throw new Error('Voice unavailable.');
        await playVoiceArrayBuffer(await speech.arrayBuffer(),session,spoken);
        return;
      }
      // Camera intent must resolve before the imaginative projection router.
      const cameraAction=cameraCommand(text);
      if(cameraAction){
        const ptSpoken=/\b(?:liga|ligar|ativa|abre|mostra|desliga|fecha|desativa|muda|troca|tras|traseira|frontal|estas|detetas|descreve|diz|narra|liberta)\b/i.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
        const locale=preferredLanguage==='pt'||preferredLanguage==='en'?preferredLanguage:(ptSpoken?'pt':'en');
        let responseText;
        setState('thinking',locale==='pt'?'A preparar a visão…':'Preparing vision…');
        try{
          if(cameraAction==='stop'){
            vision.stop();pendingVisionScene=null;lastVisionSignature='';
            responseText=locale==='pt'?'Câmara desligada.':'Camera switched off.';
          }else if(cameraAction==='narrate-off'||cameraAction==='narrate-on'){
            vision.narration(cameraAction==='narrate-on');pendingVisionScene=vision.snapshot();
            responseText=cameraAction==='narrate-on'
              ?(locale==='pt'?'Vou descrever as deteções quando a cena mudar.':'I will describe confirmed detections when the scene changes.')
              :(locale==='pt'?'Narração automática desativada. Podes continuar a perguntar o que vejo.':'Automatic narration is off. You can still ask what I see.');
          }else if(cameraAction==='release'){
            vision.releaseTarget();responseText=locale==='pt'?'Alvo libertado.':'Target released.';
          }else{
            if(cameraAction==='rear')await vision.start('environment');
            else if(cameraAction==='front')await vision.start('user');
            else if(cameraAction==='switch')await vision.switchCamera();
            else if(cameraAction==='start')await vision.start();
            if(!opened||session!==voiceSession||controller.signal.aborted)return;
            const observation=await vision.waitForObservation();
            if(cameraAction!=='describe'&&!observation.active)throw new Error('Camera request cancelled');
            const side=observation.facingMode==='environment'?(locale==='pt'?'Câmara traseira ligada. ':'Rear camera on. '):(locale==='pt'?'Câmara frontal ligada. ':'Front camera on. ');
            responseText=(cameraAction==='describe'?'':observation.facingVerified?side:(locale==='pt'?'Câmara ligada. ':'Camera on. '))+vision.describe(locale);
            lastVisionSignature=sceneSignature(observation);lastVisionSpeechAt=performance.now();
          }
        }catch(error){
          console.warn('Camera request:',error.message);
          responseText=locale==='pt'
            ?'Não consegui abrir a câmara pedida. Confirma a permissão e se essa câmara está disponível.'
            :'I could not open the requested camera. Check the permission and whether that camera is available.';
        }
        if(!opened||session!==voiceSession||controller.signal.aborted)return;
        replyLanguage=locale;
        const speech=await localFetch('/speak',{body:{text:responseText,language:locale},signal:controller.signal});
        if(!speech.ok)throw new Error('Local voice unavailable');
        await playVoiceArrayBuffer(await speech.arrayBuffer(),session,responseText);
        return;
      }
      text=window.TravisProjection?.select(text)||text;
      let interpretation=window.TravisProjection?.interpret?.(text);
      // Unfamiliar colloquial image requests may use the already running
      // local language model. This never starts a heavyweight LLM mid-voice.
      if(!interpretation?.handled&&window.TravisProjection?.mayNeedModel?.(text)){
        try{
          const semantic=await localJson('/visual-intent',{
            body:{text},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8500)])
          });
          if(!opened||session!==voiceSession)return;
          if(semantic?.ok)interpretation=window.TravisProjection?.applyModelIntent?.(semantic,text);
        }catch(error){
          if(controller.signal.aborted||session!==voiceSession)return;
          console.debug('Visual intent model not ready:',error.message);
        }
      }
      if(interpretation?.researchQuery){
        setState('thinking',interpretation.language==='pt'?'A procurar uma referência visual…':'Finding a visual reference…');
        try{
          const reference=await localJson('/visual-research',{body:{query:interpretation.researchQuery,language:interpretation.language,includeImage:interpretation.needsReference,imageIndex:interpretation.imageIndex||0,preferModel:interpretation.needsReference&&!interpretation.referenceRequested&&interpretation.kind!=='reference-next'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(35000)])});
          if(!opened||session!==voiceSession||controller.signal.aborted)return;
          const receipt=await window.TravisProjection?.applyReference?.(reference,interpretation);
          if(receipt&&interpretation.handled)interpretation.reply=receipt;
        }catch(error){
          if(controller.signal.aborted||session!==voiceSession)return;
          if(interpretation.handled)interpretation.reply=interpretation.language==='pt'?'Não consegui obter a referência visual agora.':'I could not retrieve that visual reference right now.';
        }
      }
      if(interpretation?.rewritten)text=interpretation.rewritten;
      if(interpretation?.handled){
        if(!interpretation.reply){
          voiceBusy=false;setState('ready','I’m here.');scheduleListening(session,180);
          return;
        }
        replyLanguage=interpretation.language==='pt'?'pt':'en';
        setState('thinking','Preparing short voice response…');
        const speech=await localFetch('/speak',{
          body:{text:interpretation.reply,language:replyLanguage},
          signal:controller.signal
        });
        if(!speech.ok)throw new Error('Local voice unavailable.');
        const wav=await speech.arrayBuffer();
        if(!opened||session!==voiceSession)return;
        await playVoiceArrayBuffer(wav,session,interpretation.reply);
        return;
      }
      setState('thinking','Handling your request…');
      const answer=await localJson('/jarvis',{body:{text,session:dialogueSession,project:activeProject,language:inputLanguage,wake:wokeFromStandby,vision:vision.snapshot()},signal:controller.signal});
      if (!opened || session!==voiceSession) return;
      replyLanguage=answer.language==='pt'?'pt':'en';
      // Listening stays bilingual even when the reply language is locked: the next command may switch it.
      preferredLanguage=answer.preferences?.language||'auto';
      try{sessionStorage.setItem('travis.language',preferredLanguage);}catch{}
      inputLanguage='auto';
      proactive=answer.preferences?.proactive!==false;
      if(answer.result?.action==='conversation_control'){
        const {setting,value}=answer.result;
        if(setting==='standby')standby=value;
        if(setting==='microphone'&&value===false){voicePaused=true;voiceInput?.stop();clearTimeout(initiativeTimer);}
      }
      presentToolResult(answer);
      metrics.replyAt=performance.now();
      metrics.transcriptToReplyMs=Math.round(metrics.replyAt-metrics.transcriptAt);
      metrics.tool=answer.tool;metrics.correlationId=answer.correlationId;
      if(answer.taskId) {
        pendingVoiceTasks.set(answer.taskId,{tool:answer.tool});persistVoiceTasks();
        scheduleVoiceTaskPoll();
      }
      const reply=String(answer.reply||'').trim();
      if (!reply) throw new Error('Travis returned an empty response.');
      setState('thinking','Preparing voice…');

      const speech=await localFetch('/speak',{
        body:{text:reply,language:replyLanguage},
        type:'application/json',
        signal:controller.signal
      });
      if (!speech.ok) throw new Error('The local voice engine did not respond.');
      const wav=await speech.arrayBuffer();
      if (!opened || session!==voiceSession) return;

      await playVoiceArrayBuffer(wav,session,reply,metrics);

      if (answer.result?.action==='open_url' && answer.result?.url && answer.ui?.kind!=='youtube') {
        const url=String(answer.result.url);
        if (/^https?:\/\//i.test(url)) {
          if(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/?(?:\?.*)?$/i.test(url)){
            presentToolResult({ui:{kind:'youtube',title:'YouTube',items:[]},result:{action:'youtube_open'}});
            return;
          }
          // Public pages remain inside the conversation as readable projections.
        }
      }
    } catch (error) {
      if (controller.signal.aborted || session!==voiceSession) return;
      console.warn('Travis voice:',error);
      voiceBusy=false;
      setState('ready',error?.message||'Falha na conversa local.');
      scheduleListening(session,900);
    } finally {
      if (voiceRequestController===controller) voiceRequestController=null;
    }
  }

  async function startListening(session=voiceSession) {
    if (!opened || voicePaused || session!==voiceSession || voiceRecorder?.state==='recording') return;
    if(await ensureVoiceInput()){hud.dataset.voiceInput='silero-smart-turn';if(!voiceBusy)setState(standby?'idle':'listening',standby?'Standing by. Say Travis.':'I’m listening.');return;}
    if(voiceBusy||!opened||session!==voiceSession)return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setState('ready','This browser does not provide microphone access.');
      return;
    }

    try {
      setState('listening','I’m listening.');
      const stream=voiceStream?.getAudioTracks().some(track=>track.readyState==='live')?voiceStream:await navigator.mediaDevices.getUserMedia({
        audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}
      });
      if (!opened || session!==voiceSession) {
        stream.getTracks().forEach(track=>track.stop());
        return;
      }
      voiceStream=stream;
      voiceChunks=[];

      const preferred='audio/webm;codecs=opus';
      const options=MediaRecorder.isTypeSupported?.(preferred)?{mimeType:preferred,audioBitsPerSecond:64000}:undefined;
      const recorder=new MediaRecorder(stream,options);
      voiceRecorder=recorder;
      const mime=recorder.mimeType||stream.getAudioTracks()[0]?.getSettings?.().mimeType||'audio/webm';
      let heardSpeech=false;
      let speechFrames=0;
      voiceSpeechEndedAt=0;

      recorder.ondataavailable=event=>{
        if (event.data?.size) voiceChunks.push(event.data);
      };

      recorder.onstop=()=>{
        const blob=new Blob(voiceChunks,{type:mime});
        const valid=opened && session===voiceSession && heardSpeech && blob.size>400;
        releaseVoiceMic({keepStream:true});
        if (valid) handleVoiceBlob(blob,mime,session);
        else if (opened && session===voiceSession) {
          scheduleListening(session,30);
        }
      };

      recorder.onerror=()=>{
        if(session!==voiceSession)return;
        releaseVoiceMic({stopRecorder:true});voiceBusy=false;
        setState('ready','Reconnecting the microphone…');scheduleListening(session,700);
      };

      recorder.start(120);

      const ac=audio();
      if (ac) {
        if (ac.state==='suspended') await Promise.race([ac.resume(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Toca em ativar conversa por voz.')),4000))]);
        micSourceNode=ac.createMediaStreamSource(stream);
        micAnalyser=ac.createAnalyser();
        micAnalyser.fftSize=1024;
        micSourceNode.connect(micAnalyser);
        const samples=new Float32Array(micAnalyser.fftSize);
        const began=performance.now();
        let lastSpeech=began;
        let noiseFloor=.004;let firstSpeech=0;

        voiceVadTimer=setInterval(()=>{
          if (!voiceRecorder || voiceRecorder!==recorder || recorder.state!=='recording') return;
          micAnalyser.getFloatTimeDomainData(samples);
          let energy=0;
          for (const sample of samples) energy+=sample*sample;
          const rms=Math.sqrt(energy/samples.length);
          externalVoiceLevel=clamp((rms-.006)/.065,0,1);

          const now=performance.now();
          if(!heardSpeech && rms<.018)noiseFloor=noiseFloor*.92+rms*.08;
          const threshold=clamp(noiseFloor*2.8,.008,.026);
          if (rms>threshold) {
            if(!heardSpeech)firstSpeech=now;
            heardSpeech=true;
            speechFrames++;
            lastSpeech=performance.now();
            voiceSpeechEndedAt=lastSpeech;
          }
          // Give natural pauses and a second clause time to arrive.
          const pause=now-firstSpeech<1800?1400:1200;
          if (heardSpeech && speechFrames>=3 && now-lastSpeech>pause) {
            recorder.stop();
            return;
          }
          if (!heardSpeech && now-began>25000) recorder.stop();
        },50);
      }

      voiceRecordTimer=setTimeout(()=>{
        if (recorder.state==='recording') recorder.stop();
      },30000);
    } catch (error) {
      releaseVoiceMic({stopRecorder:true});
      if (!opened || session!==voiceSession) return;
      voiceBusy=false;
      setState('ready',
        error?.name==='NotAllowedError'
          ? 'Allow microphone access so you can speak to me.'
          : 'Microphone: '+(error?.message||'unavailable.')
      );
      if(['NotAllowedError','SecurityError'].includes(error?.name)||audioContext?.state==='suspended'){
        const button=document.getElementById('travis-voice-start');if(button)button.hidden=false;
      }else scheduleListening(session,1500);
    }
  }

  let mediaNoticeTimer=0;
  window.addEventListener('travis:media-notice',event=>{
    clearTimeout(mediaNoticeTimer);
    const session=voiceSession,text=String(event.detail?.text||'').slice(0,400);
    async function tell(){
      if(!opened||session!==voiceSession||!window.TravisProjection?.media().error)return;
      if(voiceBusy||externalVoiceLevel>.04){mediaNoticeTimer=setTimeout(tell,900);return;}
      voiceBusy=true;releaseVoiceMic({stopRecorder:true,keepStream:true});
      try{
        const speech=await localFetch('/speak',{body:{text,language:replyLanguage}});
        if(!speech.ok)throw new Error('Voice unavailable');
        await playVoiceArrayBuffer(await speech.arrayBuffer(),session,text);
      }catch{
        if(session===voiceSession){voiceBusy=false;scheduleListening(session,300);}
      }
    }
    mediaNoticeTimer=setTimeout(tell,1200);
  });

  async function startVoiceConversation({greet=true}={}) {
    if (voiceStarting) return;
    const button=document.getElementById('travis-voice-start');
    if(audio()?.state==='suspended'){
      if(button)button.hidden=false;
      setState('ready','Toca uma vez para ativar a voz. Depois é só falar.');return;
    }
    if(button)button.hidden=true;
    voiceStarting=true;voicePaused=false;
    stopVoiceConversation();
    const session=voiceSession;
    voiceBusy=true;
    const controller=new AbortController();
    voiceRequestController=controller;
    try {
      hud.dataset.lipSync='audio-clock-envelope';
      setState('booting','Connecting to local Travis…');
      const health=await localHealth(controller.signal);
      if (!opened || session!==voiceSession) return;
      if (!health?.ok) throw new Error('Travis local indisponível.');
      if (loadingLabel) {
        loadingLabel.textContent='TRAVIS LOCAL · VOICE ONLINE';
        loadingLabel.classList.add('is-done');
      }
      scheduleVoiceTaskPoll();scheduleInitiative();
      if (greet) {
        const greetingLanguage=preferredLanguage==='pt'?'pt':'en';
        replyLanguage=greetingLanguage;
        let greetingText=greetingLanguage==='pt'?'Estou aqui. Podemos continuar.':'I’m here, sir. We can continue.';
        setState('thinking','Restoring conversation context…');
        let resumeInfo=null;
        try {
          resumeInfo=await localJson('/resume',{body:{session:dialogueSession,language:greetingLanguage},signal:controller.signal});
        } catch(error) { console.warn('Travis resume unavailable:',error); }
        if (!opened||session!==voiceSession||controller.signal.aborted)return;
        if (resumeInfo?.speak===false) {
          voiceBusy=false;
          setState('ready','Ready to continue.');
          await startListening(session);
          return;
        }
        if (resumeInfo?.reply) greetingText=String(resumeInfo.reply).slice(0,480);
        setState('thinking','Bringing voice online…');
        try {
          const speech=await localFetch('/speak',{
            body:{text:greetingText,language:greetingLanguage,mode:'welcome'},
            type:'application/json',
            signal:controller.signal
          });
          if(!speech.ok)throw new Error('Greeting unavailable.');
          const wav=await speech.arrayBuffer();
          if (!opened || session!==voiceSession) return;
          // Finish the visible assembly before the welcome speech starts.
          const assemblyDeadline=performance.now()+6000;
          while(opened && session===voiceSession && Number(hud.dataset.materialization||0)<1 && performance.now()<assemblyDeadline){
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          if(!opened || session!==voiceSession || controller.signal.aborted)return;
          await playVoiceArrayBuffer(wav,session,greetingText);
          return;
        } catch(error) {
          if(controller.signal.aborted || session!==voiceSession)return;
          console.warn('Travis greeting:',error);
        }
      }
      voiceBusy=false;
      setState('ready','I’m here.');
      await startListening(session);
    } catch (error) {
      if (controller.signal.aborted || session!==voiceSession) return;
      voiceBusy=false;
      console.warn('Travis local:',error);
      setState('ready','I could not connect to local Travis.');
    } finally {
      if (voiceRequestController===controller) voiceRequestController=null;
      voiceStarting=false;
    }
  }

  function radialTexture(inner='#e9d0a9', outer='rgba(194,150,91,0)') {
    const c=document.createElement('canvas');
    c.width=c.height=256;
    const ctx=c.getContext('2d');
    const g=ctx.createRadialGradient(128,128,0,128,128,128);
    g.addColorStop(0,inner);
    g.addColorStop(.08,'rgba(224,188,134,.78)');
    g.addColorStop(.32,'rgba(171,117,61,.16)');
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
    ctx.fillStyle='#f0e1cd';
    ctx.shadowColor='rgba(220,179,117,.4)';
    ctx.shadowBlur=16;
    ctx.fillText(title,256,72);
    ctx.shadowBlur=0;
    if (subtitle) {
      ctx.font='500 20px Arial, sans-serif';
      ctx.fillStyle='rgba(191,166,134,.9)';
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
    ctx.strokeStyle='#e6c89b';
    ctx.lineWidth=7;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.shadowColor='rgba(198,145,82,.38)';
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
    const dustCount = innerWidth < 700 ? 280 : 520;
    const pos=new Float32Array(dustCount*3);
    for(let i=0;i<dustCount;i++){
      pos[i*3]=(Math.random()-.5)*13;
      pos[i*3+1]=(Math.random()-.5)*10;
      pos[i*3+2]=(Math.random()-.5)*8-1.8;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({
      color:0xc6a174,size:innerWidth<700?.017:.021,transparent:true,opacity:.24,
      blending:THREE.AdditiveBlending,depthWrite:false
    });
    dust=new THREE.Points(geo,mat);
    scene.add(dust);

    const beamMat=new THREE.MeshBasicMaterial({
      color:0x9a734c,transparent:true,opacity:.0045,
      blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false
    });
    beamTop=new THREE.Mesh(new THREE.ConeGeometry(1.7,8.2,48,1,true),beamMat.clone());
    beamTop.position.set(0,4.4,-1.6);
    scene.add(beamTop);

    beamBottom=new THREE.Mesh(new THREE.ConeGeometry(1.45,6.8,48,1,true),beamMat.clone());
    beamBottom.rotation.z=Math.PI;
    beamBottom.position.set(0,-4.3,-1.8);
    scene.add(beamBottom);

    const haloMat=new THREE.MeshBasicMaterial({
      color:0xac7d50,transparent:true,opacity:.055,
      blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false
    });
    floorHalo=markBloom(new THREE.Mesh(new THREE.RingGeometry(1.55,3.6,128),haloMat));
    floorHalo.rotation.x=1.18;
    floorHalo.position.set(0,-2.35,-1.15);
    floorHalo.visible=false;
    scene.add(floorHalo);

    const glow=markBloom(new THREE.Sprite(new THREE.SpriteMaterial({
      map:radialTexture(),transparent:true,opacity:.09,
      blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false
    })));
    glow.scale.set(7.5,7.5,1);
    glow.position.set(0,.2,-1.8);
    scene.add(glow);

    gridFloor=null; /* V8: generic floor grid removed */
    /*
    gridFloor.position.set(0,-2.72,-1.2);
    gridFloor.material.transparent=true;
    gridFloor.material.opacity=.085;
    gridFloor.material.depthWrite=false;
    gridFloor.material.blending=THREE.AdditiveBlending;
    scene.add(gridFloor); */

    const orbitCount=innerWidth<700?150:260;
    const orbitPos=new Float32Array(orbitCount*3);
    for(let i=0;i<orbitCount;i++){
      const a=Math.random()*Math.PI*2;
      const r=1.25+Math.random()*2.25;
      orbitPos[i*3]=Math.cos(a)*r;
      orbitPos[i*3+1]=Math.sin(a)*r*.82;
      orbitPos[i*3+2]=(Math.random()-.5)*1.35;
    }
    const orbitGeo=new THREE.BufferGeometry();
    orbitGeo.setAttribute('position',new THREE.BufferAttribute(orbitPos,3));
    orbitParticles=markBloom(new THREE.Points(
      orbitGeo,
      new THREE.PointsMaterial({
        color:0xdfbf94,size:innerWidth<700?.022:.028,
        transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false
      })
    ));
    scene.add(orbitParticles);

    filamentGroup=new THREE.Group();
    filamentGroup.visible=false;
    for(let j=0;j<7;j++){
      const pts=[];
      const rx=1.5+j*.23;
      const ry=1.15+j*.16;
      const phase=j*.71;
      for(let i=0;i<120;i++){
        const a=(i/119)*Math.PI*2;
        pts.push(new THREE.Vector3(
          Math.cos(a)*rx,
          Math.sin(a)*ry,
          Math.sin(a*2.0+phase)*.16 + (j-3)*.035
        ));
      }
      const line=markBloom(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color:j%3===0?0xc1905a:0xc7a37a,
          transparent:true,opacity:j%3===0?.07:.09,
          blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false
        })
      ));
      line.rotation.x=(j-3)*.035;
      line.rotation.y=(j%2?1:-1)*.06;
      line.userData.speed=(j%2?1:-1)*(.012+j*.002);
      filamentGroup.add(line);
    }
    scene.add(filamentGroup);
  }

  function createLights() {
    const faceKey=new THREE.DirectionalLight(0xf4e5d1,2.4);
    faceKey.position.set(-3.8,1.0,2.0);scene.add(faceKey);
    const faceFill=new THREE.DirectionalLight(0xb49c83,.22);
    faceFill.position.set(2,-1.2,1.5);scene.add(faceFill);
    scene.add(new THREE.HemisphereLight(0xe0c3a4,0x010203,.12));

    const cyan=new THREE.PointLight(0xc7a67c,2.8,12,2);
    cyan.position.set(-3.5,2.4,4.2);
    scene.add(cyan);

    const red=new THREE.PointLight(0xc09a76,1.1,10,2);
    red.position.set(3.4,-1.5,3.1);
    scene.add(red);

    const rim=new THREE.PointLight(0xffead3,2.2,9,2);
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
      if (obj.material.emissive) {
        if (name.includes('Ice')) obj.material.emissive.setRGB(.035,.72,1.25);
        else obj.material.emissive.setRGB(.018,.52,1.0);
      }
      obj.material.emissiveIntensity=name.includes('Ice')?.72:.62;
      obj.material.toneMapped=false;
      obj.material.userData.travisBaseEmission=obj.material.emissiveIntensity;
      markBloom(obj);
    }

    if (name.includes('EmissiveRed')) {
      obj.material.emissive?.setRGB(1.12,.018,.07);
      obj.material.emissiveIntensity=.68;
      obj.material.toneMapped=false;
      obj.material.userData.travisBaseEmission=obj.material.emissiveIntensity;
      markBloom(obj);
    }

    if (name.includes('EmissiveWhite')) {
      obj.material.emissive?.setRGB(.7,1.05,1.32);
      obj.material.emissiveIntensity=.7;
      obj.material.toneMapped=false;
      obj.material.userData.travisBaseEmission=obj.material.emissiveIntensity;
      markBloom(obj);
    }

    if (name==='CoreEnergy') {
      obj.material.emissive?.setRGB(.025,.58,1.12);
      obj.material.emissiveIntensity=.62;
      obj.material.toneMapped=false;
      obj.material.userData.travisBaseEmission=obj.material.emissiveIntensity;
      energyMesh=obj;
      markBloom(obj);
    }

    if (name==='CoreGlass') {
      hologramMaterial=hologramShader();
      obj.material=hologramMaterial;
      glassMesh=obj;
      markBloom(obj);
    }

    if (obj.name==='Emblem') {
      emblem=obj;
      markBloom(obj);
    }
  }

  function createCommandNode({label,panel,icon:iconKey,color=0xd6b180}) {
    const group=new THREE.Group();
    group.userData.panel=panel;

    const plateMat=new THREE.MeshPhysicalMaterial({
      color:0x09151b,metalness:.62,roughness:.28,clearcoat:.7,
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
    markBloom(edges);
    group.add(edges);

    const accent=new THREE.Mesh(
      new THREE.PlaneGeometry(.055,.36),
      new THREE.MeshBasicMaterial({
        color,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,
        depthWrite:false
      })
    );
    accent.position.set(-.59,0,.038);
    markBloom(accent);
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
    createCommandNode({label:'SEO',panel:'seo',icon:'seo',color:0xdab684});
    createCommandNode({label:'AGENTES',panel:'agentes',icon:'agents',color:0xa78369});

    commandLines=commandNodes.map((node)=>{
      const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
      const mat=new THREE.LineBasicMaterial({
        color:node.group.userData.panel==='agentes'?0xa78369:0xd5b68f,
        transparent:true,opacity:0,blending:THREE.AdditiveBlending
      });
      const line=markBloom(new THREE.Line(geo,mat));
      commandRoot.add(line);
      return line;
    });
    layoutCommands();
  }

  function layoutCommands() {
    if (!commandNodes.length) return;
    const portrait=innerWidth/innerHeight < .72;
    const compact=innerWidth<700;
    const positions=portrait
      ? (compact
          ? [
              [-1.18,.88,.48],
              [1.18,.88,.48],
              [-1.18,-.98,.34],
              [1.18,-.98,.34]
            ]
          : [
              [-1.45,.95,.5],
              [1.45,.95,.5],
              [-1.42,-1.08,.38],
              [1.42,-1.08,.38]
            ])
      : [
          [-2.55,1.1,.45],
          [2.55,1.1,.45],
          [-2.2,-1.5,.35],
          [2.2,-1.5,.35]
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
      commandLines[i].material.opacity=0;
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
    // Sharper contours on the phone while bounding the full-screen pixel budget.
    const dpr=Math.min(devicePixelRatio||1,1.75,Math.max(1,Math.sqrt(1600000/(w*h))));
    camera.aspect=w/h;
    sizeForViewport();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w,h,false);
    bloomComposer?.setPixelRatio(Math.min(dpr,1));
    bloomComposer?.setSize(Math.round(w*.7),Math.round(h*.7));
    finalComposer?.setPixelRatio(dpr);
    finalComposer?.setSize(w,h);
    finalPass?.uniforms?.uResolution?.value.set(w*dpr,h*dpr);
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
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();webglLost=true;
      setLoading('A recuperar a imagem 3D…');
    });
    canvas.addEventListener('webglcontextrestored',()=>{
      webglLost=false;resize();lastFrame=performance.now();
      setLoading('BUSTO 3D PRONTO',true);
    });
    renderer.setClearColor(0x030405,1);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=.98;

    scene=new THREE.Scene();
    conceptProjection=createConceptProjection(THREE,{reducedMotion});
    conceptProjection.setSource(()=>realFaceHead||coreRoot);
    scene.add(conceptProjection.root);
    // No secondary solid overlay: every projected shape uses the shared matter.
    conceptProjection.root.traverse(obj=>{if(obj.isPoints)obj.layers.enable(BLOOM_LAYER);});
    if(pendingConcept)conceptProjection.show(pendingConcept,performance.now()/1000,pendingSubject);
    scene.background=new THREE.Color(0x030405);
    scene.fog=new THREE.FogExp2(0x030405,.045);

    camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,60);
    conceptProjection.setCamera(()=>camera);
    camera.position.set(0,.3,9);
    camera.lookAt(0,.2,0);

    pmrem=new THREE.PMREMGenerator(renderer);
    const env=new RoomEnvironment();
    scene.environment=pmrem.fromScene(env,.04).texture;
    env.dispose();

    createLights();
    createAtmosphere();
    cinematicBacklight=createBacklight(THREE,scene);
    hud.dataset.backlight="cinematic";

    bloomComposer=new EffectComposer(renderer);
    bloomComposer.renderToScreen=false;
    bloomComposer.addPass(new RenderPass(scene,camera));
    bloomPass=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.62,.38,.18);
    bloomComposer.addPass(bloomPass);

    finalComposer=new EffectComposer(renderer);
    finalComposer.addPass(new RenderPass(scene,camera));
    finalPass=finalFxPass();
    finalPass.uniforms.bloomTexture.value=bloomComposer.renderTarget2.texture;
    finalComposer.addPass(finalPass);
    finalComposer.addPass(new OutputPass());

    setLoading('Assembling the visual core…');
    const loader=new GLTFLoader();
    const gltf=await loader.loadAsync('./assets/travis/travis-core.glb?v=1');

    coreRoot=new THREE.Group();
    model=gltf.scene;
    model.traverse((obj)=>{
      materialTune(obj);
      if (/^Rotor_\d+$/.test(obj.name) || obj.name==='Rotor_Ticks') rotors.push(obj);
      if (obj.name==='Emblem') emblem=obj;
    });
    rotors.forEach((rotor)=>{
      rotor.userData.baseRotX=rotor.rotation.x;
      rotor.userData.baseRotY=rotor.rotation.y;
      rotor.userData.emissiveMaterials=[];
      rotor.traverse((child)=>{
        if (!child.isMesh || !child.material) return;
        const mats=Array.isArray(child.material)?child.material:[child.material];
        mats.forEach((mat)=>{
          if (mat?.userData?.travisBaseEmission!=null) rotor.userData.emissiveMaterials.push(mat);
        });
      });
    });
    model.visible=false; // The neural field is the core; retain the legacy asset only for compatibility.
    coreRoot.add(model);
    scene.add(coreRoot);
    createCoreHit();
    await createAdaptiveForms();
    neuralField=createNeuralField(THREE,{reducedMotion,compact:innerWidth<700});
    scene.add(neuralField.root);
    hud.dataset.neuralField="functional-brain";
    createCommands();

    sizeForViewport();
    resize();
    setLoading('VISUAL CORE ONLINE',true);
    ready=true;
  }

  function stateBloom() {
    if (formBlend.face>.5) return .28+(state==='speaking'?speechLevel*.04:0);
    if (state==='booting') return .72;
    if (state==='listening') return .76;
    if (state==='thinking') return .88;
    if (state==='speaking') return .94;
    return .62;
  }

  function renderComposed(t) {
    const background=scene.background;
    scene.traverse(object=>{
      if(!object.visible || !(object.isMesh || object.isLine || object.isPoints) || bloomLayer.test(object.layers)) return;
      bloomRestore.set(object,{material:object.material,visible:object.visible});
      if(object.isMesh && object.material?.depthWrite && !object.material?.transparent) object.material=object.material.userData?.bloomOccluder||bloomOccluder;
      else object.visible=false;
    });
    camera.layers.set(0);
    scene.background=new THREE.Color(0x000000);
    try { bloomComposer.render(); }
    finally {
      bloomRestore.forEach((saved,object)=>{object.material=saved.material;object.visible=saved.visible;});
      bloomRestore.clear();
    }

    camera.layers.set(0);
    scene.background=background;
    finalPass.uniforms.bloomTexture.value=bloomComposer.renderTarget2.texture;
    finalPass.uniforms.uTime.value=t;
    finalPass.uniforms.uGlitch.value=glitchPower;
    finalPass.uniforms.uFlash.value=flashPower;
    finalPass.uniforms.uAberration.value=.00048+glitchPower*.0017+(state==='speaking'?.00013:0);
    finalPass.uniforms.uGrain.value=formBlend.face>.5?.011:(innerWidth<700?.016:.019);
    finalPass.uniforms.uScan.value=formBlend.face>.5?.005:(innerWidth<700?.018:.022);
    finalComposer.render();
  }

  function animate(now) {
    requestAnimationFrame(animate);
    if (!ready || !renderer || !bloomComposer || !finalComposer) return;
    if (!opened || webglLost || renderer.getContext().isContextLost()) { lastFrame=now; return; }
    // Prioritise recognition/inference/TTS on the phone; DOM status remains live.
    // Keep rendering the hologram while reasoning; stopping the frame loop can blank the WebGL layer on Android.
    // When the camera is open, reserve CPU for uninterrupted speech.
    if(voiceSource&&vision.diagnostics().active&&now-lastVisualPaint<34)return;
    lastVisualPaint=now;
    const dt=Math.min(.05,(now-lastFrame)/1000);
    lastFrame=now;

    const t=(now-startTime)/1000;
    if (opened) intro=clamp(t/1.35,0,1);
    else intro=Math.max(0,intro-dt*2.4);
    const introEase=easeOutCubic(intro);

    const projection=hologramPresentation.sample(now/1000);
    conceptProjection?.update(now/1000,projection,speechLevel);
    const visibleProjection=visibleProjectionAmount(
      projection.amount,conceptProjection?.state?.());
    // Keep the face visible until the particle hologram is actually drawn.
    // This avoids an empty stage during slow voice / geometry startup.

    if (now>nextGlitchAt) {
      glitchPower=formBlend.face>.1?0:(state==='thinking'?.15:.06);
      nextGlitchAt=now+4200+Math.random()*7600;
    }
    glitchPower*=Math.exp(-dt*18);
    flashPower*=Math.exp(-dt*6.5);

    // Mouth movement follows the exact AudioContext playback position; no timer drift.
    if(speechClock&&speechClock.source===voiceSource){
      externalVoiceLevel=speechEnvelopeLevel(speechClock.envelope,
        speechClock.context.currentTime-speechClock.start);
    }
    const targetVoice=state==='speaking'?(externalVoiceLevel||0):0;
    speechLevel+=(targetVoice-speechLevel)*(1-Math.exp(-dt*(targetVoice>speechLevel?30:22)));
    presencePose=presenceMotion.update(dt,state,speechLevel,visibleProjection);
    const observedFace=vision.pose();
    // Low-pass gaze tracking dampens jitter and returns gently to centre when no face is visible.
    const trackingBlend=Math.min(1,dt*4);
    visionLook.x=lerp(visionLook.x,observedFace?.x||0,trackingBlend);
    visionLook.y=lerp(visionLook.y,observedFace?.y||0,trackingBlend);
    presencePose.yaw-=visionLook.x*.28;
    presencePose.pitch-=visionLook.y*.13;
    presencePose.eyeX-=visionLook.x*.17;
    presencePose.eyeY-=visionLook.y*.12;
    hud.style.setProperty('--travis-speech',state==='speaking'?speechLevel.toFixed(3):'0');

    // Long-running processing reveals the observed particle network.
    // Exponential blends are frame-rate-independent on mobile screens.
    if(now-lastAutoFormCheck>180){
      lastAutoFormCheck=now;
      syncAutoForm(state,now);
    }
    for (const key of ['core','face']) {
      formBlend[key]=nextFormBlend(formBlend[key],formTarget[key],dt,{reducedMotion});
    }

    if (coreRoot) {
      const baseScale=(innerWidth/innerHeight<.72?.47:.70)*(.35+.65*introEase);
      const speechExpand=state==='speaking'?speechLevel*.045:0;
      const coreScale=Math.max(.001,formBlend.core*(1-visibleProjection));
      coreRoot.visible=coreScale>.012;
      coreRoot.scale.setScalar(baseScale*(1+speechExpand)*coreScale);
      coreRoot.rotation.x=lerp(-.24,-.08,introEase);
      coreRoot.rotation.y=reducedMotion?0:Math.sin(t*.24)*.045;
      coreRoot.rotation.z=Math.sin(t*.12)*.01;

      const baseY=innerWidth/innerHeight<.72?.62:.35;
      coreRoot.position.y=baseY + (1-introEase)*-.55;
      coreRoot.position.x=0;

      const speedBoost=state==='listening'?2.45:state==='thinking'?1.95:state==='speaking'?1.48:1;
      rotors.forEach((r,i)=>{
        const direction=i%2?1:-1;
        const speed=(.055+i*.017)*speedBoost;
        r.rotation.z += direction*speed*dt;
        r.rotation.x=(r.userData.baseRotX||0)+Math.sin(t*.36+i*.72)*.014;
        r.rotation.y=(r.userData.baseRotY||0)+Math.cos(t*.31+i*.51)*.011;

        let targetScale=1;
        if (state==='listening') targetScale=.948+i*.004;
        if (state==='thinking') targetScale=1+Math.sin(t*3.8-i*.82)*.026;
        if (state==='speaking') targetScale=1+speechLevel*.017;
        const rs=lerp(r.scale.x,targetScale,Math.min(1,dt*8));
        r.scale.setScalar(rs);

        const energyWave=.5+.5*Math.sin(t*4.0-i*.88);
        (r.userData.emissiveMaterials||[]).forEach((mat)=>{
          const base=mat.userData.travisBaseEmission||1;
          const boost=state==='thinking'?energyWave*.82:
                      state==='listening'?.22:
                      state==='speaking'?speechLevel*.54:0;
          mat.emissiveIntensity=base*(1+boost)+flashPower*.12;
        });
      });

      if (energyMesh) {
        const pulse=state==='speaking'
          ? 1+speechLevel*.105+flashPower*.055
          : 1+Math.sin(t*2.5)*.025;
        energyMesh.scale.setScalar(pulse);
        if (energyMesh.material?.userData?.travisBaseEmission!=null) {
          const base=energyMesh.material.userData.travisBaseEmission;
          energyMesh.material.emissiveIntensity=base*(1+(state==='thinking'?.45:0)+(state==='speaking'?speechLevel*.7:0))+flashPower*.4;
        }
      }
      if (emblem) emblem.position.z=Math.sin(t*1.7)*.015+flashPower*.025;
    }

    const neuralBackdrop=scene.getObjectByName('TravisCinematicBacklight');
    if(neuralBackdrop)neuralBackdrop.visible=formBlend.face>.5;
    cinematicBacklight?.update(reducedMotion?0:t,state==='speaking'?speechLevel:0);
    faceRig?.update(state==='speaking'?speechLevel:0,null);
    hud.dataset.mouthLevel=speechLevel.toFixed(2);
    if (faceRoot) {
      const faceMix=Math.max(.001,formBlend.face);
      faceRoot.visible=faceMix>.012 && visibleProjection<.999;
      const portrait=innerWidth/innerHeight<.72;
      const faceBase=(portrait?1.65:1.70);
      faceRoot.scale.setScalar(faceBase*faceMix);
      faceRoot.position.set(0,(portrait?.86:.52)+presencePose.lift,0);
      faceRoot.rotation.set(presencePose.pitch,presencePose.yaw,presencePose.roll);

      faceEyeGroups.forEach(eye=>{
        eye.rotation.y=presencePose.eyeX;
        eye.rotation.x=presencePose.eyeY;
      });
      if (realFaceBaseMaterial) {
        const build=reducedMotion?1:clamp(t/2.4,0,1);
        for(const mat of [realFaceBaseMaterial,avatarMaterial,...holographicEyeMaterials]){
          mat.uniforms.uTime.value=t;mat.uniforms.uBuild.value=build;
          mat.uniforms.uDissolve.value=Math.max(visibleProjection,
            Math.min(1,(1-formBlend.face)*.93));
          mat.uniforms.uState.value=state==='speaking'?speechLevel:0;
        }
        assemblyParticles.material.uniforms.uBuild.value=build;
        assemblyParticles.material.uniforms.uTime.value=t;
        assemblyParticles.material.uniforms.uDissolve.value=Math.max(visibleProjection,
          Math.min(1,(1-formBlend.face)*.93));
        hud.dataset.materialization=build.toFixed(2);
      }
      if (avatarMaterial) {
        avatarMaterial.uniforms.uTime.value=t;
        avatarMaterial.uniforms.uGlitch.value=0;
        avatarMaterial.uniforms.uState.value=state==='speaking'?.95:state==='listening'?.78:state==='thinking'?.62:.24;
        avatarMaterial.uniforms.uOpacity.value=.32+(state==='speaking'?speechLevel*.02:state==='listening'?.012:0);
      }
    }

    neuralField?.update({time:t,dt,state,voice:speechLevel,core:formBlend.core,face:formBlend.face,
      faceRoot,intro:introEase,projection:visibleProjection,portrait:innerWidth/innerHeight<.72,
      pixelRatio:renderer.getPixelRatio()});

    if (hologramMaterial) {
      hologramMaterial.uniforms.uTime.value=t;
      hologramMaterial.uniforms.uGlitch.value=glitchPower;
      hologramMaterial.uniforms.uState.value=state==='thinking'?1:state==='listening'?.72:state==='speaking'?.86:.18;
      hologramMaterial.uniforms.uOpacity.value=.28+(state==='listening'?.04:state==='thinking'?.06:state==='speaking'?.055:0);
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
    if (commandRoot) commandRoot.visible=false; // Controls live in the accessible front layer.
    updateCommandLines();

    if (dust) {
      dust.visible=formBlend.face<.02;
      dust.rotation.z=t*.006;
      dust.position.y=Math.sin(t*.18)*.08;
    }
    if (orbitParticles) {
      orbitParticles.visible=false;
      orbitParticles.rotation.z=t*.025*(state==='thinking'?1.7:1);
      orbitParticles.rotation.x=Math.sin(t*.18)*.045;
      orbitParticles.material.opacity=.36+(state==='listening'?.09:state==='thinking'?.14:0);
    }
    if (filamentGroup) {
      filamentGroup.children.forEach((line,i)=>{
        line.rotation.z+=line.userData.speed*dt*(state==='thinking'?2.0:1);
        line.material.opacity=(i%3===0?.055:.075)+(state==='thinking'?.055:state==='listening'?.022:0);
      });
    }
    if (gridFloor) {
      gridFloor.position.z=-1.2+Math.sin(t*.16)*.08;
      gridFloor.material.opacity=.06+(state==='thinking'?.035:0);
    }
    if (floorHalo) {
      floorHalo.visible=false;
      floorHalo.material.opacity=.055+.025*Math.sin(t*1.1)+(state==='listening'?.025:0);
      floorHalo.rotation.z=t*.035;
    }
    if (beamTop) beamTop.material.opacity=.0025+.0025*(.5+.5*Math.sin(t*.7))+(state==='thinking'?.0015:0);
    if (beamBottom) beamBottom.material.opacity=.0018+.0018*(.5+.5*Math.sin(t*.6+1));

    if (bloomPass) bloomPass.strength += (stateBloom()-bloomPass.strength)*.055;

    const portrait=innerWidth/innerHeight<.72;
    const cameraBaseZ=lerp(portrait?10.4:8.3,portrait?6.4:6.8,formBlend.face);
    camera.position.x += (0-camera.position.x)*.06;
    camera.position.y += ((portrait?.48:.26)-camera.position.y)*.06;
    camera.position.z += (cameraBaseZ-camera.position.z)*Math.min(1,dt*10);
    camera.lookAt(0,portrait?.48:.26,0);

    renderComposed(t);
    renderedFrames++;
  }

  function rayFromEvent(event) {
    const rect=canvas.getBoundingClientRect();
    pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
    pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
  }

  function interactiveObjects() {
    return [coreHit,faceHit].filter(Boolean);
  }

  function onPointerMove(event) {
    if (!opened || !ready) return;
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
    // A memória selecionada corresponde a um nó SQLite real.
    const memory=neuralField?.pick(raycaster);
    if(memory){neuralField.select(memory.id);haptic(10);return;}
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

  function toggleCommands(force,{automatic=false}={}) {
    if (!ready) return;
    commandsOpen=typeof force==='boolean'?force:!commandsOpen;
    hud.classList.toggle('commands-open',commandsOpen);
    window.dispatchEvent(new CustomEvent('travis:commands',{detail:{open:commandsOpen,automatic}}));
    if(!automatic){haptic(commandsOpen?18:10);pulseTone(commandsOpen);}
  }

  function openHud() {
    if(opened)return;
    opened=true;
    intro=0;
    // Re-entry must never inherit a timed manual brain/network preview.
    manualFormUntil=0;
    if(realFaceReady){
      applyForm('face');
      formBlend.face=1;
      formBlend.core=0;
    }
    commandsOpen=false;
    commandTarget=0;
    hud.classList.add('is-open');
    hud.classList.remove('commands-open');
    hud.setAttribute('aria-hidden','false');
    launcher.setAttribute('aria-expanded','true');
    document.body.classList.add('travis-hud-open');
    window.dispatchEvent(new Event('travis:open'));
    setState('booting');
    bootSound();
    haptic([10,35,10]);
    startTime=performance.now();

    clearTimeout(introVoiceTimer);
    introVoiceTimer=setTimeout(()=>{
      if (opened && state==='booting') startVoiceConversation();
    },1150);
  }

  function closeHud() {
    vision.stop();
    clearTimeout(introVoiceTimer);introVoiceTimer=0;
    stopVoiceConversation();
    faceRig?.update(0);
    window.dispatchEvent(new Event('travis:close'));
    opened=false;
    commandsOpen=false;
    commandTarget=0;
    manualFormUntil=0;
    document.documentElement.classList.remove('travis-entry');
    window.travisDirectEntry=false;
    hud.classList.remove('commands-open','cards-open','is-open');
    hud.setAttribute('aria-hidden','true');
    launcher.setAttribute('aria-expanded','false');
    document.body.classList.remove('travis-hud-open');
    setState('idle');
  }

  function launchHud() {
    if (!IS_LOCAL_TRAVIS_UI) {
      location.assign('http://127.0.0.1:8770/?travis=1');
      return;
    }
    openHud();
  }

  launcher.addEventListener('click',launchHud);
  document.getElementById('travis-voice-start')?.addEventListener('click',()=>{
    const ac=audio();
    Promise.resolve(ac?.resume()).then(()=>startVoiceConversation({greet:false})).catch(()=>setState('ready','Não foi possível ativar o áudio.'));
  });
  closeButton?.addEventListener('click',closeHud);
  canvas.addEventListener('pointermove',onPointerMove,{passive:true});
  canvas.addEventListener('pointerdown',onPointerDown,{passive:true});
  canvas.addEventListener('pointerup',onPointerUp,{passive:true});
  canvas.addEventListener('pointercancel',()=>{pointerDown=null},{passive:true});
  addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(resize,80);
  },{passive:true});
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'&&commandsOpen){toggleCommands(false);return;}
    if (event.key==='Escape' && opened) closeHud();
  });

  setInterval(updateClock,30000);
  updateClock();

  window.TravisVisual=Object.freeze({
    open:launchHud,
    close:closeHud,
    commands:toggleCommands,
    selectProject(project){if(["centro","pentehouse","best-pizza","2-irmaos","beatriz"].includes(project))activeProject=project;},
    ask(text){if(!opened)return;voicePaused=false;stopVoiceConversation();scheduleInitiative();handleVoiceBlob(String(text),'',voiceSession);},
    pause(){voicePaused=true;stopVoiceConversation();faceRig?.update(0);setState('ready','Conversation paused.');},
    resume(){voicePaused=false;if(opened)startVoiceConversation({greet:false});},
    setState,
    diagnostics() {
      return {ready,opened,state,renderedFrames,contextLost:renderer?.getContext().isContextLost(),form:activeForm,faceAsset:hud.dataset.faceAsset,
        avatar:{visible:Boolean(faceRoot?.visible),dissolve:realFaceBaseMaterial?.uniforms.uDissolve.value??0},
        baseBloom:realFaceHead?.layers.isEnabled(BLOOM_LAYER),lipSync:{engine:hud.dataset.lipSync,audioContext:audioContext?.state,playbackClock:speechClock?{elapsed:speechClock.context.currentTime-speechClock.start,duration:speechClock.envelope.duration}:null},
        neural:neuralField?.diagnostics(),
        presence:{...presencePose},projection:hologramPresentation.sample(performance.now()/1000),
        media:window.TravisProjection?.media(),
        hologram:conceptProjection?.state?.(),motionAudio:motionAudio.status(),projectionControl:window.TravisProjection?.status?.(),
        meshes:realFaceModel?.children.map(o=>o.name),voiceBusy,voiceInput:voiceInput?.diagnostics(),vision:vision.diagnostics(),replyLanguage,inputLanguage,preferredLanguage,uiLanguage,visualModePolicy:'automatic',standby,proactive,voicePaused,
        recording:voiceRecorder?.state,pendingTasks:[...pendingVoiceTasks.keys()],lastTaskResult:lastVoiceTaskResult,voiceMetrics:voiceMetrics.map(m=>({...m}))};
    },
    form(mode='auto') {
      setForm(mode,{manual:mode!=='auto'});
      return activeForm;
    },
    interfaceLanguage(language) {
      return typeof language==='string'?setInterfaceLanguage(language):uiLanguage;
    },
    ready(message='I’m here.') {
      if (!opened) openHud();
      setState('ready',message);
    },
    listen(message='Listening.') {
      if (!opened) openHud();
      setState('listening',message);
    },
    think(message='Processing.') {
      if (!opened) openHud();
      setState('thinking',message);
    },
    speak(message='Responding.') {
      if (!opened) openHud();
      setState('speaking',message);
    },
    setVoiceLevel(level=0) {
      externalVoiceLevel=clamp(Number(level)||0,0,1);
    },
    clearVoiceLevel() {
      externalVoiceLevel=null;
    }
  });

  // Keeps existing Centro callbacks from opening a second/legacy Travis.
  window.TravisPanel={
    open:launchHud,
    completeTask(id,text) {
      if (opened) setState('ready',text?'Task completed.':'Ready.');
    }
  };

  // The HUD is already visible from first paint; never wait for GLB downloads.
  if(window.travisDirectEntry)openHud();
  init3D().then(()=>{
    if(opened){intro=0;startTime=lastFrame=performance.now();}
  }).catch((error)=>{
    console.error('Travis 3D:',error);
    setLoading('Failed to load the 3D core');
    setState('ready','3D interface unavailable.');
  });

  requestAnimationFrame(animate);
}
