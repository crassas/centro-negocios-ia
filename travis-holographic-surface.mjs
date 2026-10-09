import {HOLOGRAPHIC_LIGHT_GLSL} from './travis-holographic-head.mjs?v=cinema-2';

// Fine, depth-writing light cells carry surface detail; travelling particles
// carry the same material between forms. The head retains its facial rig.
export function createHolographicSurfaceMaterial(THREE,{map=null,mask=false,gain=1}={}){
 const material=new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uBuild:{value:0},uVoice:{value:0},uMap:{value:map},uHasMap:{value:map?1:0},uMask:{value:mask?1:0},uGain:{value:gain}},
  vertexShader:`varying vec3 vP,vN,vV;varying vec2 vUv;
   void main(){vP=position;vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);
    vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`precision highp float;
   ${HOLOGRAPHIC_LIGHT_GLSL}
   uniform float uTime,uBuild,uVoice,uHasMap,uMask,uGain;uniform sampler2D uMap;
   varying vec3 vP,vN,vV;varying vec2 vUv;
   void main(){
    vec4 texel=vec4(.68,.68,.68,1.);if(uHasMap>.5)texel=texture2D(uMap,vUv);
    if(uMask>.5&&texel.a<.15)discard;
    vec3 cell=floor(vP*330.);float grain=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
    float front=clamp((vP.y+1.5)/3.,0.,1.)*.35+grain*.65;
    if(uBuild<.999&&front>uBuild)discard;
    if(grain>.97)discard;
    vec3 n=normalize(vN);float facing=max(0.,dot(n,normalize(vV)));
    float edge=pow(1.-facing,2.4),key=max(0.,dot(n,normalize(vec3(-.35,.6,1.))));
    float contour=pow(.5+.5*sin(vP.y*390.),18.)*(1.-smoothstep(.7,2.2,fwidth(vP.y*390.)));
    float fine=.5+.5*sin(vP.y*950.);
    float value=dot(texel.rgb,vec3(.2126,.7152,.0722));
    vec3 colour=holoMatterLight(key,edge,contour*.65+fine*.08,uVoice);
    colour*=mix(.32,1.95,value)*uGain;
    colour+=holoGold*contour*.055;
    // A narrow reconstruction front, not a full-screen glow.
    colour+=holoGold*(1.-smoothstep(0.,.07,uBuild-front))*.18*(1.-step(.999,uBuild));
    gl_FragColor=vec4(colour,1.);
   }`,
  depthWrite:true,depthTest:true,transparent:false,side:THREE.DoubleSide,toneMapped:false
 });
 material.userData.holographicSurface=true;
 return material;
}
