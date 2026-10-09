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


// Measure the *apparent* facial colour in the current camera frame.
// Only numerical samples are returned. No images, identity or ethnicity.
export function faceColourFromPixels(rgba,width,height) {
  if (!rgba || !Number.isInteger(width) || !Number.isInteger(height) ||
      width<24 || height<24 || rgba.length<width*height*4) return null;
  function cheek(cx,cy) {
    const x0=Math.round(width*cx),y0=Math.round(height*cy);
    const rx=Math.max(2,Math.round(width*.055));
    const ry=Math.max(2,Math.round(height*.055));
    const channels=[[],[],[]];
    for(let y=Math.max(0,y0-ry);y<=Math.min(height-1,y0+ry);y++){
      for(let x=Math.max(0,x0-rx);x<=Math.min(width-1,x0+rx);x++){
        const i=(y*width+x)*4;
        if(rgba[i+3]<180)continue;
        const r=rgba[i],g=rgba[i+1],b=rgba[i+2];
        const luma=.2126*r+.7152*g+.0722*b;
        if(luma<12 || luma>250)continue;
        channels[0].push(r);channels[1].push(g);channels[2].push(b);
      }
    }
    if(channels[0].length<16)return null;
    const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)];};
    return channels.map(median);
  }
  const left=cheek(.30,.56),right=cheek(.70,.56);
  if(!left||!right)return null;
  const rgb=left.map((x,i)=>Math.round((x+right[i])/2));
  const luminance=x=>.2126*x[0]+.7152*x[1]+.0722*x[2];
  return {
    rgb,
    contrast:Math.min(255,Math.round(Math.abs(luminance(left)-luminance(right)))),
    measuredPixels:true
  };
}
