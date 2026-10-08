import { createBrainPanel } from './travis-brain-panel.mjs?v=3';
import { createKnowledgeGraph } from './travis-knowledge-graph.mjs?v=3';

// Stylised cerebral geometry. Functional regions are software design analogies;
// activation comes from observed backend events, never invented neuron activity.
export function createNeuralField(THREE,{reducedMotion=false,compact=false}={}){
  const root=new THREE.Group();root.name='TravisFunctionalBrain';
  const anatomy=new THREE.Group();root.add(anatomy);
  const regionNames=['attention','memory','executive','action','monitor','regulation','reflection'];
  const regions=[
    [0,-.08,.12,0x6dd3d1],[-.34,-.30,.02,0xb8a1e6],[0,.25,.83,0x83bce4],
    [.22,-.14,.24,0xe0a894],[0,.48,.14,0xe2c887],[0,-.37,.16,0x9dcfad],[0,.55,-.55,0x9bade6]
  ];
  const activity=new Float32Array(7);
  const uniforms={uTime:{value:0},uOpacity:{value:0},uDissolve:{value:0},uActivity:{value:activity}};
  const dots=[],colours=[],groups=[],sizes=[],scatter=[];
  let seed=31885;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function dot(x,y,z,region,size=1){const c=new THREE.Color(regions[region][3]);dots.push(x,y,z);colours.push(c.r,c.g,c.b);groups.push(region);sizes.push(size);const a=random()*6.283185,v=random()*2-1,r=Math.sqrt(1-v*v);scatter.push(Math.cos(a)*r,v,Math.sin(a)*r);}
  // Fine surface points follow the lobes rather than floating above the face.
  for(let i=0;i<(compact?1800:2900);i++){
    const side=random()<.5?-1:1,y=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-y*y);
    const x=side*(.435+Math.cos(a)*r*.40),z=Math.sin(a)*r*1.08;
    const region=z>.55?2:y>.35?4:z<-.40?6:side<0?1:3;
    dot(x,y*.69+.13,z,region,.7+random()*.5);
  }
  regions.forEach(([x,y,z],k)=>{
    dot(x,y,z,k,5);
    for(let j=0;j<50;j++){
      const a=random()*Math.PI*2,r=Math.cbrt(random())*.13,u=random()*2-1;
      dot(x+Math.cos(a)*r,y+u*r,z+Math.sin(a)*r,k,.9+random()*.8);
    }
  });
  function geo(position,color,region,size){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.setAttribute('aRegion',new THREE.Float32BufferAttribute(region,1));g.setAttribute('aSize',new THREE.Float32BufferAttribute(size,1));g.setAttribute('aScatter',new THREE.Float32BufferAttribute(scatter,3));return g;}
  const vertex=`uniform float uTime,uOpacity,uDissolve;uniform float uActivity[7];
    attribute float aRegion,aSize;attribute vec3 aScatter;
    varying vec3 vColor;varying float vAlpha;
    void main(){int k=int(aRegion);float strength=clamp(uActivity[k],0.0,1.0);
      vColor=color;vAlpha=(.23+strength*(.26+.26*sin(uTime*4.0+position.z*7.0)))*(1.0-uDissolve);
      vec3 scattered=position+aScatter*(uDissolve*2.0);
      scattered+=aScatter*(strength*.012*sin(uTime*4.0+position.y*10.0));
      vec4 mv=modelViewMatrix*vec4(scattered,1.0);
      gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(aSize*(1.0+strength*.5)*12.0/max(1.0,-mv.z),1.0,4.2);}`;
  const pointsMat=new THREE.ShaderMaterial({uniforms,vertexColors:true,vertexShader:vertex,
    fragmentShader:`uniform float uOpacity;varying vec3 vColor;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(vColor,uOpacity*vAlpha*(1.0-smoothstep(.08,.5,r)));}`,
    transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const points=new THREE.Points(geo(dots,colours,groups,sizes),pointsMat);points.renderOrder=4;points.name='CorticalSurface';anatomy.add(points);
  const graphFrame=new THREE.Group();root.add(graphFrame);
  const graph=createKnowledgeGraph(THREE,{reducedMotion});
  graphFrame.add(graph.root);
  let snapshot=null,currentTime=0,currentCore=0;
  const panel=createBrainPanel(data=>{snapshot=data;},data=>{if(data)graph.setData(data);else graph.offline();});
  return {root,
    update({time=0,dt=.016,core=0,intro=1,portrait=false,projection=0}={}){
      currentCore=core;currentTime=Math.max(0,time);
      root.visible=core>.008&&projection<.999;
      uniforms.uDissolve.value=Math.min(1,Math.max(0,projection));
      uniforms.uOpacity.value=core*intro*(1-projection);
      uniforms.uTime.value=reducedMotion?0:currentTime;
      root.position.set(0,portrait?.70:.57,0);
      root.scale.setScalar((portrait?1.05:1.38)*Math.max(.001,core));
      anatomy.position.set(portrait?0:-.85,portrait?.94:0,0);
      anatomy.rotation.set(.14,.18+(reducedMotion?0:Math.sin(time*.07)*.10),-.035);
      graphFrame.position.set(portrait?0:1.02,portrait?-1.20:-.06,.13);
      graphFrame.scale.setScalar(portrait?.66:.86);
      const now=Date.now()/1000;
      const fresh=snapshot&&Math.abs(now-snapshot.observedAt)<12;
      regionNames.forEach((name,i)=>{
        const module=fresh?snapshot.modules?.find(m=>m.id===name):null;
        const age=now-(module?.at||0);
        const target=module?.active&&age>=0&&age<18?Math.max(.12,1-age/18):0;
        activity[i]+=(target-activity[i])*Math.min(1,dt*5);
      });
      graph.update({time:currentTime,core:core*intro,projection,activity:activity[1]});
      panel.setVisible(core>.52&&projection<.2);
    },
    pick(raycaster){return currentCore>.5?graph.pick(raycaster):null;},
    select(id){const selected=graph.select(id);panel.setSelectedMemory(selected);return selected;},
    diagnostics(){return {kind:'functional-brain-view',backendConnected:!!snapshot,backendPhase:snapshot?.phase,
      geometry:'particle-only-silhouette',expanded:currentCore>.5,visible:root.visible,time:currentTime,
      silhouetteParticles:dots.length/3,graph:graph.diagnostics(),
      anatomyAnalogy:true,activeRegions:regionNames.filter((_,i)=>activity[i]>.1),counts:snapshot?.counts};},
    dispose(){panel.dispose();graph.dispose();root.traverse(o=>o.geometry?.dispose());pointsMat.dispose();root.removeFromParent();}
  };
}
