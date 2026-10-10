import {sandProgress,sandOffset} from './travis-sand-flow.mjs?v=sand-1';
import {MOTION} from './travis-motion.mjs?v=motion-1';
import {particleBounds,fitParticleToViewport} from './travis-projection-framing.mjs?v=1';
import {createHolographicParticleMaterial} from './travis-holographic-head.mjs?v=sand-1';

export const morphEase=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function morphVisibility(progress,returning,alphaStart=0,avatarStart=0){
 const p=Math.max(0,Math.min(1,progress));
 return returning?{opacity:alphaStart*(1-morphEase((p-.70)/.30)),avatar:avatarStart*(1-morphEase((p-.45)/.55))}
  :{opacity:alphaStart+(1-alphaStart)*morphEase(p/.22),avatar:avatarStart+(1-avatarStart)*morphEase((p-.04)/.48)};
}

// Reuses the same particles from the Travis head/core throughout each 3D form.
// Shapes are sampled from local geometry. GPU interpolates; CPU work only on scene changes.
export function createTravisParticleMorph(THREE,{count=2700,reducedMotion=false}={}){
 const root=new THREE.Group();root.name='TravisMatterField';
 const n=Math.max(128,Math.min(18000,Math.round(count)));
 const from=new Float32Array(n*3),to=new Float32Array(n*3),seed=new Float32Array(n);
 const normalFrom=new Float32Array(n*3),normalTo=new Float32Array(n*3);
 const geometry=new THREE.BufferGeometry();
 // Three.js WebGLRenderer infers the non-indexed draw count from `position`.
 // Without it, drawRange.count stays Infinity and renderBufferDirect skips
 // every particle even though aFrom/aTo contain valid shader attributes.
 geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
 geometry.setDrawRange(0,n);
 const random=(a,b=1)=>{const v=Math.sin(a*12.9898+b*78.233)*43758.5453;return v-Math.floor(v);};
 const sourceCore=i=>{
  const theta=2.3999632297*i,ny=1-2*((i+.5)/n),r=Math.sqrt(Math.max(0,1-ny*ny));
  const shell=.62+random(i,13)*.46;
  return [Math.cos(theta)*r*shell,ny*shell+.16,Math.sin(theta)*r*shell*.75];
 };
 for(let i=0;i<n;i++){const xyz=sourceCore(i);seed[i]=random(i,22);from.set(xyz,i*3);to.set(xyz,i*3);normalFrom.set([0,0,1],i*3);normalTo.set([0,0,1],i*3);}
 geometry.setAttribute('aFrom',new THREE.BufferAttribute(from,3));
 geometry.setAttribute('aTo',new THREE.BufferAttribute(to,3));
 geometry.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
 geometry.setAttribute('aNormalFrom',new THREE.BufferAttribute(normalFrom,3));
 geometry.setAttribute('aNormalTo',new THREE.BufferAttribute(normalTo,3));
 const material=createHolographicParticleMaterial(THREE);
 material.uniforms.uFlow.value=reducedMotion?0:1;
 const points=new THREE.Points(geometry,material);points.name='TravisMorphParticles';
 points.frustumCulled=false;root.add(points);
 let liveShape=null;
 let started=0,duration=MOTION.enter,toCore=false,active=false,sourceObject=null;
 let currentAlpha=0,lastProgress=0,sourceSummary='fallback-core',targetSummary='core';
 let currentBounds=particleBounds(to),lastFit=null,rawTarget=null,rawNormals=null;
 let viewKey='',lastTime=0,lastVoice=0,alphaStart=0,avatarStart=0,avatarDissolve=0;
 const frameOrigin=new THREE.Vector3();
 let fitMargin=.98,presentation=null;
 function setTheme(scene){fitMargin=scene==='person'?.88:.98;}
 function advance(now){return reducedMotion?1:Math.max(0,Math.min(1,(now-started)/duration));}
 function current(now){
   const progress=advance(now);
   const out=new Float32Array(n*3),normals=new Float32Array(n*3);
   for(let i=0;i<n;i++){
     const j=i*3,t=sandProgress(progress,seed[i]);let length=0;
     for(let k=0;k<3;k++){normals[j+k]=normalFrom[j+k]*(1-t)+normalTo[j+k]*t;length+=normals[j+k]**2;out[j+k]=from[j+k]*(1-t)+to[j+k]*t;}
     length=Math.max(Math.sqrt(length),.000001);
     for(let k=0;k<3;k++)normals[j+k]/=length;
     const offset=sandOffset(out.subarray(j,j+3),normals.subarray(j,j+3),seed[i],now,lastVoice,progress,reducedMotion?0:1);
     for(let k=0;k<3;k++)out[j+k]+=offset[k];
   }
   return {positions:out,normals};
 }
 function collect(group,now=null){
   if(!group?.traverse)return null;
   group.updateWorldMatrix?.(true,true);
   root.updateWorldMatrix?.(true,false);
   const reverse=new THREE.Matrix4().copy(root.matrixWorld).invert();
   const list=[];
   group.traverse(o=>{
     if(!o.geometry?.attributes?.position||o.userData?.skipMorph)return;
     if(o.isPoints||o.isMesh||o.isLine||o.isLineSegments){
       const pos=o.geometry.attributes.position,count=pos.count;
       if(count<2)return;
       const vertices=count;
       const priority=o.isLineSegments||o.isLine?1.9:o.isPoints?.85:1;
       list.push({o,pos,count,idx:o.geometry.index?.array,priority,
         weight:Math.max(1,Math.sqrt(vertices)*priority),normalMatrix:new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().multiplyMatrices(reverse,o.matrixWorld))});
     }
   });
   if(!list.length)return null;
   const sums=[],total=list.reduce((sum,item)=>{const next=sum+item.weight;sums.push(next);return next;},0);
   const vec=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
   const convert=(o,index,out)=>out.fromBufferAttribute(o.geometry.attributes.position,index)
      .applyMatrix4(o.matrixWorld).applyMatrix4(reverse);
   const dest=new Float32Array(n*3),normals=new Float32Array(n*3);
   const normal=new THREE.Vector3(),nb=new THREE.Vector3(),nc=new THREE.Vector3();
   for(let i=0;i<n;i++){
     const choose=random(i,37)*total;
     const item=list[sums.findIndex(s=>choose<=s)]||list.at(-1);
     const {o,pos,count,idx}=item;normal.set(0,0,1);
     if(o.isMesh){
       const ntri=Math.max(1,Math.floor((idx?idx.length:count)/3));
       const tri=Math.floor(random(i,41)*ntri)*3;
       const a=idx?idx[tri]:tri;
       const bi=idx?idx[tri+1]:tri+1;
       const ci=idx?idx[tri+2]:tri+2;
       convert(o,Math.min(a,count-1),vec);
       convert(o,Math.min(bi??a,count-1),b);
       convert(o,Math.min(ci??a,count-1),c);
       let u=random(i,43),v=random(i,47);
       if(u+v>1){u=1-u;v=1-v;}
       vec.multiplyScalar(1-u-v).addScaledVector(b,u).addScaledVector(c,v);
       const attr=o.geometry.attributes.normal;
       if(attr){normal.fromBufferAttribute(attr,a);nb.fromBufferAttribute(attr,bi??a);nc.fromBufferAttribute(attr,ci??a);normal.multiplyScalar(1-u-v).addScaledVector(nb,u).addScaledVector(nc,v);}
       else normal.set(0,0,1);
     }else if(o.isLine||o.isLineSegments){
       const edgeCount=Math.max(1,Math.floor((idx?idx.length:count)/(o.isLineSegments?2:1)));
       const q=Math.floor(random(i,53)*(o.isLineSegments?edgeCount:Math.max(1,edgeCount-1)));
       const first=o.isLineSegments?q*2:q,second=first+1;
       const a=Math.min(idx?(idx[first]??0):first,count-1);
       const bidx=Math.min(idx?(idx[second]??a):second,count-1);
       convert(o,a,vec);convert(o,bidx,b);
       vec.lerp(b,random(i,59));
     }else convert(o,Math.floor(random(i,61)*count),vec);
     dest[i*3]=vec.x;dest[i*3+1]=vec.y;dest[i*3+2]=vec.z;
     normal.applyMatrix3(item.normalMatrix).normalize();normals.set([normal.x,normal.y,normal.z],i*3);
   }
   return {positions:dest,normals};
 }
 function setSource(object){sourceObject=object||null;}
 function fitTarget({camera=null,zoom=1,spin=0,dx=0,dy=0}={}){
   if(!rawTarget)return;
   to.set(rawTarget);normalTo.set(rawNormals);
   if(toCore)return; // The face already has its real world transform. Never fit it again.
   const bounds=particleBounds(rawTarget);if(!bounds)return;
   root.updateWorldMatrix?.(true,false);root.getWorldPosition(frameOrigin);
   const fit=camera?fitParticleToViewport(bounds,{
     fov:camera.fov,aspect:camera.aspect,cameraX:camera.position.x,cameraY:camera.position.y,cameraZ:camera.position.z,
     rootX:frameOrigin.x,rootY:frameOrigin.y,rootZ:frameOrigin.z,margin:fitMargin
   }):{scale:1,x:0,y:0,z:0};
   lastFit=fit;if(!fit)return;
   const [cx,cy,cz]=bounds.center,cos=Math.cos(spin),sin=Math.sin(spin),scale=fit.scale*zoom;
   presentation={position:[fit.x+cx*fit.scale-(cx*cos+cz*sin)*scale+dx,fit.y+cy*fit.scale-cy*scale+dy,fit.z+cz*fit.scale-(-cx*sin+cz*cos)*scale],scale,rotation:spin};
   for(let i=0;i<n;i++){
     const j=i*3,x=rawTarget[j]-cx,y=rawTarget[j+1]-cy,z=rawTarget[j+2]-cz;
     to[j]=fit.x+cx*fit.scale+(x*cos+z*sin)*scale+dx;
     to[j+1]=fit.y+cy*fit.scale+y*scale+dy;
     to[j+2]=fit.z+cz*fit.scale+(-x*sin+z*cos)*scale;
     normalTo[j]=rawNormals[j]*cos+rawNormals[j+2]*sin;
     normalTo[j+2]=-rawNormals[j]*sin+rawNormals[j+2]*cos;
   }
 }
 const keyFor=({camera,zoom=1,spin=0,dx=0,dy=0}={})=>[camera?.fov,camera?.aspect?.toFixed(4),camera?.position.z?.toFixed(2),zoom,spin,dx,dy].join('|');
 function dirty(){for(const key of ['aFrom','aTo','aNormalFrom','aNormalTo'])geometry.attributes[key].needsUpdate=true;}
 function go(target,now,{source=null,label='concept',camera=null}={}){
   const wasActive=active;
   const previous=wasActive?(liveShape&&!toCore&&advance(lastTime||now)>=1?collect(liveShape):current(lastTime||now)):collect(source||sourceObject);
   if(previous){from.set(previous.positions);normalFrom.set(previous.normals);sourceSummary=wasActive?'previous-form':'face';}
   else{for(let i=0;i<n;i++)from.set(sourceCore(i),i*3);sourceSummary='core';}
   const next=collect(target||source||sourceObject)||{positions:from.slice(),normals:normalFrom.slice()};
   rawTarget=next.positions;rawNormals=next.normals;currentBounds=particleBounds(rawTarget);
   toCore=!target;alphaStart=wasActive?currentAlpha:0;avatarStart=wasActive?avatarDissolve:0;
   targetSummary=label;started=now;lastTime=now;duration=reducedMotion?.001:toCore?MOTION.exit:MOTION.enter;lastProgress=0;
   fitTarget({camera});viewKey=camera?keyFor({camera}):'';
   dirty();active=true;points.visible=true;
 }
 function returnToSource(now){if(!active||toCore)return;go(null,now,{label:'travis-face'});}
 function update(now,projection,{zoom=1,spin=0,dx=0,dy=0,pixelRatio=1,camera=null,voice=0}={}){
   if(!active)return;
   const view={camera,zoom,spin,dx,dy},key=keyFor(view);
   if(!toCore&&key!==viewKey){
     // Fit only the destination. Preserve the last displayed point positions
     // when controls or viewport change, including during an interrupted morph.
     if(viewKey){
       const settled=liveShape&&advance(lastTime||now)>=1;
       const visible=settled?collect(liveShape):current(lastTime||now);
       if(settled&&presentation){
         // Animated bodies have moved since their initial sample. Remove only
         // the old presentation transform before fitting their current pose.
         const inverse=new THREE.Matrix4().compose(new THREE.Vector3(...presentation.position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),presentation.rotation),new THREE.Vector3().setScalar(presentation.scale)).invert();
         const normalInverse=new THREE.Matrix3().getNormalMatrix(inverse),v=new THREE.Vector3();
         rawTarget=visible.positions.slice();rawNormals=visible.normals.slice();
         for(let i=0;i<n;i++){v.fromArray(rawTarget,i*3).applyMatrix4(inverse).toArray(rawTarget,i*3);v.fromArray(rawNormals,i*3).applyMatrix3(normalInverse).normalize().toArray(rawNormals,i*3);}
       }
       from.set(visible.positions);normalFrom.set(visible.normals);started=now;duration=reducedMotion?.001:MOTION.control;alphaStart=currentAlpha;avatarStart=avatarDissolve;
     }
     fitTarget(view);dirty();viewKey=key;
   }
   const progress=advance(now),visibility=morphVisibility(progress,toCore,alphaStart,avatarStart);
   lastTime=now;lastProgress=progress;lastVoice=Math.max(0,Math.min(1,Number(voice)||0));
   currentAlpha=visibility.opacity;avatarDissolve=visibility.avatar;
   material.uniforms.uMorph.value=progress;material.uniforms.uTime.value=now;
   material.uniforms.uVoice.value=lastVoice;material.uniforms.uOpacity.value=currentAlpha;
   material.uniforms.uPixelRatio.value=Math.min(2,Math.max(.7,pixelRatio));
   points.visible=currentAlpha>.001;
   if(toCore&&progress>=1){active=false;points.visible=false;avatarDissolve=0;}
 }
 function hide(){active=false;points.visible=false;currentAlpha=avatarDissolve=0;material.uniforms.uOpacity.value=0;}
 function dispose(){root.remove(points);geometry.dispose();material.dispose();}
 return {root,points,presentation:()=>presentation,follow:object=>{liveShape=object;},setSource,go,returnToSource,update,hide,dispose,setTheme,
  state:()=>({active,points:n,morphProgress:lastProgress,source:sourceSummary,target:targetSummary,
   returning:toCore,avatarDissolve,voice:lastVoice,opacity:currentAlpha,fit:lastFit,
   coordinateSpace:'projection-root',from:from.slice(0,9),to:to.slice(0,9)})};
}
