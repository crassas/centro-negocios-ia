// Local jaw/lip deformation of the authored bust. Original positions stay immutable.
export function createFaceRig(geometry) {
  const position=geometry.attributes.position,rest=Float32Array.from(position.array);
  const jaw=new Float32Array(position.count),lip=new Float32Array(position.count);
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  let affected=0,last='';
  for(let i=0;i<position.count;i++) {
    const x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2];
    const front=smooth(.26,.47,z);
    jaw[i]=(1-smooth(.319,.337,y))*smooth(.02,.20,y)*(1-smooth(.18,.34,Math.abs(x)))*front;
    lip[i]=Math.exp(-Math.pow((y-.333)/.039,2))*(1-smooth(.105,.18,Math.abs(x)))*smooth(.43,.51,z);
    if(jaw[i]>.001||lip[i]>.001)affected++;
  }
  return {affected,update(level=0,visemes=null) {
    const gate=Math.max(0,Math.min(1,Number(level)||0));
    let open=gate*.32,round=0,wide=0,close=0;
    if(visemes){
      const v=k=>Math.max(0,Math.min(1,visemes[k]||0));
      open=Math.min(1,v('aa')+v('E')*.55+v('O')*.65+v('I')*.22+v('U')*.20+v('kk')*.35+v('RR')*.25+v('CH')*.22+v('DD')*.2+v('nn')*.15+v('TH')*.15+v('SS')*.10);
      round=Math.min(1,v('O')+v('U')+v('CH')*.4);
      wide=Math.min(1,v('E')+v('I')*.8+v('SS')*.25);
      close=Math.min(1,v('PP')+v('FF')*.55);
      open*=1-close;
      if(gate<.025){open=0;round=0;wide=0;close=0;}
    }
    const stamp=[open,round,wide,close].map(x=>x.toFixed(3)).join(':');if(stamp===last)return;last=stamp;
    if(open===0&&round===0&&wide===0&&close===0){position.array.set(rest);position.needsUpdate=true;geometry.computeVertexNormals();return;}
    for(let i=0;i<position.count;i++) {
      const j=i*3,x=rest[j],y=rest[j+1],z=rest[j+2],w=jaw[i],l=lip[i];
      const angle=.10*open*w,dy=y-.39,dz=z-.27;
      const ry=.39+dy*Math.cos(angle)-dz*Math.sin(angle);
      const rz=.27+dy*Math.sin(angle)+dz*Math.cos(angle);
      position.setXYZ(i,x*(1+l*(wide*.12-round*.24)),ry+l*close*(.333-y)*.45,rz+l*round*.018);
    }
    position.needsUpdate=true;geometry.computeVertexNormals();
  }};
}
