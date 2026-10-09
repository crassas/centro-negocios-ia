/**
 * Travis automatic visual composition.
 *
 * These are UI representations of measured runtime states, not consciousness.
 * The face remains the conversational default in every state, including
 * background memory, speech recognition and extended reasoning. The detailed
 * memory network is an explicit, temporary operator-requested view only.
 * No tool permissions or external actions are derived from these states.
 */
export const THINKING_DWELL_MS = 1450;
export const MANUAL_PREVIEW_MS = 6500;

export function automaticTravisForm({
  state='ready',
  elapsedMs=0,
  faceReady=true,
  brainConnected=false,
  projectionActive=false,
}={}) {
  if (!faceReady) return 'core'; // No synthetic fallback face.
  // Do not replace the person's face with a memory graph just because the
  // cognitive backend is responding. The graph can still be manually previewed.
  return 'face';
}

/** Fade the avatar only when a real 3D projection is rendering.
 * A missing/delayed projection must never leave the central stage empty. */
export function visibleProjectionAmount(amount,sceneState) {
  const requested=Number.isFinite(amount)?Math.max(0,Math.min(1,amount)):0;
  if(!sceneState?.visible || sceneState?.matter?.active!==true ||
     !Number.isFinite(sceneState?.matter?.opacity) ||
     sceneState.matter.opacity<.018)return 0;
  return requested;
}

export function nextFormBlend(value,target,dt,{reducedMotion=false}={}) {
  const current=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
  const desired=Number.isFinite(target)?Math.max(0,Math.min(1,target)):0;
  const delta=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
  // Exponential smoothing is frame-rate-independent and never overshoots.
  const rate=reducedMotion?22:4.4;
  return current+(desired-current)*(1-Math.exp(-delta*rate));
}
