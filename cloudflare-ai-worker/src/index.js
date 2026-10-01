const MODEL='@cf/meta/llama-3.2-3b-instruct';
const AGENT_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const ALLOWED_ORIGIN='https://crassas.github.io';

function cors(origin){
  const allowed=origin===ALLOWED_ORIGIN||origin==='http://localhost:8000'||origin==='http://127.0.0.1:8000';
  return {
    'access-control-allow-origin':allowed?origin:ALLOWED_ORIGIN,
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'content-type',
    'vary':'Origin'
  };
}
function json(data,status=200,origin=''){
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8',...cors(origin)}});
}
function cleanContext(context){
  if(!context||typeof context!=='object')return {};
  return {
    generatedAt:context.generatedAt||null,
    auditGeneratedAt:context.auditGeneratedAt||null,
    projects:Array.isArray(context.projects)?context.projects.slice(0,30):[],
    leads:Array.isArray(context.leads)?context.leads.slice(0,50):[],
    finance:context.finance||null,
    searchConsole:context.searchConsole||null,
    opportunities:Array.isArray(context.opportunities)?context.opportunities.slice(0,50):[],
    pendingDecisions:Array.isArray(context.pendingDecisions)?context.pendingDecisions.slice(0,30):[]
  };
}
function baseSystem(){
  return [
    'És o núcleo de inteligência operacional de um pequeno negócio digital em Portugal.',
    'Responde sempre em português de Portugal, sem gerúndio e com linguagem curta e directa.',
    'Usa apenas os dados fornecidos como factos. Não inventes métricas, rankings, clientes, pagamentos, moradas ou resultados.',
    'Quando faltarem dados, diz exactamente o que falta.',
    'Distingue facto observado, inferência e recomendação.',
    'Prioriza acções concretas, simples e de baixo custo para pequenos negócios locais.',
    'Podes analisar SEO técnico, CRM, leads, caixa agregado, Search Console e oportunidades de prospecção.',
    'Nunca peças nem assumes passwords, tokens ou conteúdo do Cofre.',
    'Nunca afirmes que executaste uma alteração. Propõe e espera por confirmação humana.',
    'Evita texto longo. Se houver várias tarefas, escolhe as mais importantes.'
  ].join(' ');
}
function extractJson(text){
  const raw=String(text||'').trim().replace(/^\`\`\`(?:json)?/i,'').replace(/\`\`\`$/,'').trim();
  try{return JSON.parse(raw);}catch{}
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(raw.slice(start,end+1));}catch{}}
  return null;
}
async function runAssist(env,question,context){
  return env.AI.run(MODEL,{
    messages:[
      {role:'system',content:baseSystem()},
      {role:'user',content:'PEDIDO:\n'+question+'\n\nDADOS ACTUAIS:\n'+JSON.stringify(context).slice(0,60000)}
    ],
    max_tokens:700,
    temperature:0.2
  });
}
async function runAgent(env,question,context){
  const instructions=[
    'Cria no máximo 5 propostas que mereçam confirmação humana.',
    'Só usa projectId que exista nos dados recebidos.',
    'Não inventes nomes, moradas, contactos ou métricas.',
    'Para create_lead usa payload com name, contact, status e url.',
    'Para update_crm usa payload com projectId e note.',
    'Para create_opportunity usa payload com title, area, niche e note.',
    'Para create_note usa payload com title e note.',
    'Se não houver acções concretas, devolve actions vazio.'
  ].join(' ');
  const responseFormat={
    type:'json_schema',
    json_schema:{
      type:'object',
      properties:{
        summary:{type:'string'},
        actions:{
          type:'array',
          maxItems:5,
          items:{
            type:'object',
            properties:{
              type:{type:'string',enum:['create_lead','update_crm','create_opportunity','create_note']},
              title:{type:'string'},
              reason:{type:'string'},
              payload:{type:'object'}
            },
            required:['type','title','reason','payload']
          }
        }
      },
      required:['summary','actions']
    }
  };
  return env.AI.run(AGENT_MODEL,{
    messages:[
      {role:'system',content:baseSystem()+' '+instructions},
      {role:'user',content:'PEDIDO:\n'+question+'\n\nDADOS ACTUAIS:\n'+JSON.stringify(context).slice(0,60000)}
    ],
    response_format:responseFormat,
    max_tokens:900,
    temperature:0.1
  });
}
async function telegramApi(env,method,payload){
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return {ok:false,configured:false};
  const res=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload||{})
  });
  const data=await res.json().catch(()=>({}));
  return {ok:res.ok&&data.ok===true,configured:true,data};
}
async function telegramSend(env,text,extra={}){
  return telegramApi(env,'sendMessage',{
    chat_id:env.TELEGRAM_CHAT_ID,
    text:String(text||'').slice(0,3900),
    disable_web_page_preview:true,
    ...extra
  });
}
async function telegramSendDecision(env,decision){
  const id=String(decision?.id||'').slice(0,40);
  const title=String(decision?.title||'Decisão pendente').slice(0,250);
  const reason=String(decision?.reason||'').slice(0,1500);
  if(!id)return {ok:false,configured:Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)};
  return telegramSend(env,'CENTRO DE NEGÓCIOS\n\nDECISÃO PENDENTE\n'+title+(reason?'\n\n'+reason:'')+'\n\nConfirmar?',{
    reply_markup:{inline_keyboard:[[
      {text:'✅ Confirmar',callback_data:'approve:'+id},
      {text:'❌ Recusar',callback_data:'reject:'+id}
    ]]}
  });
}
async function telegramPoll(env,offset){
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return {ok:false,configured:false,decisions:[],maxUpdateId:offset||0};
  const start=Number.isFinite(Number(offset))&&Number(offset)>0?Number(offset)+1:-50;
  const result=await telegramApi(env,'getUpdates',{offset:start,limit:50,timeout:0,allowed_updates:['callback_query']});
  if(!result.ok)return {ok:false,configured:true,decisions:[],maxUpdateId:Number(offset)||0};
  const updates=Array.isArray(result.data?.result)?result.data.result:[];
  let max=Number(offset)||0;
  const decisions=[];
  for(const update of updates){
    max=Math.max(max,Number(update.update_id)||0);
    const cb=update.callback_query;
    if(!cb)continue;
    const chatId=String(cb.message?.chat?.id||'');
    if(chatId!==String(env.TELEGRAM_CHAT_ID))continue;
    const match=String(cb.data||'').match(/^(approve|reject):(.+)$/);
    if(!match)continue;
    decisions.push({decisionId:match[2],status:match[1]==='approve'?'approved':'rejected',updateId:update.update_id});
    await telegramApi(env,'answerCallbackQuery',{callback_query_id:cb.id,text:match[1]==='approve'?'Confirmação registada.':'Recusa registada.'});
  }
  return {ok:true,configured:true,decisions,maxUpdateId:max};
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const origin=request.headers.get('origin')||'';

    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});

    if(origin&&origin!==ALLOWED_ORIGIN&&!origin.startsWith('http://localhost')&&!origin.startsWith('http://127.0.0.1')){
      return json({ok:false,error:'Origem não autorizada.'},403,origin);
    }

    if(url.pathname==='/health'&&request.method==='GET'){
      return json({
        ok:true,
        service:'centro-negocios-ai',
        model:MODEL,
        agentModel:AGENT_MODEL,
        telegramConfigured:Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)
      },200,origin);
    }

    if(url.pathname==='/api/telegram/status'&&request.method==='GET'){
      return json({ok:true,configured:Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)},200,origin);
    }

    if(url.pathname==='/api/telegram/poll'&&request.method==='GET'){
      try{
        const result=await telegramPoll(env,url.searchParams.get('offset'));
        return json(result,result.ok?200:(result.configured?502:409),origin);
      }catch(error){
        return json({ok:false,error:'Falha Telegram: '+String(error?.message||error)},500,origin);
      }
    }

    let body={};
    if(request.method==='POST'){
      try{body=await request.json();}catch{return json({ok:false,error:'Pedido inválido.'},400,origin);}
    }

    if(url.pathname==='/api/telegram/notify'&&request.method==='POST'){
      const text=String(body?.text||'').trim();
      if(!text)return json({ok:false,error:'Mensagem em falta.'},400,origin);
      try{
        const result=await telegramSend(env,text);
        if(!result.configured)return json({ok:false,configured:false,error:'Telegram ainda não configurado.'},409,origin);
        if(!result.ok)return json({ok:false,configured:true,error:'Telegram recusou a mensagem.'},502,origin);
        return json({ok:true,configured:true},200,origin);
      }catch(error){
        return json({ok:false,error:'Falha Telegram: '+String(error?.message||error)},500,origin);
      }
    }

    if(url.pathname==='/api/telegram/decision'&&request.method==='POST'){
      try{
        const result=await telegramSendDecision(env,body?.decision||{});
        if(!result.configured)return json({ok:false,configured:false,error:'Telegram ainda não configurado.'},409,origin);
        if(!result.ok)return json({ok:false,configured:true,error:'Telegram recusou o pedido.'},502,origin);
        return json({ok:true,configured:true},200,origin);
      }catch(error){
        return json({ok:false,error:'Falha Telegram: '+String(error?.message||error)},500,origin);
      }
    }

    if((url.pathname==='/api/assist'||url.pathname==='/api/agent')&&request.method==='POST'){
      const question=String(body?.question||'').trim();
      if(!question)return json({ok:false,error:'Pergunta em falta.'},400,origin);
      if(question.length>4000)return json({ok:false,error:'Pergunta demasiado longa.'},400,origin);
      const context=cleanContext(body?.context);

      try{
        if(url.pathname==='/api/agent'){
          const result=await runAgent(env,question,context);
          const response=result?.response;
          const parsed=response&&typeof response==='object'?response:extractJson(typeof response==='string'?response:'');
          if(!parsed)return json({ok:true,summary:'Análise concluída sem propostas estruturadas.',actions:[],model:AGENT_MODEL,usage:result?.usage||null},200,origin);
          const actions=Array.isArray(parsed.actions)?parsed.actions.slice(0,5).filter(x=>x&&typeof x==='object'):[];
          return json({ok:true,summary:String(parsed.summary||'').trim()||'Análise concluída.',actions,model:AGENT_MODEL,usage:result?.usage||null},200,origin);
        }

        const result=await runAssist(env,question,context);
        const answer=typeof result?.response==='string'?result.response.trim():'';
        if(!answer)return json({ok:false,error:'O modelo não devolveu texto.'},502,origin);
        return json({ok:true,answer,model:MODEL,usage:result?.usage||null},200,origin);
      }catch(error){
        return json({ok:false,error:'Falha no Workers AI: '+String(error?.message||error)},500,origin);
      }
    }

    return json({ok:false,error:'Rota não encontrada.'},404,origin);
  }
};