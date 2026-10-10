// Read incremental audio without repeating an already dispatched tool request.
export async function readVoiceReply(response,onAudio){
  if(!response.ok)throw new Error('Travis did not accept the voice request.');
  if(!response.headers.get('content-type')?.includes('application/x-ndjson')){
    const answer=await response.json();
    if(answer.ok===false)throw new Error(answer.error||'Voice request failed.');
    return {answer,spoken:false};
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let pending='',answer=null,spoken=false,done=false,failure=null;
  function event(line){
    if(!line.trim())return;
    const item=JSON.parse(line);
    if(item.type==='error'){failure=item.error||'Voice stream failed.';return;}
    if(item.type==='audio'){
      const bytes=Uint8Array.from(atob(item.audio),char=>char.charCodeAt(0));
      spoken=true;onAudio(bytes.buffer,item.text,item.language);
    }
    if(item.type==='result')answer=item.answer;
    if(item.type==='done')done=true;
  }
  try{
    while(true){
      const chunk=await reader.read();
      pending+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done});
      if(pending.length>2000000)throw new Error('Voice stream frame exceeds limit.');
      let newline;
      while((newline=pending.indexOf('\n'))>=0){event(pending.slice(0,newline));pending=pending.slice(newline+1);}
      if(chunk.done)break;
    }
    if(pending.trim())event(pending);
    if(failure||!answer||!done){
      if(!spoken)throw new Error(failure||'Voice response was interrupted.');
      return {answer,spoken,interrupted:true,error:failure||'Voice response was interrupted.'};
    }
    return {answer,spoken,interrupted:false};
  }catch(error){
    // Preserve audio already received; never retry a possibly executed request.
    if(spoken)return {answer,spoken,interrupted:true,error:error.message};
    throw error;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
