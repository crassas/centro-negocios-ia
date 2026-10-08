import assert from 'node:assert/strict';
import {createPresenceMotion,createHologramPresentation} from '../travis-presence.mjs';

const p=createHologramPresentation();
p.present(0,{readingSeconds:8});
assert.equal(p.sample(0).amount,0);
assert(p.sample(.45).amount>0&&p.sample(.45).amount<1);
assert.equal(p.sample(1).phase,'projecting');
p.speaking(true,1);
assert.equal(p.sample(60).phase,'projecting','Long speech keeps its actual result visible');
p.speaking(false,60);
assert.equal(p.sample(62).phase,'projecting');
assert.equal(p.sample(63).phase,'returning');
assert.equal(p.sample(70).amount,0,'A slow frame must completely restore the head');

p.present(80);p.sample(81);p.pin(true,81);
assert.equal(p.sample(180).phase,'projecting','Reading can be pinned without interrupting speech');
p.pin(false,180);p.interact(187);
assert.equal(p.sample(194).phase,'projecting','Touch/keyboard activity extends reading time');
p.close(194);const midway=p.sample(194.45).amount;
p.present(194.45);assert.equal(p.sample(194.45).amount,midway,'A new result reverses an in-flight return without a jump');
assert.equal(p.sample(196).amount,1);
p.reset();assert.equal(p.sample(200).amount,0);
p.present(201,{auto:false});assert.equal(p.sample(220).phase,'projecting','A manually opened workspace never dismisses itself');
p.close(221);p.sample(222);

const reduced=createHologramPresentation({reducedMotion:true});
reduced.present(0);assert.equal(reduced.sample(.01).amount,1);
reduced.close(1);assert.equal(reduced.sample(1.01).amount,0);
const still=createPresenceMotion({reducedMotion:true});
assert.deepEqual(still.update(.1,'speaking',1),{yaw:0,pitch:0,roll:0,eyeX:0,eyeY:0,lift:0});

let seed=19;
const motion=createPresenceMotion({random:()=>{seed=(seed*16807)%2147483647;return seed/2147483647;}});
const poses=[];
for(let i=0;i<3600;i++){
  const pose=motion.update(1/60,['ready','listening','thinking','speaking'][Math.floor(i/900)],.65);
  assert(Object.values(pose).every(Number.isFinite));
  assert(Math.abs(pose.yaw)<.4&&Math.abs(pose.pitch)<.13&&Math.abs(pose.roll)<.05,'Keep the face in its readable portrait range');
  if(poses.length)assert(Math.abs(pose.yaw-poses.at(-1).yaw)<.03,'No snapping between attention targets');
  poses.push(pose);
}
assert(Math.max(...poses.map(p=>p.yaw))-Math.min(...poses.map(p=>p.yaw))>.25,'Head turns autonomously without pointer input');
console.log('PRESENCE_OK: autonomous gestures, speech hold, return, interruption, pin, reduced motion');
