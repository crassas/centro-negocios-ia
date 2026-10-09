import assert from 'node:assert/strict';
import fs from 'node:fs';
import {particleBounds,fitParticleToViewport} from '../travis-projection-framing.mjs';

// Pure perspective regression: no browser or external package required in CI.
const layouts=[
 {width:688,height:1536,z:6.4,fov:40,label:'OPPO screenshot'},
 {width:390,height:844,z:6.4,fov:40,label:'OPPO CSS portrait'},
 {width:360,height:780,z:10.4,fov:40,label:'core-mode mobile'},
 {width:1440,height:900,z:8.3,fov:34,label:'desktop'},
 {width:768,height:1024,z:7,fov:40,label:'tablet'}
];
const shapes=[
 {label:'house',axes:[[-1.6,1.6],[-1.2,1.1],[-.85,.85]],margin:1.16},
 {label:'planet',axes:[[-1.42,1.42],[-1.15,1.15],[-1.04,1.04]],margin:1.09},
 {label:'person',axes:[[-.68,.68],[-1.46,1.15],[-.46,.46]],margin:.85},
 {label:'map',axes:[[-1.35,1.35],[-1.35,1.35],[-.7,.7]],margin:.95},
 {label:'vehicle',axes:[[-1.55,1.55],[-.65,.7],[-1.02,1.02]],margin:1.05},
 {label:'landscape',axes:[[-1.5,1.5],[-.70,.92],[-1.20,1.20]],margin:1.07},
 {label:'diagram',axes:[[-1.36,1.36],[-1.05,1.05],[-.33,.33]],margin:.91}
];
let assertions=0;
for(const layout of layouts){
 const aspect=layout.width/layout.height;
 const rad=layout.fov*Math.PI/180,tan=Math.tan(rad/2);
 for(const shape of shapes){
  const arr=[];
  const corners=[];
  for(const x of shape.axes[0])for(const y of shape.axes[1])for(const z of shape.axes[2]){
   arr.push(x,y,z);corners.push([x,y,z]);
  }
  const bounds=particleBounds(new Float32Array(arr));
  const frame=fitParticleToViewport(bounds,{
   aspect,fov:layout.fov,cameraZ:layout.z,cameraY:.48,rootY:.34,margin:shape.margin
  });
  assert(frame&&Number.isFinite(frame.scale)&&frame.scale>.08,shape.label);
  let [left,right,top,bottom]=[1,0,1,0];
  for(const [x,y,z] of corners){
   const distance=layout.z-(frame.z+z*frame.scale);
   const sx=.5+(frame.x+x*frame.scale)/(2*distance*tan*aspect);
   const sy=.5-(.34+frame.y+y*frame.scale-.48)/(2*distance*tan);
   left=Math.min(left,sx);right=Math.max(right,sx);
   top=Math.min(top,sy);bottom=Math.max(bottom,sy);
  }
  const safe=frame.safeArea,tolerance=.024;
  assert(left>=safe.left-tolerance&&right<=safe.right+tolerance&&
   top>=safe.top-tolerance&&bottom<=safe.bottom+tolerance,
   shape.label+' clipped on '+layout.label+' '+JSON.stringify({left,right,top,bottom,safe}));
  assert(right-left>.13&&bottom-top>.04,shape.label+' too small on '+layout.label);
  assertions++;
 }
}
assert.equal(particleBounds(new Float32Array([NaN,1,2])),null);
assert.equal(particleBounds(null),null);
const engine=fs.readFileSync('travis-particle-morph.mjs','utf8');
const scene=fs.readFileSync('travis-concept-projection.mjs','utf8');
const client=fs.readFileSync('travis-3d.mjs','utf8');
assert(engine.includes('fitParticleToViewport('));
assert(engine.includes('geometry.setDrawRange(0,n)'));
assert(engine.includes('gl_PointSize=clamp((1.0+aSeed*1.6)'));
assert(engine.includes('setTheme(scene,subject'));
assert(scene.includes('setCamera(provider)'));
assert(client.includes('conceptProjection.setCamera(()=>camera)'));
console.log('PASS SMART_FRAMING',assertions,'camera/viewport/shape combinations, finite GPU points, cinematic colour and safe UI bounds');
