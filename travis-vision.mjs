// Camera vision is opt-in and runs in the current browser. Frames never enter Travis HTTP requests.
import { FilesetResolver, GestureRecognizer, FaceDetector, ObjectDetector } from './vendor/mediapipe/vision_bundle.mjs';
import { facePosition, gestureDecision } from './travis-vision-policy.mjs?v=1';

export function createTravisVision({ onGesture = () => {}, onPose = () => {}, isSpeechCritical = () => false } = {}) {
  const button = document.getElementById('travis-camera-toggle');
  const label = document.getElementById('travis-camera-state');
  const preview = document.getElementById('travis-camera-preview');
  const dock = document.getElementById('travis-camera-dock');
  let stream = null, recognizer = null, faceDetector = null, objectDetector = null, fileset = null;
  let active = false, opening = null, generation = 0, animation = 0;
  let lastGestureAt = 0, lastFaceAt = 0, lastVideoTime = -1, slowFrame = 0;
  let pose = null, lastPoseAt = 0, observedGesture = 'None', frames = 0;
  let observedObjects = [], lastObjectAt = 0, observedAt = 0, objectStatus = 'loading';
  let labelText = 'Câmara desligada';
  const state = { name: null, since: 0, latched: false, lastActionAt: -3000 };
  const setLabel = message => {
    labelText = message;
    if (label) label.textContent = message;
  };
  function updateControls() {
    if (button) {
      button.disabled = Boolean(opening);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? 'Desligar câmara' : 'Ligar câmara';
    }
    if (dock) dock.dataset.active = String(active);
  }
  async function prepareModels() {
    if (!fileset) fileset = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
    if (!recognizer) {
      recognizer = await GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: './vendor/mediapipe/gesture_recognizer.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: .6, minTrackingConfidence: .55
      });
    }
    // Face detection is optional. Gesture mode remains useful if its model fails.
    if (!faceDetector) {
      try {
        faceDetector = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: './vendor/mediapipe/blaze_face_short_range.tflite', delegate: 'CPU' },
          runningMode: 'VIDEO', minDetectionConfidence: .65
        });
      } catch (error) { console.warn('Travis optional face tracking:', error.message); }
    }
    if (!objectDetector && objectStatus !== 'unavailable') {
      try {
        objectDetector = await ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: './vendor/mediapipe/efficientdet_lite0.tflite', delegate: 'CPU' },
          runningMode: 'VIDEO', scoreThreshold: .4, maxResults: 6
        });
        objectStatus = 'ready';
      } catch (error) {
        objectStatus = 'unavailable';
        console.warn('Travis local object detector:', error.message);
      }
    }
  }
  function frame(timestamp) {
    if (!active || !stream || document.hidden) return;
    // MediaPipe runs synchronously on the render thread; pause inference during speech.
    // The granted camera stream remains visible and active throughout playback.
    if (isSpeechCritical()) {
      animation = requestAnimationFrame(frame);
      return;
    }
    if (preview?.readyState >= 2 && preview.videoWidth && preview.currentTime !== lastVideoTime) {
      lastVideoTime = preview.currentTime;
      const startAt = performance.now();
      if (recognizer && timestamp - lastGestureAt >= (slowFrame ? 700 : 360)) {
        lastGestureAt = timestamp;
        try {
          const found = recognizer.recognizeForVideo(preview, timestamp);
          observedGesture = found?.gestures?.[0]?.[0]?.categoryName || 'None';
          const decision = gestureDecision(found, timestamp, state);
          if (decision) {
            onGesture(decision.action);
            setLabel('Gesto: ' + decision.name.replaceAll('_', ' '));
          }
          frames++;
        } catch (error) { setLabel('Gestos indisponíveis'); console.warn('Gesture capture:', error.message); }
      }
      if (faceDetector && timestamp - lastFaceAt > (slowFrame ? 1500 : 750)) {
        lastFaceAt = timestamp;
        try {
          const value = facePosition(faceDetector.detectForVideo(preview, timestamp), preview.videoWidth, preview.videoHeight);
          if (value) { pose = value; lastPoseAt = timestamp; onPose(value); }
        } catch (error) { console.warn('Face tracking:', error.message); }
      }
      if (objectDetector && timestamp - lastObjectAt >= (slowFrame ? 2600 : 1500)) {
        lastObjectAt = timestamp;
        try {
          const result = objectDetector.detectForVideo(preview, timestamp);
          observedObjects = (result?.detections || []).flatMap(det => {
            const cat = det?.categories?.[0];
            const name = String(cat?.categoryName || '').slice(0,48);
            const score = Number(cat?.score || 0);
            return /^[a-zA-Z][a-zA-Z _-]{0,47}$/.test(name) && score >= .4
              ? [{ name, score: Math.round(score*100)/100 }] : [];
          }).slice(0,6);
        } catch (error) { console.warn('Travis object capture:', error.message); }
      }
      observedAt = Date.now();
      slowFrame = performance.now() - startAt > 85 ? 1 : 0;
      if (timestamp - lastPoseAt > 1600) pose = null;
    }
    animation = requestAnimationFrame(frame);
  }
  function stop() {
    generation++;
    active = false;
    if (animation) cancelAnimationFrame(animation);
    animation = 0; pose = null; observedGesture = 'None'; frames = 0;
    observedObjects = []; lastObjectAt = 0; observedAt = 0;
    state.name = null; state.latched = false; onPose(null);
    const previousStream = stream; stream = null;
    previousStream?.getTracks().forEach(track => track.stop());
    if (preview) { preview.pause(); preview.srcObject = null; }
    opening = null;
    setLabel('Câmara desligada');
    updateControls();
  }
  async function start() {
    if (active) return true;
    if (opening) return opening;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error('A câmara requer localhost ou HTTPS e autorização do navegador.');
    const attempt = ++generation;
    setLabel('A pedir autorização…');
    const task = (async () => {
      let candidate;
      try {
        candidate = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 12, max: 15 } }
        });
        if (attempt !== generation) { candidate.getTracks().forEach(track => track.stop()); return false; }
        stream = candidate;
        for (const track of candidate.getVideoTracks()) {
          track.addEventListener('ended', () => {
            if (attempt!==generation) return;
            stop();
            setLabel('Câmara interrompida · toca para retomar');
          }, {once:true});
        }
        if (!preview) throw new Error('Pré-visualização indisponível.');
        preview.srcObject = candidate;
        await preview.play();
        if (attempt !== generation) return false;
        setLabel('A carregar visão local…');
        await prepareModels();
        if (attempt !== generation) return false;
        active = true; lastVideoTime = -1; lastGestureAt = lastFaceAt = 0;
        setLabel(objectDetector ? 'Câmara activa · rosto, gestos e objetos' : 'Câmara activa · gestos e rosto');
        animation = requestAnimationFrame(frame);
        return true;
      } catch (error) {
        if (attempt === generation) { stop(); setLabel('Câmara: ' + (error.name === 'NotAllowedError' ? 'permissão recusada' : error.message)); }
        else candidate?.getTracks().forEach(track => track.stop());
        throw error;
      } finally { if (attempt === generation) opening = null; updateControls(); }
    })();
    opening = task;
    updateControls();
    return task;
  }
  async function toggle() {
    if (active) { stop(); return false; }
    return start();
  }
  button?.addEventListener('click', async () => { try { await toggle(); } catch (error) { console.warn('Travis camera:', error.message); } });
  // Hidden pages cannot promise live capture on Android. Release hardware safely.
  // The UI tells the user what happened and offers explicit reactivation on return.
  let pausedForBackground=false;
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){
      if(active||opening){pausedForBackground=true;stop();}
    } else if(pausedForBackground) {
      pausedForBackground=false;
      setLabel('Câmara em pausa · toca para retomar');
    }
  });
  window.addEventListener('pagehide', stop);
  updateControls();
  return Object.freeze({
    start, stop, toggle,
    pose: () => active ? pose : null,
    snapshot: () => ({
      active, source: 'on-device-mediapipe', observedAt: active ? observedAt : 0,
      faceDetected: active && Boolean(pose),
      gesture: active ? observedGesture : 'None',
      objects: active && objectDetector ? observedObjects.map(({name,score}) => ({name,score})) : [],
      objectModel: objectStatus, frames
    }),
    diagnostics: () => ({ active, opening: Boolean(opening), status: labelText, gesture: observedGesture, frames, faceDetected: Boolean(pose), objects: observedObjects, objectModel: objectStatus, localOnly: true })
  });
}
