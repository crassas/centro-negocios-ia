import { createBrainPanel } from './travis-brain-panel.mjs?v=3';
import { createKnowledgeGraph } from './travis-knowledge-graph.mjs?v=3';

// Brain silhouette = particles used as a visual metaphor.
// Memory nodes and links = exclusively persisted records returned by /brain/graph.
// Region lighting = recent observed /brain/state events, not hidden reasoning.
export function createNeuralField(THREE,{reducedMotion=false,compact=false}={}){
  const root=new THREE.Group();root.name='TravisLiveCognitiveMap';
  const brainFrame=new THREE.Group();root.add(brainFrame);
  const graphFrame=new THREE.Group();root.add(graphFrame);
  const graph=createKnowledgeGraph(THREE,{reducedMotion});
  graphFrame.add(graph.root);
  const keys=['attention','memory','executive','action','monitor','regulation','reflection'];
  const palette=[0x80d7d6,0xbba5e8,0x90c4eb,0xe9b39e,0xe6d49d,0xa6dabe,0xaaaeea];
  const activity=new Float32Array(keys.length);
  const vertex=[],colours=[],regions=[],sizes=[],seeds=[],scatter=[];
  let seed=181031;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const c3=palette.map(c=>new THREE.Color(c));
  const add=(x,y,z,region,size=1)=>{
    vertex.push(x,y,z);
    const c=c3[region];colours.push(c.r,c.g,c.b);
    regions.push(region);sizes.push(size);
    const a=rnd()*Math.PI*2,b=rnd()*2-1;
    const r=Math.sqrt(1-b*b);
    scatter.push(Math.cos(a)*r, b, Math.sin(a)*r);
    seeds.push(rnd());
  };
  // Deterministic brain-shaped particle scaffold, not synthetic memories.
  for(let i=0;i<(compact?1150:2200);i++){
    const side=rnd()<.5?-1:1;
    const u=rnd()*2-1,theta=rnd()*Math.PI*2;
    const ring=Math.sqrt(1-u*u);
    const x=ring*Math.cos(theta),z=ring*Math.sin(theta),y=u;
    const groove=1+.032*Math.sin(y*36+Math.sin(z*10)*1.4)+.021*Math.sin(z*29+x*14);
    const px=side*(.41+x*.38*groove),py=y*.66*groove+.12,pz=z*1.01*groove;
    const region=py>.48?4:pz>.50?2:pz<-.48?6:side<0?1:3;
    add(px,py,pz,region,.65+rnd()*.8);
  }
  for(let i=0;i<(compact?170:300);i++){
    const side=rnd()<.5?-1:1;
    const y=rnd()*2-1,t=rnd()*Math.PI*2,r=Math.sqrt(1-y*y);
    const fold=1+.04*Math.sin(y*47);
    add(side*.26+r*Math.cos(t)*.31*fold,-.58+y*.22,-.54+r*Math.sin(t)*.40,1,.7+rnd()*.6);
  }
  for(let i=0;i<110;i++){
    const f=i/109,a=rnd()*Math.PI*2;
    add(Math.cos(a)*.065,-.25-f*.75,-.33+f*.1+Math.sin(a)*.05,5,.65+rnd()*.6);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertex,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
  geometry.setAttribute('aRegion',new THREE.Float32BufferAttribute(regions,1));
  geometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
  geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));
  geometry.setAttribute('aScatter',new THREE.Float32BufferAttribute(scatter,3));
  const uniforms={
    uTime:{value:0},uOpacity:{value:0},uDissolve:{value:0},uPixelRatio:{value:1},
    uActivity:{value:activity}
  };
  const material=new THREE.ShaderMaterial({
    uniforms,vertexColors:true,
    vertexShader:[
      'uniform float uTime,uOpacity,uDissolve,uPixelRatio;',
      'uniform float uActivity[7];',
      'attribute float aRegion,aSize,aSeed; attribute vec3 aScatter;',
      'varying vec3 vColour; varying float vAlpha;',
      'void main(){',
      '  int region=int(aRegion); float signal=clamp(uActivity[region],0.0,1.0);',
      '  vec3 positionAnimated=position+aScatter*(uDissolve*2.1);',
      '  positionAnimated+=normalize(aScatter)*signal*.014*sin(uTime*5.0+aSeed*21.0);',
      '  vec4 mv=modelViewMatrix*vec4(positionAnimated,1.0);',
      '  vColour=color;',
      '  float pulse=signal*(.28+.28*pow(.5+.5*sin(uTime*3.0+aSeed*14.0),3.0));',
      '  vAlpha=clamp((.28+pulse)*(1.0-uDissolve),0.0,1.0)*uOpacity;',
      '  gl_Position=projectionMatrix*mv;',
      '  gl_PointSize=clamp(aSize*(10.0+signal*3.0)*uPixelRatio/max(1.0,-mv.z),1.0,4.2);',
      '}'
    ].join('\n'),
    fragmentShader:[
      'varying vec3 vColour;varying float vAlpha;',
      'void main(){',
      ' float radius=length(gl_PointCoord-.5); if(radius>.5)discard;',
      ' float halo=1.0-smoothstep(.03,.5,radius);',
      ' gl_FragColor=vec4(vColour*(.76+halo*.36),vAlpha*halo);',
      '}'
    ].join('\n'),
    transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,toneMapped:false
  });
  const surface=new THREE.Points(geometry,material);
  surface.name='ParticleBrainSilhouette';surface.frustumCulled=false;surface.renderOrder=4;
  brainFrame.add(surface);
  let nativeEvents=null;
  const panel=createBrainPanel(snapshot=>{status=snapshot;},data=>{
    if(data&&data.source==='local-sqlite')graph.setData(data);
    else graph.offline();
  },events=>{nativeEvents=events;});
  let status=null,clock=0,currentCore=0,currentProjection=0,visible=false;
  function update({time=0,dt=.016,core=0,intro=1,projection=0,portrait=false,pixelRatio=1}={}){
    clock=reducedMotion?0:Math.max(0,time);currentCore=core;currentProjection=projection;
    visible=core>.012&&projection<.999;root.visible=visible;
    uniforms.uTime.value=clock;uniforms.uDissolve.value=Math.min(1,Math.max(0,projection));
    uniforms.uOpacity.value=Math.max(0,core*intro);
    uniforms.uPixelRatio.value=Math.min(1.8,Math.max(1,pixelRatio));
    root.position.set(0,portrait?.67:.47,0);
    root.scale.setScalar(portrait?1.0:1.35);
    brainFrame.position.set(portrait?0:-.86,portrait?.95:0,0);
    brainFrame.rotation.set(.10,(reducedMotion?0:Math.sin(clock*.075)*.12)+.16,-.02);
    graphFrame.position.set(portrait?0:1.05,portrait?-1.22:-.08,.1);
    graphFrame.scale.setScalar(portrait?.66:.90);
    const now=Date.now()/1000;
    const fresh=status&&Math.abs(now-status.observedAt)<12;
    const eventFresh=nativeEvents?.ok&&nativeEvents.source==='brain-sqlite'&&Math.abs(now-nativeEvents.observedAt)<12;
    keys.forEach((id,i)=>{
      const entry=fresh?status.modules?.find(m=>m.id===id):null;
      const elapsed=now-(entry?.at||0);
      const fromModule=entry?.active&&elapsed>=0&&elapsed<18?Math.max(.12,1-elapsed/18):0;
      const observed=eventFresh?nativeEvents.events?.find(event=>event.region===id):null;
      const age=now-(observed?.created||0);
      const pulse=observed&&age>=0&&age<18?Math.max(.12,1-age/18):0;
      const target=Math.max(fromModule,pulse);
      activity[i]+=(target-activity[i])*Math.min(1,dt*5);
    });
    graph.update({time:clock,core:Math.min(1,core*intro),activity:activity[1],projection});
    panel.setVisible(core>.52&&projection<.22);
  }
  function pick(raycaster){return currentCore>.5&&currentProjection<.2?graph.pick(raycaster):null;}
  function select(id){const item=graph.select(id);panel.setSelectedMemory(item);return item;}
  function diagnostics(){return{
    kind:'event-linked-particle-brain',source:'brain/state + brain/graph + brain/events',
    nativeEventEngine:nativeEvents?.engine||'unavailable',observedEventCount:nativeEvents?.events?.length||0,
    backendConnected:!!status,backendPhase:status?.phase,
    silhouetteParticles:vertex.length/3,graph:graph.diagnostics(),
    activeRegions:keys.filter((_,i)=>activity[i]>.1),
    expanded:currentCore>.5,visible,time:clock,anatomyAnalogy:true
  };}
  return {root,update,pick,select,diagnostics,dispose(){
    panel.dispose();graph.dispose();geometry.dispose();material.dispose();root.removeFromParent();
  }};
}