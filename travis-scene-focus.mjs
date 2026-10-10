// Presentation transforms sit outside live actors: focusing never replaces a
// mesh, resets an animation clock, or turns a request into another scene.
export const focusKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function createSceneFocus(THREE,entries,{reducedMotion=false,guides=[]}={}){
 let selected=null,lastNow=null;
 const vector=new THREE.Vector3(),desired=new THREE.Vector3(),quaternion=new THREE.Quaternion();
 const actors=entries.map(entry=>{
  const object=entry.object,parent=object.parent;if(!parent)throw new Error('Focus actor needs a parent');
  parent.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(object),inverse=new THREE.Matrix4().copy(object.matrixWorld).invert();box.applyMatrix4(inverse);
  const centre=box.getCenter(new THREE.Vector3()),localSize=box.getSize(new THREE.Vector3());
  const radius=entry.radius||Math.max(localSize.x*Math.abs(object.scale.x),localSize.y*Math.abs(object.scale.y),localSize.z*Math.abs(object.scale.z))*.5;
  const wrapper=new THREE.Group();wrapper.name='Focus:'+entry.id;parent.add(wrapper);wrapper.add(object);
  const materials=new Set();object.traverse(o=>{if(o.material)for(const m of [o.material].flat())materials.add(m);});
  return {...entry,object,wrapper,parent,centre,radius:Math.max(.01,radius),materials,blend:0,light:1,lastCentre:null,
   keys:[entry.id,entry.label,...(entry.aliases||[])].map(focusKey).filter(Boolean)};
 });
 function focus(target){
  if(target===null||target===''){selected=null;return true;}
  const key=focusKey(target),matches=actors.filter(a=>a.keys.includes(key));
  if(matches.length!==1)return false;
  selected=matches[0];return true;
 }
 function update(now=0){
  const dt=lastNow===null?1/60:Math.max(0,Math.min(.1,now-lastNow));lastNow=now;
  const ease=reducedMotion?1:1-Math.exp(-dt*5.5);
  for(const [index,a] of actors.entries()){
   a.blend+=((selected?1:0)-a.blend)*ease;
   const chosen=a===selected,b=a.blend;
   a.object.updateMatrix();vector.copy(a.centre).applyMatrix4(a.object.matrix);
   // Coordinates are in the actor's parent; orient the foreground toward the
   // viewer even in a tilted orbital plane.
   quaternion.copy(a.parent.quaternion).invert();
   if(chosen){
    if(a.lastCentre)a.wrapper.position.addScaledVector(a.lastCentre.clone().sub(vector),a.wrapper.scale.x*a.blend);
    const scale=Math.min(50,.82/a.radius);
    desired.set(0,0,.48).applyQuaternion(quaternion).sub(vector.clone().multiplyScalar(scale));
    a.wrapper.position.lerp(desired,ease);a.wrapper.scale.lerp(new THREE.Vector3(scale,scale,scale),ease);
   }else{
    const angle=index*2.39996,side=Math.abs(vector.x)>.03?Math.sign(vector.x):Math.cos(angle);
    desired.set(side*1.18,Math.sin(angle)*.40,-.95).applyQuaternion(quaternion);
    desired.multiplyScalar(selected?1:0);a.wrapper.position.lerp(desired,ease);const scale=selected?.82:1;a.wrapper.scale.lerp(new THREE.Vector3(scale,scale,scale),ease);
   }
   a.lastCentre=vector.clone();a.wrapper.visible=true;
   a.light+=((selected&&!chosen?.32:1)-a.light)*ease;
   for(const m of a.materials){if(m.uniforms?.uFocus)m.uniforms.uFocus.value=a.light;if(m.uniforms?.uDetailScale)m.uniforms.uDetailScale.value=Math.max(1,a.wrapper.scale.x);}
  }
  const amount=actors.reduce((v,a)=>Math.max(v,a.blend),0);
  for(const guide of guides)guide.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))if(m.transparent)m.opacity*=1-amount*.86;});
 }
 return {focus,update,state:()=>({focused:selected?.id||null,objects:actors.map(a=>({id:a.id,label:a.label,uuid:a.object.uuid,visible:a.wrapper.visible,emphasis:a===selected,offset:a.wrapper.position.toArray(),focusScale:a.wrapper.scale.x}))})};
}
