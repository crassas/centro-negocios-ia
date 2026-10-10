// Local PCM streaming. Never dispatch a tool from a partial transcript.
export function createLiveSTT(request){
  const id=crypto.randomUUID();let seq=0,frames=[],samples=0,chain=Promise.resolve(),failed=false,finished=false,pending=0;
  const controller=new AbortController();
  function send(final=false){
    // A slow recognizer must not build an unbounded queue behind a new utterance.
    if(failed||pending>=4){failed=true;frames=[];samples=0;controller.abort();return Promise.resolve(null);}
    const count=samples,data=new Uint8Array(count*2),view=new DataView(data.buffer);
    let at=0;
    for(const frame of frames)for(const sample of frame){view.setInt16(at,Math.max(-1,Math.min(1,sample))*32767,true);at+=2;}
    frames=[];samples=0;
    let binary='';for(const value of data)binary+=String.fromCharCode(value);
    const payload={id,seq:seq++,pcm:btoa(binary),final};
    pending++;
    chain=chain.then(()=>failed?null:request(payload,controller.signal)).then(result=>{if(result?.available===false){failed=true;controller.abort();}return result;}).catch(()=>{failed=true;return null;}).finally(()=>{pending--;});
    return chain;
  }
  return {
    push(frame){if(failed||finished)return;frames.push(new Float32Array(frame));samples+=frame.length;if(samples>=8000)send();},
    async finish(){
      if(finished)return null;finished=true;
      if(failed)return null;
      let timer;
      try{
        const result=await Promise.race([send(true),new Promise(resolve=>{timer=setTimeout(()=>{failed=true;controller.abort();resolve(null);},1800);})]);
        return result?.final&&result.accepted?{text:result.text,engine:result.engine,durationMs:result.durationMs}:null;
      }finally{clearTimeout(timer);}
    },
    cancel(){finished=true;failed=true;frames=[];samples=0;controller.abort();void request({id,cancel:true},AbortSignal.timeout(1500)).catch(()=>{});},
  };
}
