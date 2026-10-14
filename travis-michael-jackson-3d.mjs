/**
 * Michael Jackson × Travis / TRUE licensed volumetric facial model.
 * No photograph, billboard, or synthetic helmet.
 * CC BY 3.0 France: https://www.free-3d.fr/model/michael-jackson-3d-avatar-portait-50676
 * Modifications: jacket cropped in Blender; glTF transformation, holographic
 * shader, dissolve and mouth motion. Unofficial artistic adaptation.
 */
export const MJ3D_ASSET='./assets/travis/travis-michael-jackson-3d.glb?v=mj3d-2';

function licensedFaceMaterial(THREE,head,headUniforms){
  head.geometry.computeBoundingBox();
  const box=head.geometry.boundingBox;
  const original=Array.isArray(head.material)?head.material[0]:head.material;
  const originalTexture=original?.map||null;
  if(!originalTexture) throw new Error('MJ3D: licensed source texture map missing');
  const height=Math.max(.2,box.max.y-box.min.y);
  const uniforms={
    uMap:{value:originalTexture},
    uTime:headUniforms.uTime,uBuild:headUniforms.uBuild,
    uDissolve:headUniforms.uDissolve,uVoice:headUniforms.uState,
    uBottom:{value:box.min.y},uTop:{value:box.max.y},
    uFront:{value:box.max.z},
    uMouthY:{value:box.min.y+height*.39},
    uMouthX:{value:(box.min.x+box.max.x)*.5},
    uWidth:{value:Math.max(.07,(box.max.x-box.min.x)*.16)}
  };
  const shader=new THREE.ShaderMaterial({
    uniforms,
    vertexShader:`
      varying vec2 vUv;
      varying vec3 vP,vN,vV;
      uniform float uTime,uVoice,uFront,uMouthY,uMouthX,uWidth;
      void main(){
        vUv=uv;vP=position;
        vec3 p=position;
        float mouth=exp(-pow((position.x-uMouthX)/uWidth,2.0)
                        -pow((position.y-uMouthY)/.052,2.0))
          *smoothstep(uFront-.20,uFront-.04,position.z);
        p.y-=mouth*uVoice*.031;
        p.z+=mouth*uVoice*.008;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        vN=normalize(normalMatrix*normal);
        vV=normalize(-mv.xyz);
        gl_Position=projectionMatrix*mv;
      }
    `,
    fragmentShader:`
      precision highp float;
      varying vec2 vUv;varying vec3 vP,vN,vV;
      uniform sampler2D uMap;
      uniform float uTime,uBuild,uDissolve,uVoice,uBottom,uTop;
      void main(){
        vec4 surface=texture2D(uMap,vUv);
        if(surface.a<.035)discard;
        float height=max(.01,uTop-uBottom);
        float h=clamp((vP.y-uBottom)/height,0.,1.);
        float hash=fract(sin(dot(floor(vP*284.),vec3(12.9898,78.233,37.719)))*43758.5453);
        float assemble=1.-(h*.80+hash*.20);
        if(uBuild<.999&&uBuild<assemble)discard;
        float field=h*.51+hash*.35+(.5+.5*sin(vP.x*15.+vP.z*11.))*.14;
        if(uDissolve>=.999||(uDissolve>.001&&field<uDissolve))discard;
        vec3 n=normalize(vN);
        vec3 view=normalize(vV);
        float fresnel=pow(1.-max(0.,dot(n,view)),2.6);
        float key=max(0.,dot(n,normalize(vec3(-.55,.6,1.))));
        float scan=pow(.5+.5*sin(vP.y*470.-uTime*1.4),21.);
        float sweep=exp(-pow((h-mod(uTime*.08,1.0))/.017,2.));
        float dissolveFront=(1.-smoothstep(0.,.065,field-uDissolve))
          *step(.001,uDissolve)*(1.-step(.999,uDissolve));
        vec3 source=surface.rgb;
        vec3 face=source*(.67+.45*key);
        face=mix(face,face*vec3(.67,.87,1.06),.27);
        vec3 cool=vec3(.17,.60,.83);
        vec3 gold=vec3(.83,.62,.38);
        face+=cool*(fresnel*.19+scan*.018+sweep*.12);
        face+=gold*(fresnel*.058+dissolveFront*.34);
        face+=vec3(.12,.26,.32)*uVoice*.018;
        float neck=smoothstep(0.,.19,h);
        float opacity=surface.a*neck;
        if(opacity<.016)discard;
        gl_FragColor=vec4(face,opacity);
      }
    `,
    transparent:true,depthWrite:true,depthTest:true,side:THREE.FrontSide,
    toneMapped:false
  });
  shader.name='TravisMichaelJacksonReal3DHologram';
  return shader;
}

export function styleMichaelJacksonHair(THREE,faceModel,headUniforms){
  if(!faceModel||!headUniforms)throw new Error('MJ3D: original Travis rig missing');
  const head=faceModel.getObjectByName('TravisMJ_Licensed_Head');
  if(!head?.isMesh)throw new Error('MJ3D: real licensed Michael Jackson head missing');
  const oldMaterial=head.material;
  head.material=licensedFaceMaterial(THREE,head,headUniforms);
  head.userData.michaelJacksonLicense='CC BY 3.0 France · free-3d.fr';
  head.frustumCulled=true;
  // Support older installed Travis UIs: they may add the original hologram
  // shell and eye pivots AFTER this function is called. Hide them at the end
  // of the current loading turn, without touching animation geometry.
  queueMicrotask(()=>{
    faceModel.traverse(object=>{
      if(object.name==='TravisFace_Bust' ||
         object.name==='TravisFace_HologramShell' ||
         object.name==='TravisLaserAssembly' ||
         /^TravisFace_(Eye|Iris|Pupil|EyeAccent)_/.test(object.name)){
        object.visible=false;
      }
    });
  });
  return {
    meshes:[head.name],material:head.material,
    textured:Boolean((Array.isArray(oldMaterial)?oldMaterial[0]:oldMaterial)?.map),
    geometry:'real Michael Jackson Blender 3D mesh',
    animation:'original Travis face shader uniforms; subtle audio mouth motion',
    source:'https://www.free-3d.fr/model/michael-jackson-3d-avatar-portait-50676'
  };
}
