// Perspective-safe positioning of holograms on narrow phone screens.
// Geometry sampling stays on the CPU only when a shape changes; per-frame fit
// uses cached bounds and a few arithmetic operations (no scene traversal).
export function particleBounds(positions){
  if(!positions || positions.length<3 || positions.length%3!==0)
    return null;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3){
    for(let k=0;k<3;k++){
      const value=positions[i+k];
      if(!Number.isFinite(value))return null;
      if(value<min[k])min[k]=value;
      if(value>max[k])max[k]=value;
    }
  }
  return {
    min,max,
    center:min.map((value,i)=>(value+max[i])*.5),
    size:min.map((value,i)=>Math.max(0,max[i]-value))
  };
}
export function fitParticleToViewport(bounds,{
  fov=40,aspect=.5,cameraZ=6.4,cameraY=.48,cameraX=0,
  rootY=.34,rootX=0,rootZ=0,portrait=aspect<.73,
  // Reserved UI zones: top header/camera and bottom face/microphone controls.
  safeTop=portrait?.235:.135,safeBottom=portrait?.675:.785,
  safeLeft=portrait?.115:.15,safeRight=portrait?.885:.85,
  margin=.84
}={}){
  if(!bounds || !bounds.size || !bounds.center)return null;
  const fovRadians=Math.min(110,Math.max(20,fov))*Math.PI/180;
  const tanHalf=Math.tan(fovRadians/2);
  const ratio=Math.max(.15,Math.min(3.3,aspect));
  const radiusZ=bounds.size[2]*.5;
  // Reserve near-plane depth while the user rotates the hologram.
  const distance=Math.max(2,Number(cameraZ)-Number(rootZ)-Math.min(1.6,radiusZ*.85));
  const visibleH=2*distance*tanHalf,visibleW=visibleH*ratio;
  const cx=(safeLeft+safeRight)/2,cy=(safeTop+safeBottom)/2;
  const halfX=bounds.size[0]*.5,halfY=bounds.size[1]*.5;
  const diagonalX=Math.hypot(halfX,radiusZ)*2;
  const extentW=Math.max(.04,diagonalX),extentH=Math.max(.04,halfY*2);
  const usableW=visibleW*(safeRight-safeLeft);
  const usableH=visibleH*(safeBottom-safeTop);
  // A landscape viewport has a much larger vertical stage; keep a strict
  // fit there. Portrait scenes can fill more of the width because the
  // rotation-safe diagonal already adds generous horizontal headroom.
  const stageMargin=portrait?margin:Math.min(margin,.89);
  const fitScale=Math.max(.05,Math.min(1.55,stageMargin*usableW/extentW,stageMargin*usableH/extentH));
  // Camera looks horizontally towards the scene (same y as camera).
  const targetX=cameraX+(cx-.5)*visibleW;
  const targetY=cameraY+(.5-cy)*visibleH;
  return {
    scale:fitScale,
    x:targetX-rootX-bounds.center[0]*fitScale,
    y:targetY-rootY-bounds.center[1]*fitScale,
    z:-bounds.center[2]*fitScale,
    safeArea:{left:safeLeft,right:safeRight,top:safeTop,bottom:safeBottom},
    visibleSize:{width:visibleW,height:visibleH},
    shapeSize:{width:extentW*fitScale,height:extentH*fitScale},
    target:{x:targetX,y:targetY}
  };
}
