// A visual map of observed UI activity, not model internals or a reasoning trace.
// Geometry is built once. Motion and light travel are evaluated on the GPU.
export function createNeuralField(THREE, {reducedMotion=false, compact=false}={}) {
  const root=new THREE.Group(); root.name='TravisNeuralInterior';
  const sectors=[
    {name:'INPUT',at:[-1.13,.55,.08],colour:0x78c9dc},
    {name:'CONTEXT',at:[-.95,-.87,-.14],colour:0xad8bca},
    {name:'PROCESS',at:[.04,1.17,-.18],colour:0x7796cb},
    {name:'TOOLS',at:[1.12,.50,.10],colour:0xd694ad},
    {name:'RESULT',at:[.96,-.84,-.04],colour:0x9ac4b5},
    {name:'VOICE',at:[-.01,-1.35,.16],colour:0xd9bb80}
  ];
  let seed=28101985;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const count=compact?380:560, vertices=[], links=[], bridges=[];
  const colours=sectors.map(s=>new THREE.Color(s.colour));
  const makeVertex=(p,sector,size=1)=>({p,sector,size,seed:random()});
  sectors.forEach((sector,k)=>{
    const cloud=[];
    for(let i=0;i<count;i++){
      const z=random()*2-1,angle=random()*Math.PI*2,r=Math.cbrt(random());
      const rim=Math.sqrt(1-z*z),a=sector.at;
      const v=makeVertex([a[0]+Math.cos(angle)*rim*r*.55,
        a[1]+z*r*.60,a[2]+Math.sin(angle)*rim*r*.43],k,random()>.965?2.5:.8+random()*.75);
      cloud.push(v);vertices.push(v);
    }
    const hub=makeVertex(sector.at.slice(),k,4.5); vertices.push(hub);
    for(let i=0;i<cloud.length;i++){
      // Local nearest neighbours give the clouds a web structure, not a solid ball.
      const near=[];
      for(let j=i+1;j<cloud.length;j++){
        const d=cloud[i].p.reduce((n,x,axis)=>n+(x-cloud[j].p[axis])**2,0);
        if(d<.095)near.push({d,j});
      }
      near.sort((a,b)=>a.d-b.d);
      near.slice(0,3).forEach(({j})=>links.push([cloud[i],cloud[j]]));
      if(i%17===0)links.push([cloud[i],hub]);
    }
    // Curved nerve bundles connect each cloud to the central junction.
    for(let strand=0;strand<5;strand++){
      const end=cloud[strand*23%cloud.length],path=[];
      for(let j=0;j<=22;j++){
        const f=j/22,bend=Math.sin(f*Math.PI),side=(strand-2)*.055;
        const v=makeVertex([end.p[0]*f+side*bend,end.p[1]*f,
          end.p[2]*f+bend*(.15+side)],k,1);
        v.seed=strand*.13; path.push(v);
        if(j)links.push([path[j-1],v]);
      }
      bridges.push(path);
    }
  });
  // Sparse central junction. No shell, ring or mechanical orb.
  for(let i=0;i<65;i++){
    const angle=random()*Math.PI*2,r=Math.sqrt(random())*.20;
    vertices.push(makeVertex([Math.cos(angle)*r,Math.sin(angle)*r,(random()-.5)*.17],6,1+random()*1.8));
  }
  const uniforms={uTime:{value:0},uOpacity:{value:0},uActivity:{value:0},
    uSector:{value:6},uTool:{value:0},uVoice:{value:0},uPixelRatio:{value:1}};
  const colourFor=v=>v.sector===6?new THREE.Color(0x83d3c4):colours[v.sector];
  function geometry(items){
    const p=[],c=[],s=[],k=[],z=[];
    items.forEach(v=>{p.push(...v.p);const colour=colourFor(v);c.push(colour.r,colour.g,colour.b);s.push(v.seed);k.push(v.sector);z.push(v.size);});
    const g=new THREE.BufferGeometry();
    for(const [name,values,stride] of [['position',p,3],['color',c,3],['aSeed',s,1],['aSector',k,1],['aSize',z,1]])
      g.setAttribute(name,new THREE.Float32BufferAttribute(values,stride));
    return g;
  }
  const common=`
    uniform float uTime,uOpacity,uActivity,uSector,uTool,uVoice,uPixelRatio;
    attribute float aSeed,aSector,aSize;
    varying vec3 vColor; varying float vLight;
    vec3 flow(vec3 p){
      float s=aSector*1.618;
      p.x+=sin(uTime*.27+s+p.y*2.0)*.026;
      p.y+=cos(uTime*.23+s+p.x*1.7)*.022;
      p.z+=sin(uTime*.31+s+p.y)*.046;
      return p;
    }
    float activity(){
      float chosen=1.0-step(.3,abs(aSector-uSector));
      float tool=(1.0-step(.3,abs(aSector-3.0)))*uTool;
      return max(chosen*uActivity,tool);
    }
  `;
  const pointMaterial=new THREE.ShaderMaterial({uniforms,vertexColors:true,
    vertexShader:common+`
      void main(){
        vec3 p=flow(position);vec4 mv=modelViewMatrix*vec4(p,1.0);
        float engaged=activity();
        float wave=pow(.5+.5*sin(length(position)*9.0-uTime*(2.0+engaged*3.0)),8.0);
        vLight=.40+engaged*(.34+wave*.42)+uVoice*.10;
        vColor=color;gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(aSize*(1.0+engaged*.28)*uPixelRatio*9.0/-mv.z,1.0,7.0);
      }`,
    fragmentShader:`uniform float uOpacity;varying vec3 vColor;varying float vLight;
      void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;
        float dotLight=1.0-smoothstep(.12,.5,r);
        gl_FragColor=vec4(vColor*(.9+vLight*.6),dotLight*vLight*uOpacity);}`,
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,toneMapped:false
  });
  const points=new THREE.Points(geometry(vertices),pointMaterial);points.name='NeuralClouds';
  points.renderOrder=6;points.frustumCulled=false;root.add(points);
  const lineMaterial=new THREE.ShaderMaterial({uniforms,vertexColors:true,
    vertexShader:common+`
      void main(){vec3 p=flow(position);float engaged=activity();
        float travel=pow(.5+.5*sin(length(position)*11.0-uTime*(1.5+engaged*4.0)),12.0);
        vLight=.024+engaged*(.025+travel*.13);vColor=color;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
    fragmentShader:`uniform float uOpacity;varying vec3 vColor;varying float vLight;
      void main(){gl_FragColor=vec4(vColor,vLight*uOpacity);}`,
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,toneMapped:false
  });
  const lines=new THREE.LineSegments(geometry(links.flat()),lineMaterial);lines.name='NeuralConnections';
  lines.renderOrder=5;lines.frustumCulled=false;root.add(lines);
  // Small moving signal points, constrained to the nerve bundles.
  const signals=bridges.map((path,i)=>({path,sector:Math.floor(i/5),offset:(i%5)/5}));
  const signalGeo=geometry(signals.map(s=>makeVertex([0,0,0],s.sector,3.3)));
  const signalPositions=signalGeo.attributes.position;
  const signalMaterial=pointMaterial.clone();signalMaterial.uniforms=uniforms;
  const packets=new THREE.Points(signalGeo,signalMaterial);packets.name='NeuralSignals';
  packets.renderOrder=7;packets.frustumCulled=false;packets.layers.enable(1);root.add(packets);
  const labels=[];
  for(const sector of sectors){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
    const ctx=canvas.getContext('2d');if(!ctx)continue;
    ctx.font='500 28px monospace';ctx.textAlign='center';ctx.fillStyle='#b4c5cf';
    ctx.fillText(sector.name,256,37);ctx.fillStyle='#556571';ctx.font='17px monospace';
    ctx.fillText('TRAVIS / '+String(labels.length+1).padStart(2,'0'),256,67);
    const texture=new THREE.CanvasTexture(canvas);
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,opacity:0,depthTest:false,depthWrite:false});
    const label=new THREE.Sprite(material);label.position.set(sector.at[0],sector.at[1]+.70,sector.at[2]);
    label.scale.set(.95,.178,1);label.renderOrder=8;root.add(label);labels.push(label);
  }
  let toolUntil=0, lastState='idle', disposed=false, expanded=0, clock=0;
  const onResult=e=>{if(e.detail?.tool)toolUntil=performance.now()+1600;};
  window.addEventListener('travis:result',onResult);
  return {root,
    update({time=0,dt=.016,state='ready',voice=0,core=0,face=1,faceRoot=null,intro=1,projection=0,portrait=false,pixelRatio=1}={}){
      if(disposed)return;
      lastState=state;expanded=core;clock=reducedMotion?0:Math.max(0,Number(time)||0);
      uniforms.uTime.value=clock;uniforms.uPixelRatio.value=pixelRatio;
      uniforms.uSector.value=state==='listening'?0:state==='speaking'?5:state==='thinking'?2:6;
      uniforms.uActivity.value=state==='thinking'?.95:state==='listening'?.8:state==='speaking'?.62:0;
      uniforms.uTool.value=performance.now()<toolUntil?.9:0;
      uniforms.uVoice.value=state==='speaking'?Math.min(1,Math.max(0,voice))*.7:0;
      // In face mode the cognitive signal remains perceptible but never masks the eyes/forehead.
      const faceAlpha=(state==='thinking'?.19:.09)*(1-projection);
      uniforms.uOpacity.value=intro*(core+face*faceAlpha);
      root.visible=uniforms.uOpacity.value>.005;
      const fullScale=portrait?.88:1.36;
      const innerScale=.29;
      root.scale.set(innerScale*face+fullScale*core,.16*face+fullScale*core,.27*face+fullScale*core);
      const headY=faceRoot?.position.y??.86;
      root.position.set(0,(headY+.37)*face+(portrait?.61:.38)*core,.13*face);
      root.rotation.set((faceRoot?.rotation.x||0)*face,
        (faceRoot?.rotation.y||0)*face+(reducedMotion?0:Math.sin(time*.08)*.13)*core,
        (faceRoot?.rotation.z||0)*face);
      labels.forEach(label=>{label.material.opacity=core*intro*.83;});
      for(let i=0;i<signals.length;i++){
        const s=signals[i],engaged=s.sector===uniforms.uSector.value||state==='thinking';
        const f=(clock*(engaged?.23:.055)+s.offset)%1;
        const cursor=f*(s.path.length-1),a=Math.floor(cursor),b=Math.min(a+1,s.path.length-1),mix=cursor-a;
        const p=s.path[a].p,q=s.path[b].p;
        signalPositions.setXYZ(i,p[0]+(q[0]-p[0])*mix,p[1]+(q[1]-p[1])*mix,p[2]+(q[2]-p[2])*mix);
      }
      signalPositions.needsUpdate=true;
      // Only actual activity produces travelling signal highlights.
      packets.visible=!reducedMotion&&(uniforms.uActivity.value>0||uniforms.uTool.value>0);
    },
    diagnostics(){return {kind:'visual-state-map',version:1,nodes:vertices.length,connections:links.length,
      state:lastState,expanded:expanded>.5,opacity:uniforms.uOpacity.value,time:clock,reducedMotion,
      source:'travis:state / audio envelope / tool result',visible:root.visible};},
    dispose(){if(disposed)return;disposed=true;window.removeEventListener('travis:result',onResult);
      root.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});root.removeFromParent();}
  };
}
