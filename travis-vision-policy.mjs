// Pure, testable gesture policy. UI-only actions: never execute external tools.
export const GESTURE_ACTIONS = Object.freeze({
  Open_Palm: 'show_hologram',
  Closed_Fist: 'hide_hologram',
  Victory: 'show_face',
  Thumb_Up: 'show_brain'
});

export function facePosition(result, width, height) {
  const box = result?.detections?.[0]?.boundingBox;
  if (!box || !(width > 0 && height > 0) || ![box.originX, box.originY, box.width, box.height].every(Number.isFinite)) return null;
  const clamp = v => Math.max(-1, Math.min(1, v));
  return {
    x: clamp(((box.originX + box.width / 2) / width - .5) * 2),
    y: clamp(((box.originY + box.height / 2) / height - .5) * 2)
  };
}

export function gestureDecision(recognition, timestamp, state) {
  const row = recognition?.gestures?.[0]?.[0] || null;
  const name = row?.categoryName || 'None';
  const action = (Number(row?.score) >= .78) ? GESTURE_ACTIONS[name] : undefined;
  if (!action) {
    state.name = null;
    state.since = 0;
    state.latched = false;
    return null;
  }
  if (state.name !== name) {
    state.name = name;
    state.since = timestamp;
    state.latched = false;
    return null;
  }
  if (state.latched || timestamp - state.since < 650 || timestamp - (state.lastActionAt || -3000) < 1500) return null;
  state.latched = true;
  state.lastActionAt = timestamp;
  return { action, name, score: Number(row.score) };
}

export function cameraCommand(message) {
  const text = String(message).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/^(?:travis|jarvis|olha|please)[,: ]+/, '').trim().replace(/[.!?]+$/, '');
  if (/^(?:nao|nunca|do not|don't|never)\b/.test(text)) return null;
  if (/^(?:liga|ligar|ativa|ativar|activa|activar|abre|abrir|mostra|open|enable|start|turn on)\s+(?:(?:a|the|my|minha)\s+)?(?:camera|camara|webcam|vision|visao)$/.test(text)) return 'start';
  if (/^(?:desliga|desligar|desativa|desativar|fecha|fechar|stop|disable|close|turn off)\s+(?:(?:a|the|my|minha)\s+)?(?:camera|camara|webcam|vision|visao)$/.test(text)) return 'stop';
  return null;
}
