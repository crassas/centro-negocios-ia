import {HOLOGRAPHIC_LIGHT_GLSL} from './travis-holographic-head.mjs?v=sand-1';

// Fine, depth-writing light cells carry surface detail; travelling particles
// carry the same material between forms. The head retains its facial rig.
export function createHolographicSurfaceMaterial(THREE,{map=null,mask=false,gain=1,photo=false,natural=false,tint=0xffffff,porosity=.03}={}){
 const material=new THREE.ShaderMaterial({
  uniforms:{uPorosity:{value:porosity},uDetailScale:{value:1},uFocus:{value:1},uTime:{value:0},uBuild:{value:0},uVoice:{value:0},uMap:{value:map},uHasMap:{value:map?1:0},uMask:{value:mask?1:0},uGain:{value:gain},uPhoto:{value:photo?1:0},uNatural:{value:natural||photo?1:0},uTint:{value:new THREE.Color(tint)}},
  vertexShader:`varying vec3 vP,vN,vV;varying vec2 vUv;
   void main(){vP=position;vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);
    vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`precision highp float;
   ${HOLOGRAPHIC_LIGHT_GLSL}
   uniform float uPorosity,uDetailScale,uFocus,uTime,uBuild,uVoice,uHasMap,uMask,uGain,uPhoto,uNatural;uniform vec3 uTint;uniform sampler2D uMap;
   varying vec3 vP,vN,vV;varying vec2 vUv;
   void main(){
    vec4 texel=vec4(.68,.68,.68,1.);if(uHasMap>.5)texel=texture2D(uMap,vUv);
    if(uMask>.5&&texel.a<.15)discard;
    // Soft photographic edges remain a flat reference, never invented geometry.
    float border=min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y));
    float edgeNoise=fract(sin(dot(floor(vUv*950.),vec2(127.1,311.7)))*43758.5453);
    if(uPhoto>.5&&edgeNoise>smoothstep(0.,.018,border))discard;
    vec3 cell=floor(vP*330.*uDetailScale);float grain=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
    float front=clamp((vP.y+1.5)/3.,0.,1.)*.35+grain*.65;
    if(uBuild<.999&&front>uBuild)discard;
    if(grain>1.-mix(uPorosity,.004,uPhoto))discard;
    vec3 n=normalize(vN);float facing=max(0.,dot(n,normalize(vV)));
    float edge=pow(1.-facing,2.4),key=max(0.,dot(n,normalize(vec3(-.35,.6,1.))));
    float contour=pow(.5+.5*sin(vP.y*390.*uDetailScale),18.)*(1.-smoothstep(.7,2.2,fwidth(vP.y*390.*uDetailScale)));
    float fine=.5+.5*sin(vP.y*950.*uDetailScale);
    float value=dot(texel.rgb,vec3(.2126,.7152,.0722));
    vec3 colour=holoMatterLight(key,edge,contour*.65+fine*.08,uVoice);
    colour=mix(colour,holoMatterLight(.72,edge,.02,uVoice),uPhoto);
    colour*=mix(mix(.32,1.95,value),mix(.055,2.05,pow(value,1.08)),uPhoto)*uGain;
    vec3 naturalLight=(uHasMap>.5?texel.rgb:vec3(.7))*uTint;
    naturalLight*=mix(.36+key*.72+edge*.22,1.,uPhoto)*uGain;
    // Colour emerges through the same golden grains as the face dissolves.
    colour=mix(colour,naturalLight,uNatural*smoothstep(.12,.9,uBuild));
    // Slow, spatially coherent light through the grains; keep the geometry exact.
    float tide=sin(vP.y*3.1+vP.x*1.8-uTime*.72)*sin(vP.z*2.2+uTime*.43);
    colour*=1.+tide*(.025+uVoice*.045);
    colour+=holoGold*contour*.055;
    // A narrow reconstruction front, not a full-screen glow.
    colour+=holoGold*(1.-smoothstep(0.,.07,uBuild-front))*.18*(1.-step(.999,uBuild));
    gl_FragColor=vec4(colour*uFocus,1.);
   }`,
  depthWrite:true,depthTest:true,transparent:false,side:THREE.DoubleSide,toneMapped:false
 });
 material.userData.holographicSurface=true;
 return material;
}
