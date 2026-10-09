// Actual persisted Travis memory graph. Decorative neural field is a separate layer.
// Only renders nodes and relations supplied by the loopback-only /brain/graph endpoint.
export function createKnowledgeGraph(THREE,{reducedMotion=false}={}) {
  const root=new THREE.Group();root.name='TravisKnowledgeGraph';
  const colour={FACT:0xe4d0af,CONCEPT:0xbc9b75,DECISION:0xf1d9b7,RULE:0xd2a470};
  let data={nodes:[],links:[]},fingerprint='',hits=null,shapes=null,lines=null,light=null,labels=[];
  let selectedId='',status='waiting',lastUpdated=0;
  const locationById=new Map(),nodeById=new Map();
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const shade=(n)=>new THREE.Color(colour[n.kind]??0xc3b2a0);
  const seedOf=(s)=>{let h=2166136261;for(const ch of String(s)){h=Math.imul(h^ch.charCodeAt(0),16777619);}return (h>>>0)/4294967296;};
  function positionGraph(nodes,edges) {
    const pos=nodes.map((n,i)=>{
      const az=(i*2.399963+seedOf(n.id)*.4),z=1-2*(i+.5)/nodes.length,r=Math.sqrt(1-z*z);
      const m=.84+.44*seedOf(n.projectId||n.id);
      return new THREE.Vector3(Math.cos(az)*r*m,Math.sin(az)*r*m,z*m*.55);
    });
    const lookup=new Map(nodes.map((n,i)=>[n.id,i]));
    const springs=edges.map(e=>[lookup.get(e.source),lookup.get(e.target),clamp(e.weight||.5,.1,1)])
      .filter(([a,b])=>a!==undefined&&b!==undefined&&a!==b);
    const delta=pos.map(()=>new THREE.Vector3());
    for(let pass=0;pass<Math.min(72,32+nodes.length);pass++){
      delta.forEach(d=>d.set(0,0,0));
      for(let i=0;i<pos.length;i++)for(let j=i+1;j<pos.length;j++){
        const diff=pos[i].clone().sub(pos[j]),d2=Math.max(.025,diff.lengthSq());
        const force=.0075/d2;diff.multiplyScalar(force/Math.sqrt(d2));
        delta[i].add(diff);delta[j].sub(diff);
      }
      for(const [a,b,w] of springs){
        const diff=pos[b].clone().sub(pos[a]),length=Math.max(.001,diff.length());
        const spring=clamp((length-(.40+.42*(1-w)))*.023,-.032,.032);
        diff.multiplyScalar(spring/length);delta[a].add(diff);delta[b].sub(diff);
      }
      for(let i=0;i<pos.length;i++)pos[i].addScaledVector(delta[i],.55)
        .multiplyScalar(.996).clampLength(.10,1.65);
    }
    return pos;
  }
  function disposeGraph(){
    const geometries=new Set(),materials=new Set(),textures=new Set();
    root.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      if(o.material)for(const m of (Array.isArray(o.material)?o.material:[o.material])){
        materials.add(m);if(m.map)textures.add(m.map);
      }
    });
    root.clear();geometries.forEach(g=>g.dispose());
    materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    hits=shapes=lines=light=null;labels=[];
    locationById.clear();nodeById.clear();
  }
  function makeLabel(n,p){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.clearRect(0,0,512,128);
    ctx.font='500 26px system-ui,sans-serif';ctx.fillStyle='#f1e2c9';
    ctx.textAlign='center';ctx.textBaseline='middle';
    let label=String(n.title||'MEMÓRIA').replace(/\s+/g,' ').trim();
    if(label.length>30)label=label.slice(0,29)+'…';
    ctx.fillText(label,256,52,485);
    ctx.font='19px monospace';ctx.fillStyle='#ac947b';ctx.fillText(n.kind||'MEMÓRIA',256,92);
    const texture=new THREE.CanvasTexture(canvas);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.96,depthTest:false,depthWrite:false}));
    sprite.position.copy(p).add(new THREE.Vector3(0,.15,.12));sprite.scale.set(.79,.198,1);
    sprite.renderOrder=12;return sprite;
  }
  function setData(snapshot){
    if(!snapshot||snapshot.source!=='local-sqlite'||!Array.isArray(snapshot.nodes)||!Array.isArray(snapshot.links))throw Error('Fonte de memória inválida');
    const nodes=snapshot.nodes.slice(0,180).filter(n=>n&&typeof n.id==='string'&&typeof n.title==='string');
    const valid=new Set(nodes.map(n=>n.id));
    const links=snapshot.links.filter(l=>valid.has(l.source)&&valid.has(l.target)&&l.source!==l.target);
    const key=JSON.stringify([nodes.map(n=>[n.id,n.updated,n.importance]),links.map(e=>[e.source,e.target,e.weight])]);
    if(key===fingerprint)return;
    fingerprint=key;data={nodes,links};disposeGraph();
    for(const n of nodes)nodeById.set(n.id,n);
    if(!nodes.length){status='empty';selectedId='';return;}
    const positions=positionGraph(nodes,links);
    const positionMap=new Map(nodes.map((n,i)=>[n.id,positions[i]]));
    for(const n of nodes)locationById.set(n.id,positionMap.get(n.id));
    const matrix=new THREE.Object3D();
    const geo=new THREE.IcosahedronGeometry(.059,1);
    const material=new THREE.MeshBasicMaterial({vertexColors:false,transparent:true,opacity:.91,depthWrite:false});
    shapes=new THREE.InstancedMesh(geo,material,nodes.length);
    shapes.name='VerifiedMemoryNodes';shapes.renderOrder=11;
    const hitgeo=new THREE.SphereGeometry(.13,6,5);
    hits=new THREE.InstancedMesh(hitgeo,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),nodes.length);
    hits.name='MemoryNodeHitAreas';hits.renderOrder=10;
    nodes.forEach((n,i)=>{
      matrix.position.copy(positions[i]);matrix.updateMatrix();
      shapes.setMatrixAt(i,matrix.matrix);shapes.setColorAt(i,shade(n));
      hits.setMatrixAt(i,matrix.matrix);
    });
    shapes.instanceMatrix.needsUpdate=true;hits.instanceMatrix.needsUpdate=true;
    if(shapes.instanceColor)shapes.instanceColor.needsUpdate=true;
    root.add(shapes,hits);
    const pts=new Float32Array(nodes.length*3),colors=new Float32Array(nodes.length*3);
    nodes.forEach((n,i)=>{
      pts.set(positions[i].toArray(),i*3);colors.set(shade(n).toArray(),i*3);
    });
    const dotgeo=new THREE.BufferGeometry();
    dotgeo.setAttribute('position',new THREE.BufferAttribute(pts,3));
    dotgeo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    light=new THREE.Points(dotgeo,new THREE.PointsMaterial({size:.14,vertexColors:true,transparent:true,opacity:.38,depthWrite:false,blending:THREE.AdditiveBlending}));
    light.renderOrder=9;root.add(light);
    const linesPosition=[],linesColor=[];
    for(const l of links){
      const a=positionMap.get(l.source),b=positionMap.get(l.target);
      const ca=shade(nodeById.get(l.source)),cb=shade(nodeById.get(l.target));
      linesPosition.push(...a.toArray(),...b.toArray());
      linesColor.push(...ca.toArray(),...cb.toArray());
    }
    const linegeo=new THREE.BufferGeometry();
    linegeo.setAttribute('position',new THREE.Float32BufferAttribute(linesPosition,3));
    linegeo.setAttribute('color',new THREE.Float32BufferAttribute(linesColor,3));
    lines=new THREE.LineSegments(linegeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.41,depthWrite:false,blending:THREE.AdditiveBlending}));
    lines.renderOrder=8;root.add(lines);
    // Labels are real stored memories, not invented sector names.
    nodes.slice(0,Math.min(nodes.length,30)).forEach(n=>{
      const label=makeLabel(n,positionMap.get(n.id));if(label){labels.push(label);root.add(label);}
    });
    status='live';lastUpdated=Date.now();
    if(selectedId&&!nodeById.has(selectedId))selectedId='';
    updateSelection();
  }
  function updateSelection(){
    if(!shapes)return;
    const related=new Set([selectedId]);
    if(selectedId)for(const l of data.links){
      if(l.source===selectedId)related.add(l.target);
      if(l.target===selectedId)related.add(l.source);
    }
    data.nodes.forEach((n,i)=>{
      const c=shade(n);
      if(selectedId&&!related.has(n.id))c.multiplyScalar(.23);
      if(n.id===selectedId)c.multiplyScalar(1.4);
      shapes.setColorAt(i,c);
    });
    if(shapes.instanceColor)shapes.instanceColor.needsUpdate=true;
    if(lines)lines.material.opacity=selectedId?.53:.33;
  }
  function pick(raycaster){
    if(!root.visible||!hits)return null;
    const intersection=raycaster.intersectObject(hits,false)[0];
    if(!intersection||intersection.instanceId==null)return null;
    return data.nodes[intersection.instanceId]||null;
  }
  function select(id){selectedId=selectedId===id?'':id;updateSelection();return nodeById.get(id)||null;}
  function offline(){
    data={nodes:[],links:[]};fingerprint='';selectedId='';
    disposeGraph();status='offline';lastUpdated=0;root.visible=false;
  }
  function update({time=0,core=0,activity=0,projection=0}={}){
    const alpha=clamp(core*(1-projection),0,1);
    root.visible=alpha>.04&&data.nodes.length>0&&status==='live';
    if(!root.visible)return;
    root.rotation.y=reducedMotion?0:Math.sin(time*.055)*.10;
    root.rotation.x=reducedMotion?0:Math.sin(time*.08)*.025;
    root.scale.setScalar(1+.06*alpha);
    // Signal strength originates in actual memory-region activity; nodes and
    // relationships are exclusively persisted records, not invented paths.
    if(light)light.material.opacity=alpha*(.21+Math.min(.2,activity*.15));
    if(shapes)shapes.material.opacity=alpha*.9;
    if(lines)lines.material.opacity=alpha*(selectedId?.53:.33);
    for(const label of labels)label.material.opacity=alpha*.66;
  }
  function diagnostics(){return {kind:'persisted-knowledge-graph',source:'local-sqlite',status,nodes:data.nodes.length,
    connections:data.links.length,selectedId,updatedAt:lastUpdated,visible:root.visible};}
  return {root,setData,offline,update,diagnostics,pick,select,dispose:disposeGraph};
}
