// A quiet, actual depth field behind the subject. No gold screen overlay.
export function createBacklight(THREE,scene){
 const uniforms={uTime:{value:0},uSpace:{value:.16}};let lastTime=0;
 const mist=new THREE.ShaderMaterial({uniforms,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy, .999, 1.);}',fragmentShader:`precision highp float;varying vec2 vUv;uniform float uSpace;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
 void main(){vec2 p=vUv;float band=exp(-pow((p.x-p.y*.54-.40)*3.5,2.));float n=noise(p*7.+noise(p*13.)*.7);vec3 hue=mix(vec3(.017,.024,.048),vec3(.042,.027,.054),n);gl_FragColor=vec4(hue*band*n*uSpace,1.);}`,
 depthTest:false,depthWrite:false,toneMapped:false});
 const nebula=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mist);nebula.frustumCulled=false;nebula.renderOrder=-10;nebula.name='TravisDeepSpace';scene.add(nebula);
 const pos=[],colour=[],size=[],phase=[];
 const rand=(i,s)=>{const v=Math.sin(i*127.1+s*311.7)*43758.5453;return v-Math.floor(v);};
 for(let i=0;i<1700;i++){
  pos.push((rand(i,1)-.5)*65,(rand(i,2)-.5)*70,-5-rand(i,3)*38);
  const temperature=rand(i,4);colour.push(.65+temperature*.35,.76+temperature*.20,1-temperature*.25);size.push(.55+Math.pow(rand(i,5),5)*1.2);phase.push(rand(i,6)*6.28);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colour,3));geo.setAttribute('aSize',new THREE.Float32BufferAttribute(size,1));geo.setAttribute('aPhase',new THREE.Float32BufferAttribute(phase,1));
 const mat=new THREE.ShaderMaterial({uniforms,vertexShader:`attribute vec3 color;attribute float aSize,aPhase;uniform float uTime,uSpace;varying vec3 vColor;varying float vAlpha;void main(){vec3 p=position;p.x+=sin(uTime*.017+aPhase)*.14;p.y+=cos(uTime*.013+aPhase)*.09;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=aSize*clamp(17./-mv.z,.65,1.8);vColor=color;vAlpha=(.20+uSpace*.7)*(.9+.1*sin(uTime*.2+aPhase));}`,
 fragmentShader:'precision highp float;varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(vColor,vAlpha*(1.-smoothstep(.05,.5,d)));}',transparent:true,depthWrite:false,depthTest:true,toneMapped:false,blending:THREE.AdditiveBlending});
 const stars=new THREE.Points(geo,mat);stars.name='TravisDepthStars';stars.frustumCulled=false;stars.renderOrder=-9;scene.add(stars);
 const left=new THREE.DirectionalLight(0xe0bd94,1.9);left.position.set(-2,1.3,-1.8);scene.add(left);
 const right=new THREE.DirectionalLight(0x957f6b,.85);right.position.set(2,.8,-1.5);scene.add(right);
 return {update(time,energy,state){
  const space=state?.visible&&(['planet','space','journey'].includes(state.kind)||state.animation?.environment==='space'||state.kind==='science'&&/black-hole/.test(state.variant));
  const dt=Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
  uniforms.uTime.value=time;uniforms.uSpace.value+=((space?.95:.16)-uniforms.uSpace.value)*(time===0?1:1-Math.exp(-dt*2));
 }};
}
