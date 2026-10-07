// A projected light field on the animated anatomical mesh; no skin shading.
export function createHolographicHeadMaterial(THREE,shell=false) {
  return new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uBuild:{value:0},uState:{value:0},uOpacity:{value:shell?.32:1},uGlitch:{value:0}},
    vertexShader:`
      varying vec3 vP;varying vec3 vN;varying vec3 vV;
      void main(){vP=position;vec4 mv=modelViewMatrix*vec4(position+normal*${shell?'.0015':'0.0'},1.0);
      vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`
      precision highp float;
      varying vec3 vP;varying vec3 vN;varying vec3 vV;
      uniform float uTime,uBuild,uState,uOpacity;
      void main(){
        // Only a head: the neck dissolves into light; shoulders never render.
        if(vP.y<.17)discard;
        float neck=smoothstep(.17,.29,vP.y);
        float front=1.18-uBuild*1.10;
        if(vP.y<front)discard;
        vec3 n=normalize(vN);float facing=max(0.0,dot(n,normalize(vV)));
        float edge=pow(1.0-facing,2.4);
        float contour=pow(.5+.5*sin(vP.y*390.0),18.0);
        float fine=.5+.5*sin(vP.y*950.0);
        float sweep=exp(-pow(abs(vP.y-(.17+mod(uTime*.12,1.0)))/.012,2.0));
        float assembly=exp(-pow(abs(vP.y-front)/.026,2.0))*(1.0-step(.999,uBuild));
        float side=max(0.0,dot(n,normalize(vec3(-.75,.35,.55))));
        ${shell?`
        vec3 colour=vec3(.19,.72,.78)*(edge*.5+contour*.05+sweep*.1)+vec3(.66,.94,1.0)*assembly;
        gl_FragColor=vec4(colour,uOpacity*neck*(edge*.7+assembly*.9+contour*.06));
        `:`
        vec3 dark=vec3(.006,.027,.038);
        vec3 colour=dark+vec3(.055,.29,.33)*side*.6;
        colour+=vec3(.19,.61,.67)*(edge*.46+contour*.095+fine*.018+sweep*.13);
        colour+=vec3(.63,.91,.98)*assembly*.72;
        colour*=neck*(.95+uState*.05);
        if(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)>neck)discard;
        gl_FragColor=vec4(colour/max(neck,.001),1.0);
        `}
      }`,
    transparent:shell,blending:shell?THREE.AdditiveBlending:THREE.NormalBlending,
    depthWrite:!shell,depthTest:true,side:THREE.FrontSide,toneMapped:false
  });
}

export function createAssemblyParticles(THREE,geometry) {
  const source=geometry.attributes.position,points=[];
  for(let i=0;i<source.count;i+=11)if(source.getY(i)>.19)points.push(source.getX(i),source.getY(i),source.getZ(i));
  const cloud=new THREE.BufferGeometry();cloud.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  const material=new THREE.ShaderMaterial({
    uniforms:{uBuild:{value:0},uTime:{value:0}},
    vertexShader:`uniform float uBuild,uTime;varying float vAlpha;void main(){
      float front=1.18-uBuild*1.10;float band=exp(-pow(abs(position.y-front)/.16,2.0));
      vec3 p=position;p.x+=(1.0-uBuild)*sin(position.y*71.0+position.z*23.0)*.18;
      p.z+=(1.0-uBuild)*.2;vAlpha=band*(1.0-smoothstep(.86,1.0,uBuild));
      vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(7.0/-mv.z,1.0,3.0);}`,
    fragmentShader:`varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.48,.9,1.0,vAlpha*(1.0-d*2.0));}`,
    transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false
  });
  const object=new THREE.Points(cloud,material);object.name='TravisLaserAssembly';return object;
}
