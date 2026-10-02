import { DurableObject } from "cloudflare:workers";

export class TaskQueue extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);
    this.env=env;
  }
  async getJson(key,fallback=null){
    const value=await this.ctx.storage.get(key);
    return value===undefined?fallback:value;
  }
  async setJson(key,value){await this.ctx.storage.put(key,value);}
  async createPair(){
    const active=await this.getJson('pair:active',null);
    const now=Date.now();
    if(active&&active.expiresAt>now&&active.status==='pending')return {id:active.id,expiresAt:active.expiresAt};
    const id=crypto.randomUUID().replaceAll('-','').slice(0,12);
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    const token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const pair={id,token,status:'pending',createdAt:now,expiresAt:now+10*60*1000};
    await this.setJson('pair:active',pair);
    return {id,expiresAt:pair.expiresAt};
  }
  async resolvePair(id,approved){
    const pair=await this.getJson('pair:active',null);
    if(!pair||pair.id!==id||pair.expiresAt<Date.now())return {ok:false};
    pair.status=approved?'approved':'rejected';
    if(approved){
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pair.token));
      pair.tokenHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      await this.setJson('device:tokenHash',pair.tokenHash);
    }
    await this.setJson('pair:active',pair);
    return {ok:true,status:pair.status};
  }
  async pairStatus(id){
    const pair=await this.getJson('pair:active',null);
    if(!pair||pair.id!==id)return {status:'missing'};
    if(pair.expiresAt<Date.now())return {status:'expired'};
    return {status:pair.status,token:pair.status==='approved'?pair.token:undefined,expiresAt:pair.expiresAt};
  }
  async authenticate(hash){
    const saved=await this.getJson('device:tokenHash','');
    return Boolean(saved&&hash&&saved===hash);
  }
  async getTelegramOffset(){return Number(await this.getJson('telegram:offset',0))||0;}
  async claimTelegramUpdate(id){
    const last=await this.getTelegramOffset();
    const n=Number(id)||0;
    if(n<=last)return false;
    await this.setJson('telegram:offset',n);
    return true;
  }
  async appendDecisionEvent(event){
    const seq=(Number(await this.getJson('decision:seq',0))||0)+1;
    await this.setJson('decision:seq',seq);
    await this.setJson('decision:event:'+seq,{...event,seq,createdAt:Date.now()});
    return seq;
  }
  async decisionEvents(since=0){
    const max=Number(await this.getJson('decision:seq',0))||0;
    const rows=[];
    for(let i=Math.max(1,Number(since)+1);i<=max;i++){
      const row=await this.getJson('decision:event:'+i,null);
      if(row)rows.push(row);
    }
    return {events:rows,maxSeq:max};
  }
  async createTask(spec,source='telegram'){
    const id=crypto.randomUUID().replaceAll('-','').slice(0,12);
    const safeSpec=spec&&typeof spec==='object'?spec:{};
    const task={
      id,
      action:String(safeSpec.action||'').slice(0,60),
      target:String(safeSpec.target||'').slice(0,120),
      args:safeSpec.args&&typeof safeSpec.args==='object'?safeSpec.args:{},
      label:String(safeSpec.label||safeSpec.action||'Tarefa Operit').slice(0,200),
      source,status:'pending',createdAt:Date.now()
    };
    await this.setJson('task:'+id,task);
    const ids=await this.getJson('task:ids',[]);
    ids.push(id);
    await this.setJson('task:ids',ids.slice(-200));
    return task;
  }
  async resolveTask(id,approved){
    const task=await this.getJson('task:'+id,null);
    if(!task||task.status!=='pending')return {ok:false};
    task.status=approved?'queued':'rejected';
    task.resolvedAt=Date.now();
    await this.setJson('task:'+id,task);
    return {ok:true,task};
  }
  async pullTask(){
    const ids=await this.getJson('task:ids',[]);
    for(const id of ids){
      const task=await this.getJson('task:'+id,null);
      if(task&&task.status==='queued'){
        task.status='running';task.startedAt=Date.now();
        await this.setJson('task:'+id,task);
        return task;
      }
    }
    return null;
  }
  async completeTask(id,result){
    const task=await this.getJson('task:'+id,null);
    if(!task)return {ok:false};
    task.status='completed';task.completedAt=Date.now();task.result=result;
    await this.setJson('task:'+id,task);
    return {ok:true,task};
  }
  async taskStats(){
    const ids=await this.getJson('task:ids',[]);
    const stats={pending:0,queued:0,running:0,completed:0,rejected:0};
    for(const id of ids.slice(-100)){
      const task=await this.getJson('task:'+id,null);
      if(task&&stats[task.status]!==undefined)stats[task.status]++;
    }
    const paired=Boolean(await this.getJson('device:tokenHash',''));
    return {...stats,paired};
  }
}

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
async function runTelegramFront(env,text){
  const raw=String(text||'').trim();
  const lower=raw.toLowerCase();
  let hintedProject='local';
  if(lower.includes('pentehouse'))hintedProject='pentehouse';
  else if(lower.includes('best pizza')||lower.includes('pizza')||lower.includes('kebab'))hintedProject='pizza';
  else if(lower.includes('2 irmãos')||lower.includes('dois irmãos')||lower.includes('doisirmaos'))hintedProject='doisirmaos';
  else if(lower.includes('centro de negócios')||lower.includes('centro negocios')||lower.includes('centro'))hintedProject='centro';

  const projectContext={
    pentehouse:'Pentehouse é uma barbearia local no Porto. O foco do sistema é SEO/GEO local, conversão, reservas/WhatsApp, mobile e qualidade visual. Não assumas métricas actuais sem as verificar.',
    pizza:'Best Pizza & Kebab é um negócio local de restauração em Campanhã. O foco é SEO/GEO local, menu, pedidos, mobile e conversão. Não assumas preços ou rankings actuais sem os verificar.',
    doisirmaos:'2 Irmãos é um restaurante local em Campanhã. O foco é presença local, SEO/GEO, menu, confiança e conversão. Não assumas dados actuais sem os verificar.',
    centro:'Centro de Negócios é a estação operacional que liga Telegram, Cloudflare, Centro Agent e Centro Server privado. Não assumas estado técnico sem o verificar.',
    local:''
  };

  const responseFormat={
    type:'json_schema',
    json_schema:{
      type:'object',
      properties:{
        answer:{type:'string',minLength:40},
        needsClaude:{type:'boolean'},
        project:{type:'string',enum:['local','centro','pentehouse','pizza','doisirmaos']},
        claudePrompt:{type:'string'}
      },
      required:['answer','needsClaude','project','claudePrompt']
    }
  };

  const projectHint=projectContext[hintedProject]||'';
  return env.AI.run(AGENT_MODEL,{
    messages:[
      {
        role:'system',
        content:[
          'És a IA frontal rápida da Estação Centro.',
          'Responde em português de Portugal, sem gerúndio.',
          'A resposta deve ser útil por si só: nunca respondas apenas com um nome, título ou palavra isolada.',
          'Para pedidos de melhoria, dá 3 a 5 acções concretas e prioritárias em frases curtas.',
          'Se não tens dados actuais verificados, distingue claramente o que é proposta do que é facto.',
          'Quando o pedido exigir ver código, ficheiros, repositório, estado técnico real, métricas actuais ou alterações, define needsClaude=true.',
          'Quando needsClaude=true, responde já com uma orientação útil e prepara claudePrompt completo para o Claude Code.',
          'Projectos disponíveis: centro, pentehouse, pizza, doisirmaos. Usa local quando não houver projecto específico.',
          'Nunca afirmes que executaste alterações.',
          projectHint?('CONTEXTO DO PROJECTO: '+projectHint):''
        ].filter(Boolean).join(' ')
      },
      {role:'user',content:raw.slice(0,5000)}
    ],
    response_format:responseFormat,
    max_tokens:520,
    temperature:0.2
  });
}

function taskQueue(env){return env.TASKS.getByName('primary');}
async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function bearer(request){
  const value=request.headers.get('authorization')||'';
  return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():'';
}
const OPERIT_PROJECTS={
  centro:'centro-negocios-ia',
  pentehouse:'pente_houselanding',
  pizza:'best-pizza-kebab',
  kebab:'best-pizza-kebab',
  doisirmaos:'restaurante-2-irmaos',
  '2irmaos':'restaurante-2-irmaos'
};
function parseOperitInstruction(text){
  const raw=String(text||'').trim();
  let m=raw.match(/^\/station$/i);
  if(m)return {action:'station_status',target:'local',label:'Estado da Estação Centro'};
  m=raw.match(/^\/doctor$/i);
  if(m)return {action:'station_doctor',target:'local',label:'Diagnóstico da Estação Centro'};
  m=raw.match(/^\/server$/i);
  if(m)return {action:'server_status',target:'local',label:'Estado do Centro Server privado'};
  m=raw.match(/^\/operit\s+system$/i);
  if(m)return {action:'system_info',target:'local',label:'Informação do sistema'};
  m=raw.match(/^\/operit\s+sites?$/i);
  if(m)return {action:'site_check',target:'all',label:'Verificar sites em produção'};
  m=raw.match(/^\/operit\s+git-status\s+([a-z0-9_-]+)$/i);
  if(m){
    const repo=OPERIT_PROJECTS[m[1].toLowerCase()];
    return repo?{action:'git_status',target:repo,label:'Git status · '+repo}:null;
  }
  m=raw.match(/^\/operit\s+git-pull\s+([a-z0-9_-]+)$/i);
  if(m){
    const repo=OPERIT_PROJECTS[m[1].toLowerCase()];
    return repo?{action:'git_pull',target:repo,label:'Git pull --ff-only · '+repo}:null;
  }

  // Claude Code no próprio telemóvel. @projecto é opcional.
  m=raw.match(/^\/claude(?:\s+@([a-z0-9_-]+))?\s+([\s\S]{1,5000})$/i);
  if(m){
    const alias=(m[1]||'').toLowerCase();
    const repo=alias?OPERIT_PROJECTS[alias]:null;
    if(alias&&!repo)return null;
    const prompt=m[2].trim();
    if(!prompt)return null;
    return {
      action:'claude_query',
      target:repo||'local',
      args:{prompt},
      label:'Claude Code · '+(repo||'geral')
    };
  }
  return null;
}


async function telegramWebhookSecret(env){
  return (await sha256Hex(env.TELEGRAM_BOT_TOKEN||'')).slice(0,64);
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
async function handleTelegramUpdate(env,update){
  const q=taskQueue(env);
  const claimed=await q.claimTelegramUpdate(update?.update_id);
  if(!claimed)return {ok:true,duplicate:true};

  const message=update?.message;
  if(message&&String(message.chat?.id||'')===String(env.TELEGRAM_CHAT_ID)){
    const text=String(message.text||'').trim();
    const instruction=parseOperitInstruction(text);
    if(instruction){
      const task=await q.createTask(instruction,'telegram');
      const isClaude=instruction.action==='claude_query';
      await telegramSend(env,(isClaude?'CLAUDE CODE':'ACÇÃO OPERIT')+'\n\n'+task.label+'\n\n'+(isClaude?'Enviar ao Claude Code?':'Executar?'),{
        reply_markup:{inline_keyboard:[[
          {text:isClaude?'✅ Enviar':'✅ Executar',callback_data:'taskapprove:'+task.id},
          {text:isClaude?'❌ Cancelar':'❌ Recusar',callback_data:'taskreject:'+task.id}
        ]]}
      });
    }else if(text==='/status'){
      const stats=await q.taskStats();
      await telegramSend(env,'OPERIT\n\n'+(stats.paired?'Dispositivo: ligado':'Dispositivo: por emparelhar')+'\nFila: '+stats.queued+'\nEm execução: '+stats.running+'\nConcluídas: '+stats.completed);
    }else if(text==='/start'){
      await telegramSend(env,'Centro de Negócios online.\n\n/station — estação completa\n/doctor — diagnóstico\n/server — servidor privado\n/claude <pedido>\n/claude @pentehouse <pedido>\n\n/operit system\n/operit sites\n/operit git-status centro\n/operit git-pull centro\n/status');
    }else if(text){
      if(text.startsWith('/')){
        await telegramSend(env,'Centro disponível:\n/station — estação completa\n/doctor — diagnóstico\n/server — servidor privado\n/claude <pedido>\n/claude @pentehouse <pedido>\n\nOperit:\n/operit system\n/operit sites\n/operit git-status centro\n/operit git-pull centro\n\nProjectos: centro, pentehouse, pizza, kebab, doisirmaos\n/status — estado do executor');
      }else{
        await telegramApi(env,'sendChatAction',{chat_id:env.TELEGRAM_CHAT_ID,action:'typing'});
        try{
          const fast=await runTelegramFront(env,text);
          const response=fast?.response;
          const parsed=response&&typeof response==='object'?response:extractJson(typeof response==='string'?response:'');
          if(!parsed){
            await telegramSend(env,'Não consegui estruturar a resposta rápida. Usa /claude seguido do pedido para enviar directamente ao Claude Code.');
          }else{
            let answer=String(parsed.answer||'').trim();
            const tooShort=answer.length<40||answer.split(/\s+/).length<6;
            const needsClaude=parsed.needsClaude===true||tooShort;
            if(tooShort){
              answer='Posso dar-te uma resposta útil, mas para não inventar preciso de consultar o estado real do projecto. Posso aprofundar já com o Claude Code.';
            }
            if(!needsClaude){
              await telegramSend(env,'⚡ '+answer);
            }else{
              const alias=String(parsed.project||'local').toLowerCase();
              const repo=alias==='local'?null:OPERIT_PROJECTS[alias];
              const prompt=String(parsed.claudePrompt||text).trim().slice(0,5000);
              const task=await q.createTask({
                action:'claude_query',
                target:repo||'local',
                args:{prompt},
                label:'Claude Code · '+(repo||'geral')
              },'telegram-front');
              await telegramSend(env,'⚡ '+answer+'\n\nPosso aprofundar isto com o Claude Code.',{
                reply_markup:{inline_keyboard:[[
                  {text:'🧠 Aprofundar',callback_data:'taskapprove:'+task.id},
                  {text:'❌ Não',callback_data:'taskreject:'+task.id}
                ]]}
              });
            }
          }
        }catch(error){
          await telegramSend(env,'IA rápida indisponível neste momento. Podes continuar com /claude <pedido>.');
        }
      }
    }
  }

  const cb=update?.callback_query;
  if(cb&&String(cb.message?.chat?.id||'')===String(env.TELEGRAM_CHAT_ID)){
    const data=String(cb.data||'');
    let m=data.match(/^task(approve|reject):(.+)$/);
    if(m){
      const approved=m[1]==='approve';
      const resolved=await q.resolveTask(m[2],approved);
      await telegramApi(env,'answerCallbackQuery',{callback_query_id:cb.id,text:approved?'Tarefa enviada para execução.':'Tarefa recusada.'});
      if(resolved.ok)await telegramSend(env,approved?'Autorizado. A entregar ao telemóvel...':'Tarefa recusada.');
      return {ok:true};
    }
    m=data.match(/^pair(approve|reject):(.+)$/);
    if(m){
      const approved=m[1]==='approve';
      await q.resolvePair(m[2],approved);
      await telegramApi(env,'answerCallbackQuery',{callback_query_id:cb.id,text:approved?'Operit autorizado.':'Emparelhamento recusado.'});
      return {ok:true};
    }
    m=data.match(/^(approve|reject):(.+)$/);
    if(m){
      await q.appendDecisionEvent({decisionId:m[2],status:m[1]==='approve'?'approved':'rejected'});
      await telegramApi(env,'answerCallbackQuery',{callback_query_id:cb.id,text:m[1]==='approve'?'Confirmação registada.':'Recusa registada.'});
    }
  }
  return {ok:true};
}

async function processTelegramUpdates(env){
  // O Telegram entra por webhook. Mantemos esta função para compatibilidade
  // com endpoints do Centro sem depender de getUpdates.
  return {ok:true,configured:Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID)};
}

async function telegramPoll(env,since){
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return {ok:false,configured:false,decisions:[],maxUpdateId:Number(since)||0};
  await processTelegramUpdates(env);
  const rows=await taskQueue(env).decisionEvents(Number(since)||0);
  return {
    ok:true,configured:true,
    decisions:rows.events.map(e=>({decisionId:e.decisionId,status:e.status,updateId:e.seq})),
    maxUpdateId:rows.maxSeq
  };
}


export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const origin=request.headers.get('origin')||'';

    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});

    if(origin&&origin!==ALLOWED_ORIGIN&&!origin.startsWith('http://localhost')&&!origin.startsWith('http://127.0.0.1')){
      return json({ok:false,error:'Origem não autorizada.'},403,origin);
    }

    if(url.pathname==='/telegram/webhook'&&request.method==='POST'){
      if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return json({ok:false,error:'Telegram não configurado.'},409,origin);
      const supplied=request.headers.get('x-telegram-bot-api-secret-token')||'';
      const expected=await telegramWebhookSecret(env);
      if(!supplied||supplied!==expected)return json({ok:false,error:'Webhook não autorizado.'},403,origin);
      let update;
      try{update=await request.json();}catch{return json({ok:false,error:'Update inválido.'},400,origin);}
      try{
        await handleTelegramUpdate(env,update);
        return json({ok:true},200,origin);
      }catch(error){
        return json({ok:false,error:'Falha Telegram webhook: '+String(error?.message||error)},500,origin);
      }
    }

    if(url.pathname==='/health'&&request.method==='GET'){
      return json({
        ok:true,
        service:'centro-negocios-ai',
        model:MODEL,
        agentModel:AGENT_MODEL,
        telegramConfigured:Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID),
        operitQueue:Boolean(env.TASKS)
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

    if(url.pathname==='/api/operit/pair'&&request.method==='POST'){
      try{
        const q=taskQueue(env);
        const pair=await q.createPair();
        const sent=await telegramSend(env,'NOVO DISPOSITIVO OPERIT\n\nPedido de emparelhamento recebido. Autorizar este telemóvel?',{
          reply_markup:{inline_keyboard:[[
            {text:'✅ Autorizar',callback_data:'pairapprove:'+pair.id},
            {text:'❌ Recusar',callback_data:'pairreject:'+pair.id}
          ]]}
        });
        if(!sent.ok)return json({ok:false,error:'Não consegui enviar confirmação ao Telegram.'},502,origin);
        return json({ok:true,pairId:pair.id,expiresAt:pair.expiresAt},200,origin);
      }catch(error){return json({ok:false,error:'Falha no emparelhamento: '+String(error?.message||error)},500,origin);}
    }

    if(url.pathname==='/api/operit/pair-status'&&request.method==='GET'){
      try{
        await processTelegramUpdates(env);
        const status=await taskQueue(env).pairStatus(String(url.searchParams.get('id')||''));
        return json({ok:true,...status},200,origin);
      }catch(error){return json({ok:false,error:String(error?.message||error)},500,origin);}
    }

    if(url.pathname==='/api/operit/pull'&&request.method==='GET'){
      try{
        await processTelegramUpdates(env);
        const token=bearer(request);
        const hash=await sha256Hex(token);
        const q=taskQueue(env);
        if(!await q.authenticate(hash))return json({ok:false,error:'Dispositivo não autorizado.'},401,origin);
        const task=await q.pullTask();
        if(task){
          await telegramSend(env,'A EXECUTAR AGORA\n\n'+task.label+'\n\nO telemóvel já recebeu a tarefa.');
        }
        return json({ok:true,task},200,origin);
      }catch(error){return json({ok:false,error:String(error?.message||error)},500,origin);}
    }

    if(url.pathname==='/api/operit/status'&&request.method==='GET'){
      try{
        await processTelegramUpdates(env);
        const token=bearer(request);
        const hash=await sha256Hex(token);
        const q=taskQueue(env);
        if(!await q.authenticate(hash))return json({ok:false,error:'Dispositivo não autorizado.'},401,origin);
        return json({ok:true,stats:await q.taskStats()},200,origin);
      }catch(error){return json({ok:false,error:String(error?.message||error)},500,origin);}
    }

    let body={};
    if(request.method==='POST'){
      try{body=await request.json();}catch{return json({ok:false,error:'Pedido inválido.'},400,origin);}
    }

    if(url.pathname==='/api/operit/result'&&request.method==='POST'){
      try{
        const token=bearer(request);
        const hash=await sha256Hex(token);
        const q=taskQueue(env);
        if(!await q.authenticate(hash))return json({ok:false,error:'Dispositivo não autorizado.'},401,origin);
        const id=String(body?.id||'');
        const result={
          exitCode:Number(body?.exitCode),
          stdout:String(body?.stdout||'').slice(0,12000),
          stderr:String(body?.stderr||'').slice(0,6000),
          durationMs:Number(body?.durationMs)||0
        };
        const done=await q.completeTask(id,result);
        if(!done.ok)return json({ok:false,error:'Tarefa não encontrada.'},404,origin);
        const output=(result.stdout||result.stderr||'(sem saída)').slice(0,2800);
        await telegramSend(env,'OPERIT CONCLUÍDO\n\n'+done.task.label+'\n\nExit: '+result.exitCode+'\nTempo: '+result.durationMs+' ms\n\n'+output);
        return json({ok:true},200,origin);
      }catch(error){return json({ok:false,error:String(error?.message||error)},500,origin);}
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