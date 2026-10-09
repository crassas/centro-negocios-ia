// Layered atmospheric scattering and god rays behind the animated portrait.
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
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 p=uvLight;
        // Integrate six translucent fog slices along the view direction.
        // Fixed cost keeps the portrait usable on the phone's WebGL renderer.
        vec3 colour=vec3(0.0);
        float transmission=1.0;
        for(int i=0;i<6;i++){
          float z=float(i)/5.0;
          vec2 q=(p-.5)*(1.0+z*.24)+.5;
          float mist=noise(q*vec2(13.0,9.0)+vec2(time*.018,z*7.1));
          mist=.35+.65*mist;
          float spread=.012+(1.0-q.y)*.055;
          float rayA=exp(-pow((q.x-.23-(1.0-q.y)*.36)/spread,2.0));
          float rayB=exp(-pow((q.x-.31-(1.0-q.y)*.29)/(spread*.48),2.0));
          float rayC=exp(-pow((q.x-.79+(1.0-q.y)*.25)/(spread*.75),2.0));
          float depth=field(q,vec2(.50,.57),vec2(.46,.50));
          float density=mist*depth*.16;
          vec3 light=vec3(.45,.30,.17)*(rayA*.85+rayB*.42)
                    +vec3(.21,.13,.075)*rayC*.65;
          colour+=transmission*density*light;
          transmission*=1.0-density;
        }
        float left=field(p,vec2(.30,.57),vec2(.105,.39));
        float right=field(p,vec2(.73,.49),vec2(.09,.33));
        colour+=vec3(.058,.035,.020)*left+vec3(.032,.026,.022)*right;
        // Extra depth, not a new synthetic event or an image asset.
        float amberPool=field(p,vec2(.22,.53),vec2(.35,.58));
        float bronzePool=field(p,vec2(.70,.77),vec2(.42,.40));
        colour+=vec3(.15,.079,.035)*amberPool+vec3(.055,.029,.017)*bronzePool;
        // Sparse distant dust, embedded behind the avatar rather than over its face.
        vec2 grid=p*vec2(100.0,74.0);
        vec2 cell=floor(grid);
        float seed=hash(cell);
        vec2 centre=vec2(hash(cell+13.0),hash(cell+29.0));
        float dust=exp(-dot(fract(grid)-centre,fract(grid)-centre)*220.0);
        dust*=step(.986,seed)*(.65+.35*sin(time*.35+seed*41.0));
        colour+=vec3(.41,.30,.19)*dust*.19;
        colour*=1.0+energy*.07;
        gl_FragColor=vec4(colour,1.0);
      }`,
    depthWrite:false,depthTest:true,transparent:true,blending:THREE.AdditiveBlending,toneMapped:false
  });
  const field=new THREE.Mesh(new THREE.PlaneGeometry(15,11),material);
  field.name='TravisCinematicBacklight';field.position.set(0,.3,-3.4);scene.add(field);
  const rimLeft=new THREE.DirectionalLight(0xe0bd94,1.9);
  rimLeft.position.set(-2,1.3,-1.8);scene.add(rimLeft);
  const rimRight=new THREE.DirectionalLight(0x957f6b,.85);
  rimRight.position.set(2,.8,-1.5);scene.add(rimRight);
  return {update(time,energy){material.uniforms.time.value=time;material.uniforms.energy.value=energy;}};
}
