// Keep CPU snapshots and GPU motion identical so an interrupted transformation
// starts at the visible grains, even halfway through an organic current.
const clamp=t=>Math.max(0,Math.min(1,t));
const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
export const sandProgress=(progress,seed)=>ease(progress+progress*(1-progress)*(seed-.5)*.85);
export function sandOffset(p,n,seed,time,voice,progress,strength=1){
 const t=sandProgress(progress,seed),rush=Math.sin(t*Math.PI),arrival=ease(t/.16);
 const phase=p[1]*2.3+p[0]*.7+time*.72+seed*.65;
 const stream=rush*(.09+.13*seed)*strength;
 const breath=Math.sin(time*1.2+seed*19)*(.003+voice*.006)*arrival*strength;
 return [Math.sin(phase)*stream+n[0]*breath,
  (Math.cos(phase*.83+p[2]*1.6)*.62-.48)*stream+n[1]*breath,
  Math.cos(phase+p[0]*1.4)*stream+n[2]*breath];
}
export const SAND_MOTION_GLSL=`
 float sandProgress(float progress,float seed){
  float t=clamp(progress+progress*(1.-progress)*(seed-.5)*.85,0.,1.);
  return t*t*(3.-2.*t);
 }
 vec3 sandOffset(vec3 p,vec3 n,float seed,float time,float voice,float progress,float strength){
  float t=sandProgress(progress,seed),rush=sin(t*3.141592653589793);
  float arrival=smoothstep(0.,.16,t);
  float phase=p.y*2.3+p.x*.7+time*.72+seed*.65;
  float stream=rush*(.09+.13*seed)*strength;
  float breath=sin(time*1.2+seed*19.)*(.003+voice*.006)*arrival*strength;
  return vec3(sin(phase),cos(phase*.83+p.z*1.6)*.62-.48,cos(phase+p.x*1.4))*stream+n*breath;
 }
`;
