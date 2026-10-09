// One warm light palette for the animated face, assembly grains and projections.
export const HOLOGRAPHIC_LIGHT_GLSL=`
  const vec3 holoCopper=vec3(.53,.33,.18);
  const vec3 holoGold=vec3(.95,.78,.53);
  const vec3 holoIvory=vec3(1.,.89,.69);
  vec3 holoMatterLight(float key,float edge,float scan,float voice){
    return vec3(.020,.016,.013)+holoCopper*(.18+key*.52)
      +holoGold*(edge*.18+scan*.10+voice*.035);
  }
`;
// A projected light field on the animated anatomical mesh; no skin shading.
export function createHolographicHeadMaterial(THREE,shell=false) {
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uBuild:{value:0},uDissolve:{value:0},uState:{value:0},uOpacity:{value:shell?.32:1},uGlitch:{value:0}},
    vertexShader:`
      varying vec3 vP;varying vec3 vN;varying vec3 vV;
      void main(){vP=position;vec4 mv=modelViewMatrix*vec4(position+normal*${shell?'.0015':'0.0'},1.0);
      vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`
      precision highp float;
      ${HOLOGRAPHIC_LIGHT_GLSL}
      varying vec3 vP;varying vec3 vN;varying vec3 vV;
      uniform float uTime,uBuild,uDissolve,uState,uOpacity;
      void main(){
        // Only a head: the neck dissolves into light; shoulders never render.
        if(vP.y<.17)discard;
        float neck=smoothstep(.17,.29,vP.y);
        float front=1.18-uBuild*1.10;
        if(vP.y<front)discard;
        // Break into stable light cells, with no solid horizontal cut through the face.
        vec3 cell=floor(vP*235.0);
        float noise=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
        // A curved travelling front with fine light grains, stable in object space.
        float field=clamp((vP.y-.17)/.93,0.0,1.0)*.54+noise*.30+(.5+.5*sin(vP.x*9.0+vP.z*7.0))*.16;
        float dissolveEdge=0.0;
        if(uDissolve>0.0){
          if(uDissolve>=.999||field<uDissolve)discard;
          dissolveEdge=(1.0-smoothstep(0.0,.09,field-uDissolve))*sin(uDissolve*3.14159);
        }
        vec3 n=normalize(vN);float facing=max(0.0,dot(n,normalize(vV)));
        float edge=pow(1.0-facing,2.4);
        float contour=pow(.5+.5*sin(vP.y*390.0),18.0)*(1.0-smoothstep(.7,2.2,fwidth(vP.y*390.0)));
        float fine=(.5+.5*sin(vP.y*950.0))*(1.0-smoothstep(.7,2.2,fwidth(vP.y*950.0)));
        float sweep=exp(-pow(abs(vP.y-(.17+mod(uTime*.12,1.0)))/.012,2.0));
        float assembly=exp(-pow(abs(vP.y-front)/.026,2.0))*(1.0-step(.999,uBuild));
        float side=max(0.0,dot(n,normalize(vec3(-.75,.35,.55))));
        ${shell?`
        vec3 colour=holoCopper*1.35*(edge*.5+contour*.05+sweep*.1)+holoGold*(assembly+dissolveEdge*.7);
        gl_FragColor=vec4(colour,uOpacity*neck*(edge*.7+assembly*.9+contour*.06+dissolveEdge*.35));
        `:`
        float key=max(0.0,dot(n,normalize(vec3(-.35,.6,1.0))));
        vec3 colour=holoMatterLight(side*.6+key*.4,edge,contour*.6+fine*.10+sweep*.8,uState);
        colour+=holoGold*assembly*.72;
        colour+=mix(holoCopper,holoGold,.65)*dissolveEdge*.65;
        colour*=neck*(.95+uState*.05);
        if(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)>neck)discard;
        gl_FragColor=vec4(colour/max(neck,.001),1.0);
        `}
      }`,
    transparent:shell,blending:shell?THREE.AdditiveBlending:THREE.NormalBlending,
    depthWrite:!shell,depthTest:true,side:THREE.FrontSide,toneMapped:false
  });
  if(!shell){
    // Bloom must respect the same assembly and dissolve mask as the visible head.
    const occluder=material.clone();
    occluder.uniforms=material.uniforms;
    occluder.fragmentShader=material.fragmentShader.replace('vec4(colour/max(neck,.001),1.0)','vec4(0.0,0.0,0.0,1.0)');
    material.userData.bloomOccluder=occluder;
  }
  return material;
}

export function createAssemblyParticles(THREE,geometry) {
  const source=geometry.attributes.position,points=[];
  for(let i=0;i<source.count;i+=11)if(source.getY(i)>.19)points.push(source.getX(i),source.getY(i),source.getZ(i));
  const cloud=new THREE.BufferGeometry();cloud.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  const material=new THREE.ShaderMaterial({
    uniforms:{uBuild:{value:0},uTime:{value:0},uDissolve:{value:0}},
    vertexShader:`uniform float uBuild,uTime,uDissolve;varying float vAlpha;void main(){
      float front=1.18-uBuild*1.10;float band=exp(-pow(abs(position.y-front)/.16,2.0));
      vec3 p=position;p.x+=(1.0-uBuild)*sin(position.y*71.0+position.z*23.0)*.18;
      p.z+=(1.0-uBuild)*.2;vAlpha=band*(1.0-smoothstep(.86,1.0,uBuild));
      float seed=fract(sin(dot(position,vec3(31.7,83.1,17.3)))*43758.5453);
      vec3 cell=floor(position*235.0);
      float grain=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
      float field=clamp((position.y-.17)/.93,0.0,1.0)*.54+grain*.30+(.5+.5*sin(position.x*9.0+position.z*7.0))*.16;
      float age=max(0.0,uDissolve-field);
      float scatter=smoothstep(0.0,.45,age);
      float angle=age*4.5+seed*6.28318;
      p.x+=cos(angle)*scatter*(.2+seed*.5);
      p.z+=sin(angle)*scatter*.45;
      p.y+=scatter*(.18+seed*.45);
      float spark=smoothstep(0.0,.025,age)*(1.0-smoothstep(.08,.4,age))*(1.0-smoothstep(.88,1.0,uDissolve));
      vAlpha=max(vAlpha,spark*.75);
      vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(7.0/-mv.z,1.0,3.0);}`,
    fragmentShader:`${HOLOGRAPHIC_LIGHT_GLSL} varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(holoGold,vAlpha*(1.0-d*2.0));}`,
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false
  });
  const object=new THREE.Points(cloud,material);object.name='TravisLaserAssembly';return object;
}

export function createHolographicParticleMaterial(THREE){
 return new THREE.ShaderMaterial({
  uniforms:{uMorph:{value:0},uTime:{value:0},uOpacity:{value:0},uPixelRatio:{value:1},uVoice:{value:0}},
  vertexShader:`attribute vec3 aFrom,aTo,aNormalFrom,aNormalTo;attribute float aSeed;
    uniform float uMorph,uTime,uOpacity,uPixelRatio,uVoice;
    varying float vSeed,vOpacity,vLight,vHeight;
    void main(){
      float t=clamp(uMorph,0.0,1.0);t=t*t*(3.0-2.0*t);
      vec3 p=mix(aFrom,aTo,t);
      float rush=sin(t*3.14159265);
      p+=vec3(sin(uTime*2.1+aSeed*83.0),cos(uTime*1.7+aSeed*47.0),sin(uTime*1.3+aSeed*57.0))*rush*(.055+.08*aSeed);
      vec3 n=normalize(mix(aNormalFrom,aNormalTo,t)+vec3(.0001));
      p+=n*sin(uTime*1.2+aSeed*19.0)*(.003+uVoice*.006);
      vec4 mv=modelViewMatrix*vec4(p,1.0);
      vec3 viewNormal=normalize(normalMatrix*n),viewDirection=normalize(-mv.xyz);
      float facing=abs(dot(viewNormal,viewDirection));
      float key=max(0.,dot(viewNormal,normalize(vec3(-.35,.6,1.))));
      vLight=.42+key*.40+pow(1.-facing,2.4)*.18;
      gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp((.72+aSeed*.55)*uPixelRatio*5.0/max(2.0,-mv.z),.85,2.1);
      vSeed=aSeed;vOpacity=uOpacity*mix(.35,1.,rush);vHeight=p.y;
    }`,
  fragmentShader:`precision highp float;
    ${HOLOGRAPHIC_LIGHT_GLSL}
    uniform float uTime,uVoice;varying float vSeed,vOpacity,vLight,vHeight;
    void main(){
      float d=length(gl_PointCoord-.5);if(d>.50)discard;
      float core=1.-smoothstep(.08,.50,d);
      float scan=.5+.5*sin(vHeight*390.0-uTime*.65);
      vec3 colour=holoMatterLight(vLight,.15,scan*.65,uVoice);
      colour*=.88+vSeed*.24;
      gl_FragColor=vec4(colour,vOpacity*core*.68);
    }`,
  transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false
 });
}
