# Travis Vision Tracker

Integrates the useful interaction concepts from the supplied Google AI Studio
Vision Tracker v1 prototype into Travis's existing local MediaPipe pipeline.
There is one camera stream and one model set. No additional TensorFlow.js runtime
is loaded. The existing face, voice, holograms and brain event views remain.

## Use

- `Travis, liga a câmara de trás` / `Turn on the rear camera`.
- `Liga a câmara frontal` / `Switch to the front camera`.
- `Troca de câmara` / `Switch camera`.
- `O que estás a ver?` / `What can you see?`.
- Point at a confirmed object and pinch thumb/index, or tap its box, to select.
- `Liberta o alvo` / `Release target`.
- `Para de narrar` / `Stop narrating`; `Ativa a narração` / `Enable narration`.
- `Desliga a câmara` / `Turn off the camera`.

Camera access requires the browser's permission and localhost or HTTPS. The
camera opens only on a request. Rear is the initial preference; an explicitly
requested unavailable lens reports failure instead of silently selecting another.
Speech uses Travis's configured language. Display language remains independent.

## Actual capabilities and limits

The bundled EfficientDet Lite0 model detects 80 common object categories. A new
box needs two detector observations before it appears. Simple spatial association
maintains separate IDs for same-class objects and keeps the selected target during
brief missed detections. Boxes expire after 3.2 seconds. Rapid crossing or complete
occlusion can lose identity; this is not biometric identification or object re-ID.

Position means left/centre/right within the camera image, not GPS or measured
distance. A detected person is described as a person, without an identity claim.
This integration does not claim thermal sensing, measured depth or medical status.

Frames are processed in the browser. Only bounded labels, scores, normalized
boxes and timestamps accompany dialogue requests. The backend independently
checks object freshness, valid categories and whether the selected ID was observed.
Face/gesture timestamps cannot refresh an old object observation.

Automatic narration waits for a quiet turn, describes changed confirmed scenes,
and uses at least nine seconds between announcements. It shares the existing
speech engine and rechecks the scene after preparing audio. Inference pauses
during voice playback; expired observations are not spoken as current facts.

## Verification

- `node scripts/travis-scene-selftest.mjs`: command routing, association,
  duplicate classes, expiry, selection and pinch hysteresis.
- `python3 operit-agent/travis_scene_selftest.py`: backend freshness, future
  timestamps, invalid coordinates, bounded categories and selected-ID validation.
- Existing Pages validation and core Python regression suites pass.
- `scripts/travis-vision-browser-selftest.mjs` accepts paths to a Playwright
  module, Chromium executable and an optional image fixture. It exercises real
  video elements with a canvas stream, camera cancellation, lens switching,
  permission refusal, model reuse, overlay selection and observation expiry.
- Browser run on Chromium 153 loaded the real bundled MediaPipe models and
  detected two dogs (scores 0.82 and 0.80) in Google's object-detection example
  image: https://developers.google.com/edge/mediapipe/images/solutions/object-detection-output.png
  This is an integration fixture, not an accuracy benchmark.

Physical phone lens selection, microphone, speaker and gesture ergonomics still
need a foreground check on the user's device. No automated test above represents
physical camera or end-user latency validation.

## Deployment

Install `travis_scene.py` before the updated `jarvis_local.py`, and
`travis-scene-tracker.mjs` before the updated client imports. The supervisor's
runtime/client lists include both dependencies. The PWA shell caches the versioned
modules; its cache namespace changes for this release. Preserve concurrent
runtime changes, back up replaced files, and reload the local router only when idle.
