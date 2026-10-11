// Connect existing browser actions to persistent, session-scoped coordination.
export function createMindLink({events=window,getSession,getDisplay,getEpoch,active,post,onResult,interval=15000}){
  let tail=Promise.resolve(),lastError='',receipts=0;
  const requests=new Map();
  function send(body,session=getSession()){
    const work=async()=>{
      for(let attempt=0;attempt<2;attempt++){
        try{
          const result=await post({kind:'coordination',session,...body});
          if(!result?.ok)throw new Error(result?.reason||'Receipt rejected');
          receipts++;lastError='';return result;
        }catch(error){lastError=String(error.message);}
      }
      return {ok:false};
    };
    tail=tail.catch(()=>{}).then(work);return tail;
  }
  function observe(){return send({action:'observe',display:getDisplay()});}
  function requested(event){
    const detail=event.detail||{},session=getSession();
    requests.set(detail.id,{session,epoch:getEpoch(),at:Date.now()});
    for(const [id,request] of requests)if(Date.now()-request.at>180000)requests.delete(id);
    void send({action:'requested',id:detail.id,text:detail.text},session);
  }
  async function completed(event){
    const detail=event.detail||{},request=requests.get(detail.id);
    if(!request)return;
    requests.delete(detail.id);
    const result=detail.cancelled?{verified:false,reply:'Camera request interrupted.'}:detail;
    await send({action:'result',id:detail.id,result},request.session);
    if(request.session===getSession())await observe();
    if(!detail.cancelled&&request.session===getSession()&&request.epoch===getEpoch()&&active())
      void Promise.resolve(onResult?.(detail,request.epoch)).catch(error=>{lastError=String(error.message);});
  }
  events.addEventListener('travis:cctv-auto-request',requested);
  events.addEventListener('travis:cctv-auto-result',completed);
  const timer=setInterval(()=>{if(active())void observe();},interval);
  return {observe,flush:()=>tail,status:()=>({receipts,lastError,pending:requests.size}),
    destroy(){clearInterval(timer);events.removeEventListener('travis:cctv-auto-request',requested);events.removeEventListener('travis:cctv-auto-result',completed);}};
}
