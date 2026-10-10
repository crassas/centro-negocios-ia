// Vision Tracker integration: one camera, one model set, fresh observations only.
// Images remain in this browser. Only validated labels/positions reach dialogue.
import { facePosition, gestureDecision, faceColourFromPixels } from './travis-vision-policy.mjs?v=objects-1';
import { INTERFACE_COPY, visionStatusCopy } from './travis-interface-language.mjs?v=1';
import { SceneTracker, normalizedDetections, describeScene, objectName } from './travis-scene-tracker.mjs?v=1';

export function createTravisVision({ onGesture=()=>{}, onPose=()=>{}, onScene=()=>{}, isSpeechCritical=()=>false,
  loadModelBundle=()=>import('./vendor/mediapipe/vision_bundle.mjs') }={}) {
  const button=document.getElementById('travis-camera-toggle');
  const label=document.getElementById('travis-camera-state');
  const preview=document.getElementById('travis-camera-preview');
  const dock=document.getElementById('travis-camera-dock');
  let stream=null,recognizer=null,faceDetector=null,objectDetector=null,fileset=null,modelsLoading=null;
  let active=false,opening=null,generation=0,animation=0,releaseTimer=0;
  let facingMode='environment',requestedFacing='environment',facingVerified=false;
  let lastGestureAt=0,lastFaceAt=0,lastObjectAt=0,lastVideoTime=-1,slowFrame=false;
  let pose=null,lastPoseAt=0,observedGesture='None',gestureObservedAt=0,frames=0;
  let observedAt=0,objectObservedAt=0,objectStatus='loading',faceColour=null,lastColourAt=0;
  let labelText='Câmara desligada',narration=true,destroyed=false;
  const state={name:null,since:0,latched:false,lastActionAt:-3000};
  const tracker=new SceneTracker();
  const locale=()=>dock?.closest('#travis-hud')?.dataset.uiLanguage==='pt'?'pt':'en';
  const sampleCanvas=document.createElement('canvas');sampleCanvas.width=sampleCanvas.height=80;
  const sampleContext=sampleCanvas.getContext('2d',{willReadFrequently:true});
  const stage=document.createElement('div');stage.className='travis-vision-stage';
  const overlay=document.createElement('canvas');overlay.className='travis-vision-overlay';
  overlay.setAttribute('aria-label','Select a detected object');
  const drawContext=overlay.getContext('2d');
  const switchButton=document.createElement('button');switchButton.type='button';switchButton.className='travis-camera-switch';
  switchButton.id='travis-camera-switch';
  if(dock&&preview){stage.append(preview,overlay);dock.append(switchButton,stage);}

  function setLabel(message){labelText=message;if(label)label.textContent=visionStatusCopy(message,locale());}
  function updateControls(){
    if(button){button.disabled=Boolean(opening);button.setAttribute('aria-pressed',String(active));button.textContent=active?INTERFACE_COPY[locale()].cameraDisable:INTERFACE_COPY[locale()].cameraEnable;}
    switchButton.disabled=Boolean(opening);
    switchButton.textContent=locale()==='pt'?'Trocar câmara':'Switch camera';
    switchButton.setAttribute('aria-label',locale()==='pt'?'Trocar entre câmara frontal e traseira':'Switch front and rear camera');
    if(dock){dock.dataset.active=String(active);dock.dataset.facing=facingMode;}
  }
  function snapshot(){
    const now=Date.now(),scene=active?tracker.snapshot(now):{objects:[],selectedTarget:null};
    return {active,version:'vision-tracker-1',source: 'on-device-mediapipe',observedAt:active?observedAt:0,
      objectObservedAt:active?objectObservedAt:0,facingMode:active?facingMode:null,facingVerified,
      faceDetected:active&&!!pose&&now-lastPoseAt<2200,
      faceObservedAt:active?lastPoseAt:0,
      faceColor:active&&pose&&faceColour&&now-faceColour.observedAt<2200?{...faceColour}:null,
      gesture:active&&now-gestureObservedAt<1200?observedGesture:'None',gestureObservedAt,
      objects:scene.objects,selectedTarget:scene.selectedTarget,objectModel:objectStatus,frames,narration};
  }
  function paint(){
    if(!drawContext)return;
    const w=overlay.width,h=overlay.height;drawContext.clearRect(0,0,w,h);
    if(!active)return;
    const scene=snapshot();
    drawContext.font='500 15px system-ui';drawContext.lineWidth=1.4;
    for(const object of scene.objects){
      const b=object.box,x=(facingMode==='user'?1-b.x-b.width:b.x)*w,y=b.y*h,bw=b.width*w,bh=b.height*h;
      const selected=object.id===scene.selectedTarget?.id;
      drawContext.strokeStyle=selected?'#e9c69a':'#e8e1d4';
      const corner=Math.min(16,bw/3,bh/3);
      drawContext.beginPath();
      for(const [cx,cy,sx,sy] of [[x,y,1,1],[x+bw,y,-1,1],[x,y+bh,1,-1],[x+bw,y+bh,-1,-1]]){
        drawContext.moveTo(cx,cy+sy*corner);drawContext.lineTo(cx,cy);drawContext.lineTo(cx+sx*corner,cy);
      }
      drawContext.stroke();
      const name=(selected?'• ':'')+objectName(object.name,locale())+(object.score<.7?' ?':'');
      const textWidth=Math.min(w-8,drawContext.measureText(name).width+14),tx=Math.max(4,Math.min(w-textWidth-4,x)),ty=Math.max(21,y);
      drawContext.fillStyle='rgba(14,13,12,.8)';drawContext.fillRect(tx,ty-20,textWidth,23);
      drawContext.fillStyle=selected?'#f3d6af':'#eee9df';drawContext.fillText(name,tx+7,ty-3);
    }
  }
  function publish(){
    const s=snapshot();
    if(active&&objectStatus==='ready'){
      const side=!facingVerified?(locale()==='pt'?'Câmara':'Camera'):facingMode==='environment'?(locale()==='pt'?'Câmara traseira':'Rear camera'):(locale()==='pt'?'Câmara frontal':'Front camera');
      setLabel(side+' · '+s.objects.length+(locale()==='pt'?' deteções':' detections'));
    }
    paint();onScene(s);
  }
  async function prepareModels(){
    if(modelsLoading)return modelsLoading;
    modelsLoading=(async()=>{
      const {FilesetResolver,GestureRecognizer,FaceDetector,ObjectDetector}=await loadModelBundle();
      if(!fileset)fileset=await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
      if(!objectDetector){
        objectStatus='loading';
        try{
          objectDetector=await ObjectDetector.createFromOptions(fileset,{
            baseOptions:{modelAssetPath:'./vendor/mediapipe/efficientdet_lite0.tflite',delegate:'CPU'},
            runningMode:'VIDEO',scoreThreshold:.5,maxResults:12
          });objectStatus='ready';
        }catch(error){objectStatus='unavailable';console.warn('Travis object model:',error.message);}
      }
      if(!recognizer)try{
        recognizer=await GestureRecognizer.createFromOptions(fileset,{
          baseOptions:{modelAssetPath:'./vendor/mediapipe/gesture_recognizer.task',delegate:'CPU'},
          runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.65,minTrackingConfidence:.6
        });
      }catch(error){console.warn('Travis gesture model:',error.message);}
      if(!faceDetector)try{
        faceDetector=await FaceDetector.createFromOptions(fileset,{
          baseOptions:{modelAssetPath:'./vendor/mediapipe/blaze_face_short_range.tflite',delegate:'CPU'},
          runningMode:'VIDEO',minDetectionConfidence:.65
        });
      }catch(error){console.warn('Travis face model:',error.message);}
    })().finally(()=>{modelsLoading=null;});
    return modelsLoading;
  }
  function disposeModels(){
    if(modelsLoading){modelsLoading.finally(()=>{if(!active&&!opening)disposeModels();}).catch(()=>{});return;}
    for(const model of [recognizer,faceDetector,objectDetector])try{model?.close();}catch{}
    recognizer=faceDetector=objectDetector=null;objectStatus='loading';
  }
  function inspectFaceColour(result){
    const b=result?.detections?.[0]?.boundingBox;
    if(!b||!sampleContext||!preview?.videoWidth)return null;
    const x=Math.max(0,b.originX),y=Math.max(0,b.originY);
    const w=Math.min(preview.videoWidth,x+b.width)-x,h=Math.min(preview.videoHeight,y+b.height)-y;
    if(w<35||h<35)return null;
    sampleContext.drawImage(preview,x,y,w,h,0,0,80,80);
    const color=faceColourFromPixels(sampleContext.getImageData(0,0,80,80).data,80,80);
    return color?{...color,observedAt:Date.now()}:null;
  }
  function frame(timestamp){
    if(!active||!stream||document.hidden)return;
    animation=requestAnimationFrame(frame);
    // Only one synchronous model task per frame. Keep camera visible during voice.
    if(isSpeechCritical()||preview?.readyState<2||!preview?.videoWidth||preview.currentTime===lastVideoTime)return;
    lastVideoTime=preview.currentTime;
    const started=performance.now(),now=Date.now();let inferred=false;
    try{
      if(objectDetector&&timestamp-lastObjectAt>=(slowFrame?1400:800)){
        lastObjectAt=timestamp;
        const result=objectDetector.detectForVideo(preview,timestamp);
        tracker.update(normalizedDetections(result,preview.videoWidth,preview.videoHeight),now);
        objectObservedAt=now;inferred=true;publish();
      }else if(recognizer&&timestamp-lastGestureAt>=(slowFrame?400:180)){
        lastGestureAt=timestamp;
        const found=recognizer.recognizeForVideo(preview,timestamp);
        const category=found?.gestures?.[0]?.[0];
        observedGesture=category?.score>=.65?category.categoryName:'None';gestureObservedAt=now;
        const target=tracker.hand(found?.landmarks?.[0],now);
        if(target){publish();}
        // Point/pinch selects objects; existing hand poses remain UI-only.
        const decision=gestureDecision(found,timestamp,state);
        if(decision&&!target)onGesture(decision.action);
        inferred=true;
      }else if(faceDetector&&timestamp-lastFaceAt>=(facingMode==='environment'?2400:1100)){
        lastFaceAt=timestamp;
        const result=faceDetector.detectForVideo(preview,timestamp);
        pose=facePosition(result,preview.videoWidth,preview.videoHeight);lastPoseAt=now;onPose(pose);
        if(pose&&timestamp-lastColourAt>1700){lastColourAt=timestamp;faceColour=inspectFaceColour(result);}
        if(!pose)faceColour=null;inferred=true;
      }
    }catch(error){console.warn('Travis vision frame:',error.message);}
    if(inferred){observedAt=now;frames++;slowFrame=performance.now()-started>100;}
    paint();
  }
  function stop(){
    generation++;active=false;
    if(animation)cancelAnimationFrame(animation);animation=0;
    const old=stream;stream=null;old?.getTracks().forEach(track => track.stop());
    if(preview){preview.pause();preview.srcObject=null;}
    pose=null;faceColour=null;frames=0;observedAt=objectObservedAt=lastPoseAt=gestureObservedAt=0;
    observedGesture='None';tracker.reset();state.name=null;state.latched=false;onPose(null);
    setLabel('Câmara desligada');paint();updateControls();onScene(snapshot());
    clearTimeout(releaseTimer);releaseTimer=setTimeout(()=>{if(!active&&!opening)disposeModels();},30000);
  }
  async function start(requested=requestedFacing){
    if(destroyed)throw new Error('Vision session closed');
    const desired=requested==='user'?'user':'environment';
    if(active&&!opening&&facingMode===desired)return true;
    if(opening&&requestedFacing===desired)return opening;
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('A câmara requer localhost ou HTTPS.');
    const previous=opening;stop();requestedFacing=desired;
    clearTimeout(releaseTimer);const attempt=++generation;
    const task=(async()=>{
      if(previous)await previous.catch(()=>false);
      if(attempt!==generation)return false;
      let candidate;
      try{
        setLabel('A pedir autorização…');
        const video={width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:24}};
        // Never silently report a front camera as the requested rear camera.
        const supportsFacing=navigator.mediaDevices.getSupportedConstraints?.().facingMode===true;
        candidate=await navigator.mediaDevices.getUserMedia({audio: false,video:{...video,facingMode:supportsFacing?{exact:desired}:{ideal:desired}}});
        if(attempt!==generation){candidate.getTracks().forEach(track => track.stop());return false;}
        const track=candidate.getVideoTracks()[0],settings=track?.getSettings?.()||{};
        if(settings.facingMode&&settings.facingMode!==desired)throw new Error('A câmara pedida não está disponível.');
        facingVerified=settings.facingMode===desired||supportsFacing;
        facingMode=settings.facingMode||desired;
        if(!preview)throw new Error('Pré-visualização indisponível.');
        stream=candidate;preview.srcObject=candidate;await preview.play();
        if(attempt!==generation){candidate.getTracks().forEach(track => track.stop());return false;}
        track?.addEventListener('ended',()=>{if(attempt===generation){stop();setLabel('Câmara interrompida · toca para retomar');}},{once:true});
        const vw=preview.videoWidth||640,vh=preview.videoHeight||480;
        stage.style.aspectRatio=String(vw/vh);overlay.width=640;overlay.height=Math.round(640*vh/vw);
        // Device video FIRST. Optional camera analysis runs in the background.
        // Do not turn off a working preview because MediaPipe loads slowly.
        active=true;updateControls();setLabel('Câmara ativa · vídeo local');
        lastVideoTime=-1;lastGestureAt=lastFaceAt=lastObjectAt=0;
        animation=requestAnimationFrame(frame);publish();
        void prepareModels().then(()=>{
          if(attempt!==generation||!active)return;
          setLabel(objectDetector?'Câmara ativa · vídeo e objetos':'Câmara ativa · vídeo local');
          publish();
        }).catch(error=>{
          console.warn('Optional vision models unavailable:',error.message);
          objectStatus='unavailable';
          if(attempt===generation&&active)setLabel('Câmara ativa · vídeo local');
        });
        return true;
      }catch(error){
        candidate?.getTracks().forEach(track => track.stop());
        if(attempt===generation){stop();setLabel('Câmara: '+(error.name==='NotAllowedError'?'permissão recusada':error.message));}
        throw error;
      }
    })();
    opening=task;updateControls();
    try{return await task;}finally{if(opening===task)opening=null;updateControls();}
  }
  async function toggle(){if(active||opening){stop();return false;}return start();}
  async function switchCamera(){return start(requestedFacing==='environment'?'user':'environment');}
  async function waitForObservation(timeout=4500){
    const attempt=generation,started=performance.now();
    while(active&&attempt===generation&&performance.now()-started<timeout){
      const s=snapshot();if(s.objects.length||objectStatus==='unavailable')return s;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    return snapshot();
  }
  const onToggle=()=>toggle().catch(error=>console.warn('Travis camera:',error.message));
  const onSwitch=()=>switchCamera().catch(error=>console.warn('Travis camera:',error.message));
  const onSelect=event=>{
    const r=overlay.getBoundingClientRect();if(!r.width||!r.height)return;
    let x=(event.clientX-r.left)/r.width;const y=(event.clientY-r.top)/r.height;
    if(facingMode==='user')x=1-x;tracker.selectAt(x,y);publish();
  };
  button?.addEventListener('click',onToggle);switchButton.addEventListener('click',onSwitch);overlay.addEventListener('click',onSelect);
  const onLanguage=()=>{setLabel(labelText);updateControls();if(active)publish();};
  window.addEventListener('travis:interface-language',onLanguage);
  let pausedForBackground=false;
  const onVisibility=()=>{
    if(document.hidden&&(active||opening)){pausedForBackground=true;stop();}
    else if(!document.hidden&&pausedForBackground){pausedForBackground=false;setLabel('Câmara em pausa · toca para retomar');}
  };
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('pagehide',stop);
  updateControls();
  return Object.freeze({start,stop,toggle,switchCamera,waitForObservation,snapshot,
    pose:()=>active&&Date.now()-lastPoseAt<2200?pose:null,
    describe:language=>describeScene(snapshot(),language),
    narration:enabled=>{if(typeof enabled==='boolean')narration=enabled;return narration;},
    releaseTarget:()=>{tracker.release();publish();},
    diagnostics:()=>({...snapshot(),opening:Boolean(opening),status:labelText,localOnly:true,version:'vision-tracker-1'}),
    destroy(){destroyed=true;stop();clearTimeout(releaseTimer);disposeModels();button?.removeEventListener('click',onToggle);switchButton.removeEventListener('click',onSwitch);overlay.removeEventListener('click',onSelect);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',stop);window.removeEventListener('travis:interface-language',onLanguage);}
  });
}
