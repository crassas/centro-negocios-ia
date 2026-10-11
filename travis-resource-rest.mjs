// One visibility lifecycle for disposable resources. Domain state stays with its owner.
const resources=new Map();
let hidden=document.hidden;
function notify(){window.dispatchEvent(new CustomEvent('travis:resources',{detail:status()}));}
function status(){return {hidden,resources:[...resources].map(([name,r])=>({name,sleeping:r.sleeping,pending:!!r.timer,error:r.error}))};}
function sleep(r){
  clearTimeout(r.timer);r.timer=0;
  if(r.sleeping)return;
  try{r.sleeping=r.suspend()!==false;r.error=null;}catch(e){r.error=String(e?.message||e);}
  notify();
}
function wake(r){
  clearTimeout(r.timer);r.timer=0;
  if(!r.sleeping)return;
  try{r.resume();r.sleeping=false;r.error=null;}catch(e){r.error=String(e?.message||e);}
  notify();
}
function change(next,immediate=false){
  hidden=next;
  for(const r of resources.values()){
    if(!hidden){wake(r);continue;}
    if(r.sleeping||r.timer) {if(immediate&&!r.sleeping)sleep(r);continue;}
    if(immediate||!r.delayMs)sleep(r);
    else r.timer=setTimeout(()=>{if(hidden)sleep(r);},r.delayMs);
  }
  notify();
}
export function registerRestResource(name,{suspend,resume,delayMs=0}){
  if(resources.has(name))throw new Error('Duplicate resource: '+name);
  const r={suspend,resume,delayMs,sleeping:false,timer:0,error:null};resources.set(name,r);
  if(hidden){if(delayMs)r.timer=setTimeout(()=>{if(hidden)sleep(r);},delayMs);else sleep(r);}
  return ()=>{clearTimeout(r.timer);resources.delete(name);};
}
document.addEventListener('visibilitychange',()=>change(document.hidden));
window.addEventListener('pagehide',()=>change(true,true));
window.addEventListener('pageshow',()=>change(document.hidden));
window.TravisResources=Object.freeze({status});
