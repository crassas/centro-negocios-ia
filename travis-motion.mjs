// Motion grammar adapted from whaleyxbt/claude-motion (MIT).
// Attribution and original licence: vendor/claude-motion/LICENSE.
export const MOTION=Object.freeze({
 enter:1.18,exit:.70,control:.38,caption:.8,wordStagger:.09,
 entrance:'cubic-bezier(.16,1,.3,1)',transition:'cubic-bezier(.65,0,.35,1)',
 palette:Object.freeze({background:'#080604',copper:'#9b6b3e',gold:'#e7c99d',text:'#f2e3cf'})
});
export const clamp01=x=>Math.max(0,Math.min(1,x));
export const smooth=x=>{x=clamp01(x);return x*x*(3-2*x);};
export const readingHold=text=>Math.min(14,Math.max(2,1+Math.max(0,String(text).trim().split(/\s+/).length-3)*.25));
// Mulberry32 from claude-motion/sims/kit/util.js: stable exports, no wall-clock noise.
export function seededRandom(seed=11){return ()=>{let t=seed+=0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function revealCaption(node,text,{reducedMotion=false}={}){
 node.replaceChildren();node.setAttribute('aria-label',String(text));
 const words=String(text).split(/\s+/).filter(Boolean);
 words.forEach((word,index)=>{
  const mask=document.createElement('span'),span=document.createElement('span');
  mask.className='travis-motion-word';mask.setAttribute('aria-hidden','true');span.textContent=word+'\u00a0';mask.append(span);node.append(mask);
  if(!reducedMotion)span.animate?.([{transform:'translateY(110%)',opacity:0},{transform:'translateY(0)',opacity:1}],
   {duration:MOTION.caption*1000,delay:Math.min(index,8)*MOTION.wordStagger*1000,easing:MOTION.entrance,fill:'both'});
 });
}
