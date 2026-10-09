/**
 * Travis automatic visual composition.
 *
 * These are UI representations of measured runtime states, not consciousness.
 * The face remains the conversational default. Only sustained processing with
 * an observed local brain connection reveals the persisted particle network.
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
  if (projectionActive) return 'face'; // Keep the emitter for a real hologram.
  if (state==='thinking' && brainConnected && elapsedMs>=THINKING_DWELL_MS)
    return 'core';
  return 'face'; // Idle, listening, speaking, and ready are personal presence.
}

export function nextFormBlend(value,target,dt,{reducedMotion=false}={}) {
  const current=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
  const desired=Number.isFinite(target)?Math.max(0,Math.min(1,target)):0;
  const delta=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
  // Exponential smoothing is frame-rate-independent and never overshoots.
  const rate=reducedMotion?22:4.4;
  return current+(desired-current)*(1-Math.exp(-delta*rate));
}
