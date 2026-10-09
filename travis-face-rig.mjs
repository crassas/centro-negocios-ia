// Local jaw/lip deformation of the authored bust. Original positions stay immutable.
export function createFaceRig(geometry) {
  const position=geometry.attributes.position,rest=Float32Array.from(position.array);
  const jaw=new Float32Array(position.count),lip=new Float32Array(position.count),lid=new Float32Array(position.count);
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  let affected=0,last='',lastNormalsAt=-Infinity;
  for(let i=0;i<position.count;i++) {
    const x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2];
    const front=smooth(.26,.47,z);
    jaw[i]=(1-smooth(.319,.337,y))*smooth(.02,.20,y)*(1-smooth(.18,.34,Math.abs(x)))*front;
    lip[i]=Math.exp(-Math.pow((y-.333)/.039,2))*(1-smooth(.105,.18,Math.abs(x)))*smooth(.43,.51,z);
    // Eyelids deform with the original anatomical mesh, not an overlay.
    const eyeShape=Math.exp(-Math.pow((Math.abs(x)-.153)/.070,2))*smooth(.405,.50,z);
    const upper=Math.exp(-Math.pow((y-.682)/.042,2));
    const lower=Math.exp(-Math.pow((y-.610)/.037,2));
    lid[i]=eyeShape*(-.035*upper+.021*lower);
    if(jaw[i]>.001||lip[i]>.001||Math.abs(lid[i])>.0005)affected++;
  }
  return {affected,update(level=0,visemes=null,blink=0) {
    const gate=Math.max(0,Math.min(1,Number(level)||0));
    const lidClosing=Math.max(0,Math.min(1,Number(blink)||0));
    let open=gate*.58,round=0,wide=0,close=0;
    if(visemes){
      const v=k=>Math.max(0,Math.min(1,visemes[k]||0));
      open=Math.min(1,v('aa')+v('E')*.55+v('O')*.65+v('I')*.22+v('U')*.20+v('kk')*.35+v('RR')*.25+v('CH')*.22+v('DD')*.2+v('nn')*.15+v('TH')*.15+v('SS')*.10);
      round=Math.min(1,v('O')+v('U')+v('CH')*.4);
      wide=Math.min(1,v('E')+v('I')*.8+v('SS')*.25);
      close=Math.min(1,v('PP')+v('FF')*.55);
      open=Math.min(1,Math.max(open*1.20,gate*.32))*(1-close);
      if(gate<.025){open=0;round=0;wide=0;close=0;}
    }
    const stamp=[open,round,wide,close,lidClosing].map(x=>x.toFixed(3)).join(':');if(stamp===last)return;last=stamp;
    if(open===0&&round===0&&wide===0&&close===0&&lidClosing===0){position.array.set(rest);position.needsUpdate=true;geometry.computeVertexNormals();lastNormalsAt=performance.now();return;}
    for(let i=0;i<position.count;i++) {
      const j=i*3,x=rest[j],y=rest[j+1],z=rest[j+2],w=jaw[i],l=lip[i];
      const angle=.195*open*w,dy=y-.39,dz=z-.27;
      const ry=.39+dy*Math.cos(angle)-dz*Math.sin(angle);
      const rz=.27+dy*Math.sin(angle)+dz*Math.cos(angle);
      position.setXYZ(i,x*(1+l*(wide*.14-round*.26)),ry+l*close*(.333-y)*.45+l*open*(.333-y)*.22+lid[i]*lidClosing,rz+l*round*.018+Math.abs(lid[i])*lidClosing*.16);
    }
    position.needsUpdate=true;
    // Rebuilding normals for a dense 3D bust on every visual frame stalls Android.
    // Mesh vertices still animate each frame; normals refresh at most ~12 fps.
    const now=performance.now();
    if(now-lastNormalsAt>=80){geometry.computeVertexNormals();lastNormalsAt=now;}
  }};
}
