// Audio-envelope articulation for the authored Blender bust (Y up, metres).
// Rest positions are immutable: silence always restores the original anatomy.
export function createFaceRig(geometry) {
  const position=geometry.attributes.position;
  const rest=Float32Array.from(position.array);
  const weights=new Float32Array(position.count);
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  let affected=0,last=-1;
  for(let i=0;i<position.count;i++) {
    const x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2];
    weights[i]=(1-smooth(.325,.345,y))*smooth(.02,.20,y)*
      (1-smooth(.18,.34,Math.abs(x)))*smooth(.26,.47,z);
    if(weights[i]>.001) affected++;
  }
  return {affected,update(level=0) {
    const amount=Math.max(0,Math.min(1,Number(level)||0));
    if(Math.abs(amount-last)<.002 && !(amount===0 && last!==0))return;
    last=amount;
    for(let i=0;i<position.count;i++) {
      const w=weights[i]*amount,j=i*3;
      position.setXYZ(i,rest[j],rest[j+1]-.064*w,rest[j+2]-.022*w);
    }
    position.needsUpdate=true;
    geometry.computeVertexNormals();
  }};
}
