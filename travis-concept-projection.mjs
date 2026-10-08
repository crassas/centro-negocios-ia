// Small schematic 3D explanations. No generated HTML, code execution, or invented data.
export function createConceptProjection(THREE,{reducedMotion=false}={}){
  const root=new THREE.Group();root.name='TravisConceptProjection';root.position.y=.35;root.visible=false;
  let kind='',born=0,objects=[],materials=[];
  function clear(){
    root.traverse(o=>o.geometry?.dispose());for(const m of materials)m.dispose();
    root.clear();objects=[];materials=[];
  }
  function material(color=0xa8d2db,points=false){
    const m=points?new THREE.PointsMaterial({color,size:.022,transparent:true,depthWrite:false}):new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false});
    materials.push(m);return m;
  }
  function sphere(radius,color,x=0,y=0,z=0){
    const o=new THREE.Mesh(new THREE.SphereGeometry(radius,24,16),material(color));o.position.set(x,y,z);root.add(o);return o;
  }
  function loop(radius,tilt=0,colour=0x547e8b){
    const points=[];for(let i=0;i<=100;i++){const a=i/100*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*radius,Math.sin(a)*radius,0));}
    const m=new THREE.LineBasicMaterial({color:colour,transparent:true,depthWrite:false});materials.push(m);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),m);line.rotation.x=tilt;root.add(line);return line;
  }
  function show(scene,now){
    clear();kind=['orbit','atom','network','wave'].includes(scene)?scene:'network';born=now;
    if(kind==='orbit'||kind==='atom'){
      sphere(kind==='orbit'?.27:.19,kind==='orbit'?0xdcc493:0xc5e4e7);
      for(let i=0;i<3;i++){
        const radius=kind==='orbit'?.65+i*.46:1.15;
        const tilt=kind==='orbit'?.88:i*Math.PI/3;
        const ring=loop(radius,tilt);if(kind==='atom')ring.rotation.y=i*Math.PI/3;
        const bead=sphere(.07+i*.025,[0x8caeb6,0x9bbec3,0xbcaa95][i]);
        objects.push({bead,ring,radius,speed:.35+i*.13,offset:i*2.1});
      }
    }else if(kind==='network'){
      const nodes=[];
      for(let i=0;i<19;i++){
        const a=i*2.39996,y=1.3-i/18*2.6,r=Math.sqrt(Math.max(0,1.8-y*y));
        nodes.push(sphere(i===9?.105:.05,0xa9cbd2,Math.cos(a)*r,y,Math.sin(a)*r*.6));
      }
      const pairs=[];
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)if(nodes[i].position.distanceTo(nodes[j].position)<1.05)pairs.push(nodes[i].position,nodes[j].position);
      const m=new THREE.LineBasicMaterial({color:0x729aa8,transparent:true,depthWrite:false});materials.push(m);
      root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pairs),m));
      objects=nodes;
    }else{
      for(let row=0;row<6;row++){
        const positions=new Float32Array(120*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
        const m=new THREE.LineBasicMaterial({color:row===2?0xd8e8e9:0x628b9e,transparent:true,depthWrite:false});materials.push(m);
        const line=new THREE.Line(geometry,m);root.add(line);objects.push(line);
      }
    }
    root.visible=true;
  }
  return {root,show,
    hide(){kind='';root.visible=false;},
    update(now,projection,voice=0){
      if(!kind)return;
      const reveal=Math.max(0,Math.min(1,projection.panel))*Math.min(1,Math.max(0,(now-born)/.9));
      root.visible=reveal>.003;root.scale.setScalar(.82+reveal*.18);
      root.rotation.y=reducedMotion?0:Math.sin(now*.16)*.14;
      materials.forEach(m=>{m.opacity=reveal*(m.isLineBasicMaterial?.65:.9);});
      if(reducedMotion)return;
      if(kind==='orbit'||kind==='atom')for(const {bead,ring,radius,speed,offset} of objects){
        const a=now*speed+offset;bead.position.set(Math.cos(a)*radius,Math.sin(a)*radius,0).applyEuler(ring.rotation);
      }
      if(kind==='network')objects.forEach((o,i)=>o.scale.setScalar(.95+Math.sin(now*1.3+i)*.12+voice*.22));
      if(kind==='wave')objects.forEach((o,row)=>{
        const a=o.geometry.attributes.position;
        for(let i=0;i<a.count;i++){const x=i/(a.count-1)*3.5-1.75;a.setXYZ(i,x,Math.sin(x*4-now*2+row*.15)*(.25+voice*.22)*Math.exp(-x*x*.16)+(row-2.5)*.18,row*.1);}
        a.needsUpdate=true;
      });
    }
  };
}
