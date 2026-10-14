/**
 * Native 3D Michael Jackson-inspired (Bad-era) hair/portrait shading.
 * Geometry is authored by Blender: scripts/build_travis_mj_bust.py.
 * This DOES NOT render photographs or a planar portrait. It preserves the
 * existing Travis facial animation, eye movement and assistant identity.
 */
export const MJ3D_ASSET='./assets/travis/travis-michael-jackson-3d.glb?v=mj3d-1';

export function styleMichaelJacksonHair(THREE, faceModel, headUniforms) {
  if (!faceModel || !headUniforms) throw new Error('MJ3D: missing face or animation uniforms');
  const hairNames=['TravisMJ_HairBase','TravisMJ_Curls'];
  const meshes=hairNames.map(name=>faceModel.getObjectByName(name));
  if(meshes.some(x=>!x?.isMesh)) {
    throw new Error('MJ3D: incomplete Blender hair meshes; expected '+hairNames.join(', '));
  }
  const u={
    uTime:headUniforms.uTime,
    uBuild:headUniforms.uBuild,
    uDissolve:headUniforms.uDissolve,
    uVoice:headUniforms.uState
  };
  const shader=new THREE.ShaderMaterial({
    uniforms:u,
    vertexShader:`
      varying vec3 vP,vN,vV;
      void main(){
        vP=position;
        vec4 mv=modelViewMatrix*vec4(position,1.);
        vN=normalize(normalMatrix*normal);
        vV=normalize(-mv.xyz);
        gl_Position=projectionMatrix*mv;
      }
    `,
    fragmentShader:`
      precision highp float;
      varying vec3 vP,vN,vV;
      uniform float uTime,uBuild,uDissolve,uVoice;
      void main(){
        // Match the original Travis face's holographic assembly/dissolve.
        vec3 cell=floor(vP*285.0);
        float grain=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
        float assemble=clamp((vP.y-.16)/1.18,0.,1.)*.73+grain*.27;
        if(uBuild<.999 && assemble>uBuild)discard;
        float field=clamp((vP.y-.12)/1.26,0.,1.)*.54+grain*.32
          +(.5+.5*sin(vP.x*13.+vP.z*8.))*.14;
        if(uDissolve>=.999 || (uDissolve>.001&&field<uDissolve))discard;
        if(grain>.998)discard;
        vec3 n=normalize(vN);
        float face=max(0.,dot(n,normalize(vV)));
        float edge=pow(1.-face,2.25);
        float light=max(0.,dot(n,normalize(vec3(-.6,.7,1.))));
        float scan=pow(.5+.5*sin(vP.y*520.-uTime*1.35),30.);
        float sweep=exp(-pow(abs(vP.y-(.16+mod(uTime*.09,1.1)))/.015,2.));
        float dissolveEdge=uDissolve>0.001?
          (1.-smoothstep(0.,.075,field-uDissolve))*(1.-step(.999,uDissolve)):0.;
        // Deep natural-blue black hair; fine gold and copper edge light;
        // physically continuous geometry turns with the real 3D bust.
        vec3 base=vec3(.011,.019,.028);
        vec3 blue=vec3(.065,.13,.18);
        vec3 copper=vec3(.40,.26,.15);
        vec3 gold=vec3(.78,.59,.31);
        vec3 colour=base+blue*(.38*light+.67*edge+scan*.13)
          +copper*(edge*.31+scan*.055+uVoice*.08)
          +gold*(dissolveEdge*.61+sweep*.16);
        colour+=vec3(.035,.060,.074)*pow(light,3.)*.15;
        gl_FragColor=vec4(colour,1.);
      }
    `,
    depthWrite:true,depthTest:true,transparent:false,side:THREE.DoubleSide,
    toneMapped:false
  });
  for(const mesh of meshes){
    mesh.material=shader;
    mesh.frustumCulled=true;
  }
  return {meshes:hairNames,material:shader,geometry:'native-blender-3d',animation:'shared-travis-face-uniforms'};
}
