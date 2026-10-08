import { createBrainPanel } from './travis-brain-panel.mjs?v=2';

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
  const uniforms={uTime:{value:0},uOpacity:{value:0},uActivity:{value:activity}};
  const cortexMaterial=new THREE.ShaderMaterial({uniforms,
    vertexShader:`varying vec3 vP,vN,vV;void main(){vP=position;vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float uOpacity;varying vec3 vP,vN,vV;
      void main(){float facing=abs(dot(normalize(vN),normalize(vV)));float edge=pow(1.0-facing,2.0);
        float ridge=.5+.5*sin(vP.y*37.0+sin(vP.z*14.0)*2.1+sin(vP.x*17.0));
        vec3 c=mix(vec3(.025,.075,.092),vec3(.21,.43,.47),facing*.42+edge*.5+ridge*.12);
        gl_FragColor=vec4(c,uOpacity*(.21+edge*.44+ridge*.075));}`,
    transparent:true,depthWrite:false,side:THREE.FrontSide,toneMapped:false
  });
  for(const side of [-1,1]){
    const geometry=new THREE.SphereGeometry(1,compact?76:100,compact?52:68);
    const position=geometry.attributes.position;
    for(let i=0;i<position.count;i++){
      const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
      const folds=.026*Math.sin(y*27+Math.sin(z*12)*1.7)+.022*Math.sin(z*28+Math.sin(x*15)*1.9);
      const radial=1+folds;
      position.setXYZ(i,side*(.435+x*.40*radial),y*.69*radial+.13,z*1.08*radial);
    }
    position.needsUpdate=true;geometry.computeVertexNormals();
    const hemisphere=new THREE.Mesh(geometry,cortexMaterial);hemisphere.name=side<0?'LeftHemisphere':'RightHemisphere';
    hemisphere.renderOrder=2;anatomy.add(hemisphere);
    // Cerebellar folds are finer and horizontal.
    const cg=new THREE.SphereGeometry(1,48,32),cp=cg.attributes.position;
    for(let i=0;i<cp.count;i++){
      const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i),fold=1+.047*Math.sin(y*49);
      cp.setXYZ(i,side*.29+x*.31*fold,-.57+y*.27,-.62+z*.43*fold);
    }
    cg.computeVertexNormals();const cerebellum=new THREE.Mesh(cg,cortexMaterial);cerebellum.name='Cerebellum';cerebellum.renderOrder=2;anatomy.add(cerebellum);
  }
  const stemPath=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.18,-.20),new THREE.Vector3(0,-.48,-.35),new THREE.Vector3(0,-.90,-.34),new THREE.Vector3(0,-1.13,-.27)]);
  const stem=new THREE.Mesh(new THREE.TubeGeometry(stemPath,40,.075,10,false),cortexMaterial);stem.name='BrainStem';anatomy.add(stem);
  const dots=[],colours=[],groups=[],sizes=[];
  let seed=31885;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function dot(x,y,z,region,size=1){const c=new THREE.Color(regions[region][3]);dots.push(x,y,z);colours.push(c.r,c.g,c.b);groups.push(region);sizes.push(size);}
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
  function geo(position,color,region,size){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.setAttribute('aRegion',new THREE.Float32BufferAttribute(region,1));g.setAttribute('aSize',new THREE.Float32BufferAttribute(size,1));return g;}
  const vertex=`uniform float uTime,uOpacity;uniform float uActivity[7];attribute float aRegion,aSize;varying vec3 vColor;varying float vAlpha;
    void main(){int k=int(aRegion);float strength=uActivity[k];vColor=color;vAlpha=.19+strength*(.30+.28*sin(uTime*4.0+position.z*7.0));
      vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*(1.0+strength*.4)*11.0/-mv.z,1.0,6.0);}`;
  const pointsMat=new THREE.ShaderMaterial({uniforms,vertexColors:true,vertexShader:vertex,
    fragmentShader:`uniform float uOpacity;varying vec3 vColor;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(vColor,uOpacity*vAlpha*(1.0-smoothstep(.08,.5,r)));}`,
    transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const points=new THREE.Points(geo(dots,colours,groups,sizes),pointsMat);points.renderOrder=4;points.name='CorticalSurface';anatomy.add(points);
  const lp=[],lc=[],lg=[],ls=[];
  const pathways=[[0,2],[0,1],[2,3],[3,4],[4,1],[5,0],[5,6],[1,6],[6,2],[1,2]];
  for(const [a,b] of pathways){
    const start=new THREE.Vector3(...regions[a].slice(0,3)),end=new THREE.Vector3(...regions[b].slice(0,3));
    const middle=start.clone().lerp(end,.5);middle.z+=.10;
    const path=new THREE.QuadraticBezierCurve3(start,middle,end).getPoints(28);
    for(let i=1;i<path.length;i++)for(const p of [path[i-1],path[i]]){lp.push(p.x,p.y,p.z);const c=new THREE.Color(regions[b][3]);lc.push(c.r,c.g,c.b);lg.push(b);ls.push(1);}
  }
  const linesMat=new THREE.ShaderMaterial({uniforms,vertexColors:true,vertexShader:vertex,
    fragmentShader:`uniform float uOpacity;varying vec3 vColor;varying float vAlpha;void main(){gl_FragColor=vec4(vColor,uOpacity*vAlpha*.35);}`,
    transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const pathwaysMesh=new THREE.LineSegments(geo(lp,lc,lg,ls),linesMat);pathwaysMesh.renderOrder=3;anatomy.add(pathwaysMesh);
  let snapshot=null,currentTime=0,currentCore=0;
  const panel=createBrainPanel(data=>{snapshot=data;});
  return {root,
    update({time=0,dt=.016,core=0,intro=1,portrait=false}={}){
      currentCore=core;currentTime=Math.max(0,time);root.visible=core>.008;
      uniforms.uOpacity.value=core*intro;uniforms.uTime.value=reducedMotion?0:currentTime;
      root.position.set(0,portrait?.80:.57,0);root.scale.setScalar((portrait?1.42:1.65)*Math.max(.001,core));
      anatomy.rotation.set(.14,.45+(reducedMotion?0:Math.sin(time*.08)*.11),-.035);
      const fresh=snapshot && Date.now()/1000-snapshot.observedAt<12;
      regionNames.forEach((name,i)=>{const module=fresh?snapshot.modules?.find(m=>m.id===name):null;
        const target=module?.active?Math.max(.18,1-(Date.now()/1000-module.at)/18):0;
        activity[i]+=(target-activity[i])*Math.min(1,dt*5);
      });
      panel.setVisible(core>.5);
    },
    diagnostics(){return {kind:'functional-brain-view',backendConnected:!!snapshot,backendPhase:snapshot?.phase,
      geometry:'stylised-cerebral-hemispheres',expanded:currentCore>.5,visible:root.visible,time:currentTime,
      anatomyAnalogy:true,activeRegions:regionNames.filter((_,i)=>activity[i]>.1),counts:snapshot?.counts};},
    dispose(){panel.dispose();root.traverse(o=>o.geometry?.dispose());cortexMaterial.dispose();pointsMat.dispose();linesMat.dispose();root.removeFromParent();}
  };
}
