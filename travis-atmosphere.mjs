// A single light field behind the portrait. No foreground veil or extra render pass.
export function createBacklight(THREE,scene) {
  const material=new THREE.ShaderMaterial({
    uniforms:{time:{value:0},energy:{value:0}},
    vertexShader:`varying vec2 uvLight;void main(){uvLight=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      precision highp float;
      varying vec2 uvLight;
      uniform float time;
      uniform float energy;
      float field(vec2 p,vec2 c,vec2 radius){vec2 q=(p-c)/radius;return exp(-dot(q,q)*2.0);}
      void main(){
        vec2 p=uvLight;
        float drift=sin(time*.16)*.012;
        float haze=field(p,vec2(.49,.53),vec2(.31,.36));
        float left=field(p,vec2(.34+drift,.58),vec2(.12,.49));
        float right=field(p,vec2(.67-drift,.56),vec2(.11,.46));
        float crown=field(p,vec2(.50,.68),vec2(.20,.075));
        float shaft1=exp(-pow((p.x-.29-(p.y-.5)*.22)/.027,2.0))*field(p,vec2(.35,.64),vec2(.28,.49));
        float shaft2=exp(-pow((p.x-.72+(p.y-.5)*.16)/.020,2.0))*field(p,vec2(.64,.58),vec2(.30,.44));
        vec3 colour=vec3(.008,.055,.13)*haze
          +vec3(.015,.28,.44)*left+vec3(.075,.13,.30)*right
          +vec3(.08,.22,.30)*crown
          +vec3(.09,.32,.43)*shaft1*.48+vec3(.24,.16,.10)*shaft2*.26;
        colour*=.72*(1.0+energy*.09);
        gl_FragColor=vec4(colour,1.0);
      }`,
    depthWrite:false,depthTest:true,transparent:true,blending:THREE.AdditiveBlending,toneMapped:false
  });
  const field=new THREE.Mesh(new THREE.PlaneGeometry(15,11),material);
  field.name='TravisCinematicBacklight';field.position.set(0,.3,-3.4);scene.add(field);
  const rimLeft=new THREE.DirectionalLight(0x74dfff,1.8);
  rimLeft.position.set(-2,1.3,-1.8);scene.add(rimLeft);
  const rimRight=new THREE.DirectionalLight(0x7e9dff,1.2);
  rimRight.position.set(2,.8,-1.5);scene.add(rimRight);
  return {update(time,energy){material.uniforms.time.value=time;material.uniforms.energy.value=energy;}};
}
