// The only nodes and edges here come from the loopback /brain/graph SQLite snapshot.
// Position, movement and colour are graphical metaphors, not hidden reasoning traces.
export function createKnowledgeGraph(THREE,{reducedMotion=false}={}){
  const root=new THREE.Group();root.name='TravisPersistedMemoryNetwork';
  const colours={FACT:0x87cce7,CONCEPT:0x81d6c4,DECISION:0xd6a6c7,RULE:0xe4c28c};
  let snapshot={nodes:[],links:[]},status='waiting',fingerprint='',updatedAt=0,selectedId='';
  let nodesMesh=null,hitMesh=null,edgesMesh=null,signals=null,labels=[];
  let edgePairs=[],positions=new Map();
  const kinds=new Map(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const colorOf=n=>new THREE.Color(colours[n?.kind]??0x9ab1bb);
  const hash=value=>{let h=2166136261;for(const ch of String(value)){h=Math.imul(h^ch.charCodeAt(0),16777619);}return (h>>>0)/4294967296;};
  function disposeGraph(){
    const materials=new Set(),geometries=new Set(),textures=new Set();
    root.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material])){
        materials.add(m);if(m.map)textures.add(m.map);
      }
    });
    root.clear();for(const x of geometries)x.dispose();
    for(const x of materials)x.dispose();for(const x of textures)x.dispose();
    nodesMesh=hitMesh=edgesMesh=signals=null;labels=[];edgePairs=[];positions.clear();kinds.clear();
  }
  function layout(nodes){
    const projects=[...new Set(nodes.map(n=>n.projectId||'local'))].sort();
    const grouped=new Map(projects.map(p=>[p,[]]));
    nodes.forEach(n=>grouped.get(n.projectId||'local').push(n));
    projects.forEach((project,g)=>{
      const items=grouped.get(project),angle=2*Math.PI*g/projects.length;
      const spread=projects.length===1?0:.68;
      const cx=Math.cos(angle)*spread,cy=Math.sin(angle)*spread;
      items.forEach((n,i)=>{
        const theta=2.3999632297*i+hash(n.id)*.2;
        const ring=.23+.43*Math.sqrt((i+.5)/items.length);
        const z=(hash(n.id+'z')-.5)*.65;
        positions.set(n.id,new THREE.Vector3(cx+Math.cos(theta)*ring,cy+Math.sin(theta)*ring,z));
      });
    });
  }
  function makeLabel(node,p){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.font='500 28px system-ui,sans-serif';ctx.fillStyle='#c7dfe5';ctx.textAlign='center';
    let title=String(node.title||'').trim();if(title.length>28)title=title.slice(0,27)+'…';
    ctx.fillText(title,256,42,490);
    ctx.font='18px monospace';ctx.fillStyle='#7597a4';ctx.fillText(String(node.kind||'MEMÓRIA'),256,72);
    const texture=new THREE.CanvasTexture(canvas);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.7,depthTest:false,depthWrite:false}));
    sprite.position.copy(p).add(new THREE.Vector3(0,.15,.12));sprite.scale.set(.65,.14,1);
    sprite.renderOrder=15;return sprite;
  }
  function setData(input){
    if(!input||!input.ok||input.source!=='local-sqlite'||!Array.isArray(input.nodes)||!Array.isArray(input.links))
      throw Error('Fonte do grafo inválida');
    const nodes=input.nodes.slice(0,120).filter(n=>n&&typeof n.id==='string'&&typeof n.title==='string');
    const known=new Set(nodes.map(n=>n.id));
    const links=input.links.filter(l=>l&&known.has(l.source)&&known.has(l.target)&&l.source!==l.target).slice(0,320);
    const next=JSON.stringify([nodes.map(n=>[n.id,n.updated,n.importance,n.title]),links.map(l=>[l.source,l.target,l.weight])]);
    status='live';updatedAt=Number(input.observedAt)||Date.now()/1000;
    if(next===fingerprint)return;
    fingerprint=next;disposeGraph();snapshot={nodes,links};
    if(!nodes.length){status='empty';selectedId='';return;}
    for(const n of nodes)kinds.set(n.id,n);
    layout(nodes);
    const vertex=new THREE.IcosahedronGeometry(.046,1);
    nodesMesh=new THREE.InstancedMesh(vertex,new THREE.MeshBasicMaterial({transparent:true,opacity:.86,depthWrite:false}),nodes.length);
    const hitGeo=new THREE.SphereGeometry(.13,7,5);
    hitMesh=new THREE.InstancedMesh(hitGeo,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),nodes.length);
    const matrix=new THREE.Object3D();
    for(let i=0;i<nodes.length;i++){
      const n=nodes[i];matrix.position.copy(positions.get(n.id));matrix.updateMatrix();
      nodesMesh.setMatrixAt(i,matrix.matrix);hitMesh.setMatrixAt(i,matrix.matrix);
      nodesMesh.setColorAt(i,colorOf(n));
    }
    nodesMesh.instanceMatrix.needsUpdate=true;hitMesh.instanceMatrix.needsUpdate=true;
    if(nodesMesh.instanceColor)nodesMesh.instanceColor.needsUpdate=true;
    nodesMesh.name='PersistedMemoryNodes';hitMesh.name='MemoryNodeHitAreas';
    root.add(nodesMesh,hitMesh);
    const points=[],colors=[];
    for(const link of links){
      const a=positions.get(link.source),b=positions.get(link.target);
      if(!a||!b)continue;
      edgePairs.push([a,b]);
      points.push(...a.toArray(),...b.toArray());
      colors.push(...colorOf(kinds.get(link.source)).toArray(),...colorOf(kinds.get(link.target)).toArray());
    }
    const edgeGeo=new THREE.BufferGeometry();
    edgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    edgeGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    edgesMesh=new THREE.LineSegments(edgeGeo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.32,depthWrite:false,blending:THREE.AdditiveBlending}));
    edgesMesh.name='PersistedSynapses';root.add(edgesMesh);
    const packetGeo=new THREE.BufferGeometry();
    packetGeo.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(edgePairs.length*3),3));
    signals=new THREE.Points(packetGeo,new THREE.PointsMaterial({color:0x9fe3d9,size:.037,transparent:true,opacity:.68,depthWrite:false,blending:THREE.AdditiveBlending}));
    signals.name='ObservedRecallPulses';root.add(signals);
    nodes.slice(0,Math.min(nodes.length,10)).forEach(n=>{
      const label=makeLabel(n,positions.get(n.id));if(label){root.add(label);labels.push(label);}
    });
    if(selectedId&&!known.has(selectedId))selectedId='';
    recolor();
  }
  function recolor(){
    if(!nodesMesh)return;
    const related=new Set([selectedId]);
    for(const link of snapshot.links)if(selectedId){
      if(link.source===selectedId)related.add(link.target);
      if(link.target===selectedId)related.add(link.source);
    }
    snapshot.nodes.forEach((n,i)=>{
      const c=colorOf(n);
      if(selectedId&&!related.has(n.id))c.multiplyScalar(.22);
      if(n.id===selectedId)c.multiplyScalar(1.5);
      nodesMesh.setColorAt(i,c);
    });
    if(nodesMesh.instanceColor)nodesMesh.instanceColor.needsUpdate=true;
  }
  function pick(raycaster){
    if(!root.visible||!hitMesh)return null;
    const hit=raycaster.intersectObject(hitMesh,false)[0];
    return hit?.instanceId==null?null:snapshot.nodes[hit.instanceId]||null;
  }
  function select(id){
    selectedId=selectedId===id?'':id;recolor();
    return selectedId?kinds.get(selectedId)||null:null;
  }
  function offline(){
    snapshot={nodes:[],links:[]};selectedId='';fingerprint='';status='offline';updatedAt=0;
    disposeGraph();root.visible=false;
  }
  function update({time=0,core=0,activity=0,projection=0}={}){
    const alpha=clamp(core*(1-projection),0,1);
    root.visible=alpha>.04&&status==='live'&&snapshot.nodes.length>0;
    if(!root.visible)return;
    root.rotation.y=reducedMotion?0:Math.sin(time*.055)*.1;
    root.rotation.x=reducedMotion?0:Math.sin(time*.08)*.03;
    root.scale.setScalar(1+alpha*.04);
    if(nodesMesh)nodesMesh.material.opacity=alpha*.88;
    if(edgesMesh)edgesMesh.material.opacity=alpha*(selectedId?.5:.32);
    for(const label of labels)label.material.opacity=alpha*.68;
    const recall=clamp(activity,0,1);
    // Animated packets only travel over edges that exist in the database.
    if(signals){
      signals.visible=!reducedMotion&&recall>.1&&edgePairs.length>0;
      if(signals.visible){
        const a=signals.geometry.attributes.position;
        for(let i=0;i<edgePairs.length;i++){
          const [p,q]=edgePairs[i],t=(time*.24+i*.31)%1;
          a.setXYZ(i,p.x+(q.x-p.x)*t,p.y+(q.y-p.y)*t,p.z+(q.z-p.z)*t);
        }
        a.needsUpdate=true;signals.material.opacity=alpha*recall*.75;
      }
    }
  }
  const diagnostics=()=>({kind:'persisted-knowledge-graph',source:'local-sqlite',status,
    nodes:snapshot.nodes.length,connections:snapshot.links.length,updatedAt,selectedId,visible:root.visible});
  return {root,setData,offline,update,pick,select,diagnostics,dispose:disposeGraph};
}
