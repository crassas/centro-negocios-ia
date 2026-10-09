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
        vec3 colour=vec3(.74,.48,.24)*(edge*.5+contour*.05+sweep*.1)+vec3(1.0,.81,.56)*(assembly+dissolveEdge*.7);
        gl_FragColor=vec4(colour,uOpacity*neck*(edge*.7+assembly*.9+contour*.06+dissolveEdge*.35));
        `:`
        float key=max(0.0,dot(n,normalize(vec3(-.35,.6,1.0))));
        vec3 dark=vec3(.020,.016,.013);
        vec3 colour=dark+vec3(.27,.16,.08)*side*.64+vec3(.13,.085,.045)*key;
        colour+=vec3(.59,.35,.17)*(edge*.46+contour*.095+fine*.018+sweep*.13);
        colour+=vec3(.98,.78,.54)*assembly*.72;
        colour+=vec3(.82,.59,.34)*dissolveEdge*.65;
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
    fragmentShader:`varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.48,.9,1.0,vAlpha*(1.0-d*2.0));}`,
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false
  });
  const object=new THREE.Points(cloud,material);object.name='TravisLaserAssembly';return object;
}
