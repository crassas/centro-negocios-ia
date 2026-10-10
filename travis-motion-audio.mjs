// Quiet procedural cues share the user's unlocked audio context, not the voice analyser.
export function createMotionAudio({context,state,storage=globalThis.localStorage}={}){
 let enabled=true,last=-Infinity;const voices=new Set();
 try{enabled=storage?.getItem('travis-motion-sound')!=='off';}catch{}
 function silence(){for(const item of voices){try{item.osc.stop();}catch{}item.osc.disconnect();item.gain.disconnect();}voices.clear();}
 function setEnabled(value){enabled=Boolean(value);if(!enabled)silence();try{storage?.setItem('travis-motion-sound',enabled?'on':'off');}catch{}return enabled;}
 function play(cue='morph'){
  const ac=context?.(),status=state?.()||{};
  // Never acquire a microphone or unlock/resume audio here. No cue enters STT.
  if(!enabled||!ac||ac.state!=='running'||!status.open||status.listening||status.paused||status.reducedMotion||ac.currentTime-last<.35)return false;
  const t=ac.currentTime+.008,duration=cue==='return'?.24:cue==='control'?.10:.36;
  last=ac.currentTime;
  const osc=ac.createOscillator(),gain=ac.createGain();osc.type='sine';
  const start=cue==='return'?240:cue==='control'?330:130,end=cue==='return'?110:cue==='control'?370:260;
  osc.frequency.setValueAtTime(start,t);osc.frequency.exponentialRampToValueAtTime(end,t+duration);
  gain.gain.setValueAtTime(.00001,t);gain.gain.exponentialRampToValueAtTime(status.speaking?.0015:.008,t+.018);
  gain.gain.exponentialRampToValueAtTime(.00001,t+duration);
  osc.connect(gain).connect(ac.destination);const item={osc,gain};voices.add(item);
  osc.onended=()=>{osc.disconnect();gain.disconnect();voices.delete(item);};osc.start(t);osc.stop(t+duration+.01);return true;
 }
 return {play,setEnabled,silence,status:()=>({enabled,active:voices.size})};
}
