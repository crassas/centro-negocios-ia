// Speech-to-avatar envelope tied to the same AudioContext clock as the audible source.
// The signal is analysed once, not inferred from requestAnimationFrame wall-clock time.
export function buildSpeechEnvelope(buffer, rate=40) {
  if (!buffer || !(buffer.duration > 0) || !(buffer.sampleRate > 0) || typeof buffer.getChannelData !== 'function') {
    throw new TypeError('A decoded audio buffer is required.');
  }
  const hz=Math.max(20,Math.min(80,Math.round(Number(rate)||40)));
  const duration=buffer.duration;
  const count=Math.ceil(duration*hz);
  const levels=new Float32Array(count);
  const channel=buffer.getChannelData(0);
  const sampleRate=buffer.sampleRate;
  let peak=0;
  for(let i=0;i<count;i++){
    const from=Math.min(channel.length,Math.floor(i*sampleRate/hz));
    const to=Math.min(channel.length,Math.floor((i+1)*sampleRate/hz));
    const stride=Math.max(1,Math.floor((to-from)/160));
    let sum=0,n=0;
    for(let index=from;index<to;index+=stride){const v=channel[index];sum+=v*v;n++;}
    const rms=n>0?Math.sqrt(sum/n):0;
    levels[i]=rms;
    peak=Math.max(peak,rms);
  }
  // Preserve quiet passages and silence while remaining usable across voice models.
  const gain=peak>0 ? 0.88/peak : 0;
  for(let i=0;i<count;i++)levels[i]=Math.min(1,Math.max(0,(levels[i]*gain-.028)*1.12));
  return {levels,hz,duration};
}

export function speechEnvelopeLevel(envelope,elapsedSeconds) {
  if(!envelope||!Number.isFinite(elapsedSeconds)||elapsedSeconds<0||elapsedSeconds>=envelope.duration)return 0;
  const position=elapsedSeconds*envelope.hz;
  const i=Math.floor(position);
  const a=envelope.levels[i]||0;
  const b=envelope.levels[Math.min(i+1,envelope.levels.length-1)]||0;
  return Math.max(0,Math.min(1,a+(b-a)*(position-i)));
}
