// Audio-only visemes. Vendored HeadAudio MIT, English-trained acoustic model.
export async function createSpeechFace(context) {
  const root=new URL('./vendor/headaudio/',import.meta.url);
  const {HeadAudio}=await import(new URL('headaudio.min.mjs',root));
  await context.audioWorklet.addModule(new URL('headworklet.min.mjs',root));
  const node=new HeadAudio(context,{processorOptions:{visemeEventsEnabled:true},parameterData:{silMode:0}});
  try { await node.loadModel(new URL('model-en-mixed.bin',root).href); }
  catch(error){node.stop();node.port.close();throw error;}
  const weights={};const seen=new Set();let frames=0;
  node.onviseme=event=>{
    // Upstream treats AA (index zero) as false. Explicitly accept every index.
    if(Number.isInteger(event.viseme))node.visemeActive=event.viseme===14?-1:event.viseme;
    if(event.viseme!==14){seen.add(event.viseme);frames++;}
  };
  node.onvalue=(key,value)=>{weights[key.replace('viseme_','')]=value;};
  return {
    node,weights,
    update(dt){node.update(dt*1000);},
    reset(){node.visemeActive=-1;node.visemeAlphas.fill(0);for(const k of Object.keys(weights))weights[k]=0;},
    diagnostics(){return {engine:'audio-visemes',frames,shapes:[...seen]};}
  };
}
