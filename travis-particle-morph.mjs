// Reuses the same particles from the Travis head/core throughout each 3D form.
// Shapes are sampled from local geometry. GPU interpolates; CPU work only on scene changes.
export function createTravisParticleMorph(THREE,{count=2700,reducedMotion=false}={}){
 const root=new THREE.Group();root.name='TravisMatterField';
 const n=Math.max(128,Math.min(4500,Math.round(count)));
 const from=new Float32Array(n*3),to=new Float32Array(n*3),seed=new Float32Array(n);
 const geometry=new THREE.BufferGeometry();
 const random=(a,b=1)=>{const v=Math.sin(a*12.9898+b*78.233)*43758.5453;return v-Math.floor(v);};
 const sourceCore=i=>{
  const theta=2.3999632297*i,ny=1-2*((i+.5)/n),r=Math.sqrt(Math.max(0,1-ny*ny));
  const shell=.62+random(i,13)*.46;
  return [Math.cos(theta)*r*shell,ny*shell+.16,Math.sin(theta)*r*shell*.75];
 };
 for(let i=0;i<n;i++){const xyz=sourceCore(i);seed[i]=random(i,22);from.set(xyz,i*3);to.set(xyz,i*3);}
 geometry.setAttribute('aFrom',new THREE.BufferAttribute(from,3));
 geometry.setAttribute('aTo',new THREE.BufferAttribute(to,3));
 geometry.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
 const material=new THREE.ShaderMaterial({
   uniforms:{uMorph:{value:0},uTime:{value:0},uOpacity:{value:0},uPixelRatio:{value:1}},
   vertexShader:`attribute vec3 aFrom;attribute vec3 aTo;attribute float aSeed;
     uniform float uMorph,uTime,uOpacity,uPixelRatio;
     varying float vSeed,vOpacity;
     void main(){
       float t=clamp(uMorph,0.0,1.0);t=t*t*(3.0-2.0*t);
       vec3 p=mix(aFrom,aTo,t);
       float rush=sin(t*3.14159265);
       p+=vec3(
         sin(uTime*2.1+aSeed*83.0),
         cos(uTime*1.7+aSeed*47.0),
         sin(uTime*1.3+aSeed*57.0)
       )*rush*(.12+.18*aSeed);
       p+=normalize(p+vec3(.01))*sin(uTime*.92+aSeed*19.0)*.008;
       vec4 mv=modelViewMatrix*vec4(p,1.0);
       gl_Position=projectionMatrix*mv;
       gl_PointSize=clamp((2.0+aSeed*2.3)*uPixelRatio*8.0/max(2.0,-mv.z),1.0,5.1);
       vSeed=aSeed;
       vOpacity=uOpacity;
     }`,
   fragmentShader:`precision mediump float;varying float vSeed,vOpacity;
     void main(){
       vec2 uv=gl_PointCoord-.5;float d=length(uv);
       if(d>.50)discard;
       float core=1.0-smoothstep(.02,.50,d);
       float spark=pow(1.0-d*2.0,1.5);
       vec3 copper=vec3(.53,.33,.18),gold=vec3(.95,.78,.53),ivory=vec3(1.,.89,.69);
       vec3 color=mix(copper,gold,vSeed);
       color=mix(color,ivory,core*.62);
       gl_FragColor=vec4(color,clamp(vOpacity*(core*.72+spark*.62),0.,1.));
     }`,
   transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false
 });
 const points=new THREE.Points(geometry,material);points.name='TravisMorphParticles';
 points.frustumCulled=false;root.add(points);
 let started=0,duration=1.14,toCore=false,active=false,sourceObject=null;
 let currentAlpha=0,lastProgress=0,sourceSummary='fallback-core',targetSummary='core',rotation=0;
 function advance(elapsed){return reducedMotion?1:Math.max(0,Math.min(1,elapsed/duration));}
 const eased=t=>t*t*(3-2*t);
 function current(now){
   const a=eased(advance(now-started));
   const out=new Float32Array(n*3);
   for(let i=0;i<out.length;i++)out[i]=from[i]*(1-a)+to[i]*a;
   return out;
 }
 function collect(group,now=null){
   if(!group?.traverse)return null;
   group.updateWorldMatrix?.(true,true);
   root.updateWorldMatrix?.(true,false);
   const reverse=new THREE.Matrix4().copy(root.matrixWorld).invert();
   const list=[];
   group.traverse(o=>{
     if(!o.geometry?.attributes?.position)return;
     if(o.isPoints||o.isMesh||o.isLine||o.isLineSegments){
       const pos=o.geometry.attributes.position,count=pos.count;
       if(count<2)return;
       const vertices=count;
       const priority=o.isLineSegments||o.isLine?1.9:o.isPoints?.85:1;
       list.push({o,pos,count,idx:o.geometry.index?.array,priority,
         weight:Math.max(1,Math.sqrt(vertices)*priority)});
     }
   });
   if(!list.length)return null;
   const sums=[],total=list.reduce((sum,item)=>{const next=sum+item.weight;sums.push(next);return next;},0);
   const vec=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
   const convert=(o,index,out)=>out.fromBufferAttribute(o.geometry.attributes.position,index)
      .applyMatrix4(o.matrixWorld).applyMatrix4(reverse);
   const dest=new Float32Array(n*3);
   for(let i=0;i<n;i++){
     const choose=random(i,37)*total;
     const item=list[sums.findIndex(s=>choose<=s)]||list.at(-1);
     const {o,pos,count,idx}=item;
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
   }
   return dest;
 }
 function setSource(object){sourceObject=object||null;}
 function go(target,now,{source=null,label='concept'}={}){
   const first=!active;
   const previous=active?current(now):(collect(source||sourceObject)||null);
   if(previous){from.set(previous);sourceSummary=first?'mesh':'previous-form';}
   else{for(let i=0;i<n;i++)from.set(sourceCore(i),i*3);sourceSummary='core';}
   if(target)to.set(collect(target)||from);
   else {
     const real=collect(source||sourceObject);
     if(real)to.set(real);else for(let i=0;i<n;i++)to.set(sourceCore(i),i*3);
   }
   geometry.attributes.aFrom.needsUpdate=true;
   geometry.attributes.aTo.needsUpdate=true;
   started=now;duration=reducedMotion?.001:1.18;
   toCore=!target;targetSummary=label;active=true;points.visible=true;
 }
 function returnToSource(now){if(!active)return;go(null,now,{label:'travis-core'});}
 function update(now,projection,{zoom=1,spin=0,dx=0,dy=0,pixelRatio=1}={}){
   if(!active)return;
   const progress=advance(now-started);
   lastProgress=progress;
   material.uniforms.uMorph.value=progress;
   material.uniforms.uTime.value=now;
   material.uniforms.uPixelRatio.value=Math.min(2,Math.max(.7,pixelRatio));
   const expected=Math.min(1,Math.max(0,projection?.amount||0));
   const alpha=toCore?Math.max(0,expected):Math.min(1,expected*.9+.1*progress);
   currentAlpha=alpha;
   material.uniforms.uOpacity.value=alpha*.93;
   points.position.set(dx,dy,0);
   points.rotation.y=spin;
   points.scale.setScalar(zoom);
   points.visible=alpha>.005;
   if(toCore&&progress>=1&&expected<=.005){active=false;points.visible=false;}
 }
 function hide(){active=false;points.visible=false;material.uniforms.uOpacity.value=0;}
 function dispose(){root.remove(points);geometry.dispose();material.dispose();}
 return {root,points,setSource,go,returnToSource,update,hide,dispose,
  state:()=>({active,points:n,morphProgress:lastProgress,source:sourceSummary,target:targetSummary,
   opacity:currentAlpha,from:from.slice(0,9),to:to.slice(0,9)})};
}
