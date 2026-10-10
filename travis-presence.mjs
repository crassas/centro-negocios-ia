import {MOTION} from './travis-motion.mjs?v=motion-1';
// Local animation direction. Conversation state drives gestures, never device sensors.
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export function createPresenceMotion({random=Math.random,reducedMotion=false}={}){
  let time=0,nextLook=0,previous='',yaw=0,pitch=0,roll=0,eyeX=0,eyeY=0;
  let lookX=0,lookY=0,nodAt=-10;
  return {update(dt,state='ready',voice=0,projection=0){
    dt=Math.max(0,Math.min(.1,dt));time+=dt;
    if(reducedMotion)return {yaw:0,pitch:0,roll:0,eyeX:0,eyeY:0,lift:0};
    if(state!==previous){
      nextLook=time;
      if(state==='listening')nodAt=time;
      previous=state;
    }
    if(time>=nextLook){
      const attentive=state==='listening'||state==='speaking';
      const aside=state==='thinking'||(!attentive&&random()>.45);
      lookX=aside?(random()<.5?-1:1)*(.16+random()*.18):(random()-.5)*.09;
      lookY=state==='thinking'?-.045:(random()-.5)*.04;
      nextLook=time+(attentive?2.2:3.0)+random()*3.2;
    }
    const attending=1-clamp(projection);
    const targetYaw=lookX*attending-.20*projection;
    const nodAge=time-nodAt;
    const nod=nodAge<1.15?Math.sin(nodAge/1.15*Math.PI)*.045:0;
    const emphasis=state==='speaking'?Math.sin(time*2.6)*clamp(voice)*.035:0;
    const follow=1-Math.exp(-dt*2.4),saccade=1-Math.exp(-dt*12);
    yaw+=(targetYaw-yaw)*follow;
    pitch+=(lookY+nod+emphasis+.04*projection-pitch)*follow;
    roll+=(-lookX*.07+Math.sin(time*.43)*.008-roll)*follow;
    eyeX+=((targetYaw-yaw)*.30-eyeX)*saccade;
    eyeY+=((lookY-pitch)*.24-eyeY)*saccade;
    return {yaw,pitch,roll,eyeX,eyeY,lift:Math.sin(time*.85)*.014};
  }};
}

// Reversible, wall-clock transitions: a slow frame cannot strand half a face.
export function createHologramPresentation({reducedMotion=false}={}){
  let phase='face',from=0,to=0,started=0;
  let duration=reducedMotion?.001:MOTION.enter;
  function sample(now){
    const t=clamp((now-started)/duration);
    let amount=from+(to-from)*(t*t*t*(t*(t*6-15)+10));
    if((phase==='dissolving'||phase==='returning')&&now-started>=duration){
      phase=to===1?'projecting':'face';amount=to;
    }
    return {phase,amount,visible:phase!=='face',panel:ease((amount-.32)/.68)};
  }
  function transition(target,now){
    const value=sample(now).amount;
    from=value;to=target;started=now;duration=reducedMotion?.001:target===1?MOTION.enter:MOTION.exit;
    phase=target===1?'dissolving':'returning';
  }
  return {
    sample,
    present(now){
      const current=sample(now);
      if(current.phase!=='projecting'&&current.phase!=='dissolving')transition(1,now);
    },
    close(now){if(phase!=='face'&&phase!=='returning')transition(0,now);},
    reset(){phase='face';from=to=started=0;}
  };
}
export const hologramPresentation=createHologramPresentation({
  reducedMotion:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches
});
