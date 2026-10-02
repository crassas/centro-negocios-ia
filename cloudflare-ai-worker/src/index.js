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
  async createGpuPair(meta={}){
    const now=Date.now();
    const active=await this.getJson('gpu:pair:active',null);
    if(active&&active.expiresAt>now&&active.status==='pending')return {id:active.id,expiresAt:active.expiresAt};
    const id=crypto.randomUUID().replaceAll('-','').slice(0,12);
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    const token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const pair={id,token,status:'pending',createdAt:now,expiresAt:now+10*60*1000,meta:meta&&typeof meta==='object'?meta:{}};
    await this.setJson('gpu:pair:active',pair);
    return {id,expiresAt:pair.expiresAt};
  }
  async resolveGpuPair(id,approved){
    const pair=await this.getJson('gpu:pair:active',null);
    if(!pair||pair.id!==id||pair.expiresAt<Date.now())return {ok:false};
    pair.status=approved?'approved':'rejected';
    if(approved){
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pair.token));
      pair.tokenHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      await this.setJson('gpu:tokenHash',pair.tokenHash);
      await this.setJson('gpu:meta',{...(pair.meta||{}),pairedAt:Date.now(),lastSeenAt:Date.now()});
    }
    await this.setJson('gpu:pair:active',pair);
    return {ok:true,status:pair.status};
  }
  async gpuPairStatus(id){
    const pair=await this.getJson('gpu:pair:active',null);
    if(!pair||pair.id!==id)return {status:'missing'};
    if(pair.expiresAt<Date.now())return {status:'expired'};
    return {status:pair.status,token:pair.status==='approved'?pair.token:undefined,expiresAt:pair.expiresAt};
  }
  async authenticateGpu(hash){
    const saved=await this.getJson('gpu:tokenHash','');
    return Boolean(saved&&hash&&saved===hash);
  }
  async touchGpu(meta={}){
    const current=await this.getJson('gpu:meta',{});
    const next={...current,...(meta&&typeof meta==='object'?meta:{}),lastSeenAt:Date.now()};
    await this.setJson('gpu:meta',next);
    return next;
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
  async setRepoSnapshot(project,snapshot){
    const key=String(project||'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40);
    if(!key)return {ok:false};
    const value={...(snapshot&&typeof snapshot==='object'?snapshot:{}),project:key,updatedAt:Date.now()};
    await this.setJson('repo:snapshot:'+key,value);
    return {ok:true,updatedAt:value.updatedAt};
  }
  async getRepoSnapshot(project){
    const key=String(project||'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40);
    if(!key)return null;
    return await this.getJson('repo:snapshot:'+key,null);
  }
  async repoSnapshotStatus(){
    const projects=['centro','pentehouse','pizza','doisirmaos'];
    const out={};
    for(const project of projects){
      const row=await this.getRepoSnapshot(project);
      out[project]=row?{available:true,updatedAt:row.updatedAt||null,source:row.source||'local'}:{available:false};
    }
    return out;
  }
  async appendRoomMessage(message){
    const rows=await this.getJson('room:history',[]);
    rows.push({
      id:crypto.randomUUID().replaceAll('-','').slice(0,10),
      role:String(message?.role||'assistant').slice(0,30),
      agent:String(message?.agent||'').slice(0,50),
      text:String(message?.text||'').slice(0,5000),
      createdAt:Date.now()
    });
    await this.setJson('room:history',rows.slice(-40));
    return {ok:true};
  }
  async roomHistory(limit=16){
    const rows=await this.getJson('room:history',[]);
    return rows.slice(-Math.max(1,Math.min(Number(limit)||16,40)));
  }
  async clearRoom(){
    await this.setJson('room:history',[]);
    return {ok:true};
  }

  async enqueueCouncil(topic){
    const subject=String(topic||'').trim().slice(0,5000);
    if(!subject)return {ok:false};
    const queue=await this.getJson('council:queue',[]);
    const id=crypto.randomUUID().replaceAll('-','').slice(0,12);
    queue.push({id,topic:subject,createdAt:Date.now()});
    await this.setJson('council:queue',queue.slice(-20));
    const current=await this.ctx.storage.getAlarm();
    if(current===null)await this.ctx.storage.setAlarm(Date.now()+50);
    return {ok:true,id};
  }

  async alarm(){
    const queue=await this.getJson('council:queue',[]);
    if(!queue.length)return;
    const job=queue.shift();
    await this.setJson('council:queue',queue);
    try{
      await runCouncil(this.env,job.topic);
    }catch(error){
      try{
        await telegramSend(this.env,'MESA INTERROMPIDA\n\n'+String(error?.message||error).slice(0,1200));
      }catch{}
    }
    const remaining=await this.getJson('council:queue',[]);
    if(remaining.length)await this.ctx.storage.setAlarm(Date.now()+50);
  }
}

const FAST_MODEL='@cf/zai-org/glm-4.7-flash';
const MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DEEP_MODEL='@cf/openai/gpt-oss-120b';
const AGENT_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const QWEN_MODEL='@cf/qwen/qwen3-30b-a3b-fp8';
const MISTRAL_MODEL='@cf/mistralai/mistral-small-3.1-24b-instruct';
const GEMMA_MODEL='@cf/google/gemma-4-26b-a4b-it';
const COUNCIL_CRITIC_MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
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
  return env.AI.run(FAST_MODEL,{
    messages:[
      {
        role:'system',
        content:[
          'És o router frontal rápido da Estação Centro.',
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


async function runFrontPower(env,text,project='local'){
  const projectContext={
    pentehouse:'Projecto Pentehouse: barbearia local no Porto. Prioridades conhecidas: mobile, reservas/WhatsApp, SEO/GEO Marquês-Constituição-Porto, equipa/galeria, performance e confiança. Não inventes métricas ou estado técnico actual.',
    pizza:'Projecto Best Pizza & Kebab: restauração local em Campanhã. Prioridades conhecidas: menu mobile, pedido/contacto, SEO/GEO Campanhã-São Roque, indexação e conversão. Não inventes métricas ou estado técnico actual.',
    doisirmaos:'Projecto 2 Irmãos: restaurante local em Campanhã. Prioridades conhecidas: comida portuguesa, menu, localização/confiança, SEO/GEO Campanhã-Porto, schema Restaurant. Não inventes dados actuais.',
    centro:'Projecto Centro de Negócios: estação operacional Telegram + Cloudflare + Centro Agent + Centro Server privado. Prioridades: baixa latência, resiliência, router multi-agente, memória SQLite, observabilidade e custo zero sempre que possível.',
    local:''
  };
  const context=projectContext[project]||'';
  const result=await env.AI.run(MODEL,{
    messages:[
      {
        role:'system',
        content:[
          'És a IA principal da Estação Centro.',
          'Responde em português de Portugal, sem gerúndio.',
          'Qualidade acima de frases genéricas. Dá respostas concretas, úteis e compactas.',
          'Quando falares de um projecto, separa o que sabes do que precisaria de verificação real.',
          'Não inventes métricas, rankings, ficheiros ou execuções.',
          'Quando fizer sentido, apresenta prioridades práticas por ordem.',
          'Não peças para usar Claude Code. Tu és agora o modelo principal de raciocínio.',
          context?('CONTEXTO: '+context):''
        ].filter(Boolean).join(' ')
      },
      {role:'user',content:String(text||'').slice(0,6000)}
    ],
    max_tokens:900,
    temperature:0.25
  });
  return typeof result?.response==='string'?result.response.trim():'';
}


function modelText(result){
  if(typeof result?.response==='string')return result.response.trim();
  if(typeof result?.result?.response==='string')return result.result.response.trim();
  return '';
}

async function councilTurn(env,model,system,user,maxTokens=650,fallbackModel=null){
  const input={
    messages:[
      {role:'system',content:system},
      {role:'user',content:user}
    ],
    max_tokens:maxTokens,
    temperature:0.25
  };
  try{
    const result=await env.AI.run(model,input);
    const text=modelText(result);
    if(text)return text;
  }catch{}
  if(fallbackModel&&fallbackModel!==model){
    try{
      const result=await env.AI.run(fallbackModel,input);
      const text=modelText(result);
      if(text)return text;
    }catch{}
  }
  return '';
}

const PROJECT_REPOS={
  centro:{repo:'crassas/centro-negocios-ia',public:true},
  pentehouse:{repo:'crassas/pente_houselanding',public:true},
  pizza:{repo:'crassas/best-pizza-kebab',public:true},
  doisirmaos:{repo:'crassas/restaurante-2-irmaos',public:false}
};

function projectFromTopic(text){
  const lower=String(text||'').toLowerCase();
  if(lower.includes('pentehouse')||lower.includes('pente house')||lower.includes('penthouse'))return 'pentehouse';
  if(lower.includes('best pizza')||lower.includes('pizza')||lower.includes('kebab'))return 'pizza';
  if(lower.includes('2 irmãos')||lower.includes('dois irmãos')||lower.includes('doisirmaos'))return 'doisirmaos';
  if(lower.includes('centro de negócios')||lower.includes('centro negocios')||lower.includes('centro'))return 'centro';
  return 'local';
}

async function fetchPublicRepoSnapshot(project){
  const info=PROJECT_REPOS[project];
  if(!info||!info.public)return null;
  const headers={'user-agent':'centro-negocios-ai','accept':'application/vnd.github+json'};
  const treeRes=await fetch('https://api.github.com/repos/'+info.repo+'/git/trees/main?recursive=1',{headers});
  if(!treeRes.ok)return null;
  const tree=await treeRes.json();
  const paths=(Array.isArray(tree?.tree)?tree.tree:[])
    .filter(x=>x&&x.type==='blob'&&typeof x.path==='string')
    .map(x=>x.path)
    .filter(p=>!/(^|\/)(node_modules|dist|build|\.git)(\/|$)/.test(p))
    .slice(0,140);
  const preferred=['README.md','package.json','index.html','app.js','src/main.js','src/main.ts','src/App.jsx','src/App.tsx'];
  const files={};
  for(const path of preferred){
    if(!paths.includes(path))continue;
    try{
      const res=await fetch('https://raw.githubusercontent.com/'+info.repo+'/main/'+path,{headers:{'user-agent':'centro-negocios-ai'}});
      if(res.ok)files[path]=(await res.text()).slice(0,5000);
    }catch{}
    if(Object.keys(files).length>=4)break;
  }
  return {source:'github-public',repo:info.repo,branch:'main',paths,files};
}

async function getRepoContextForCouncil(env,project){
  if(!project||project==='local')return {project:'local',available:false,note:'Sem projecto específico.'};
  const q=taskQueue(env);
  let snapshot=await q.getRepoSnapshot(project);
  if(snapshot)return {project,available:true,...snapshot};
  snapshot=await fetchPublicRepoSnapshot(project);
  if(snapshot){
    await q.setRepoSnapshot(project,snapshot);
    return {project,available:true,...snapshot};
  }
  const info=PROJECT_REPOS[project];
  return {
    project,
    available:false,
    repo:info?.repo||null,
    note:info&&!info.public?'Repositório privado: aguarda snapshot do Centro Agent local.':'Snapshot ainda indisponível.'
  };
}

function compactRepoContext(ctx){
  if(!ctx||!ctx.available)return JSON.stringify(ctx||{available:false});
  return JSON.stringify({
    project:ctx.project,
    source:ctx.source,
    repo:ctx.repo,
    branch:ctx.branch,
    head:ctx.head,
    status:ctx.status,
    paths:Array.isArray(ctx.paths)?ctx.paths.slice(0,100):[],
    files:ctx.files&&typeof ctx.files==='object'?ctx.files:{},
    updatedAt:ctx.updatedAt||null
  }).slice(0,24000);
}


function strictOutputHint(text){
  const raw=String(text||'').trim();
  const lower=raw.toLowerCase();
  const exact=/\b(apenas|só|somente|responde[m]? apenas|digam apenas|diz apenas)\b/.test(lower);
  return exact
    ? 'O utilizador impôs uma restrição literal de formato. Cumpre-a exactamente. Não acrescentes explicações, títulos, justificações, listas, avisos ou texto extra.'
    : '';
}

function roomTranscript(rows){
  return (Array.isArray(rows)?rows:[]).map(row=>{
    const who=row.role==='user'?'Joao':(row.agent||'IA');
    return who+': '+String(row.text||'');
  }).join('\n').slice(-18000);
}

async function groupTurn(env,model,name,role,userText,history,peerText=''){
  const exact=strictOutputHint(userText);
  const result=await env.AI.run(model,{
    messages:[
      {
        role:'system',
        content:[
          'Estás num grupo permanente de IAs no Telegram com o utilizador.',
          'O teu nome é '+name+'. A tua função é '+role+'.',
          'Fala como membro de um grupo, não como relatório empresarial.',
          'Responde em português de Portugal, sem gerúndio.',
          'Segue primeiro a instrução literal do utilizador.',
          exact,
          'Não transformes cumprimentos ou pedidos simples em análises.',
          'Não repitas o que outra IA já disse sem acrescentar valor.',
          'Se não tens nada útil a acrescentar, responde exactamente: [SILÊNCIO].',
          'Nunca inventes acesso, resultados ou acções.'
        ].filter(Boolean).join(' ')
      },
      {
        role:'user',
        content:
          'CONVERSA RECENTE:\n'+roomTranscript(history)+
          '\n\nMENSAGEM NOVA DO UTILIZADOR:\n'+String(userText||'').slice(0,5000)+
          (peerText?'\n\nOUTRAS IAs JÁ DISSERAM NESTA RONDA:\n'+peerText:'')
      }
    ],
    max_tokens:360,
    temperature:0.25
  });
  return modelText(result);
}

async function runGroupChat(env,userText){
  const q=taskQueue(env);
  await q.appendRoomMessage({role:'user',agent:'Joao',text:userText});
  const history=await q.roomHistory(14);
  const exact=Boolean(strictOutputHint(userText));

  // Resposta frontal rápida primeiro.
  let first=await groupTurn(
    env,FAST_MODEL,'GLM','responder depressa, perceber intenção e abrir a conversa',
    userText,history
  );
  if(first&&first!=='[SILÊNCIO]'){
    await q.appendRoomMessage({role:'assistant',agent:'GLM',text:first});
    await telegramSend(env,'⚡ GLM\n'+first);
  }

  // Dois especialistas pensam em paralelo.
  const qwenP=groupTurn(
    env,QWEN_MODEL,'Qwen','engenharia, código, lógica e decomposição de problemas',
    userText,history,first
  );
  const llamaP=groupTurn(
    env,MODEL,'Llama','crítica, raciocínio e detecção de falhas',
    userText,history,first
  );

  const settled=await Promise.allSettled([qwenP,llamaP]);
  const qwen=settled[0].status==='fulfilled'?settled[0].value:'';
  const llama=settled[1].status==='fulfilled'?settled[1].value:'';

  for(const [agent,label,text] of [
    ['Qwen','🧩 QWEN',qwen],
    ['Llama','🔎 LLAMA 70B',llama]
  ]){
    if(text&&text!=='[SILÊNCIO]'){
      await q.appendRoomMessage({role:'assistant',agent,text});
      await telegramSend(env,label+'\n'+text);
    }
  }

  // Em pedidos literais curtos, não forçar debate.
  if(exact)return;

  const peers=[first,qwen,llama].filter(x=>x&&x!=='[SILÊNCIO]').join('\n\n');
  if(!peers)return;

  // Um quarto agente reage ao que os outros disseram, para criar conversa real.
  const follow=await groupTurn(
    env,MISTRAL_MODEL,'Mistral','síntese prática e ligação entre as ideias dos outros',
    userText,await q.roomHistory(16),peers
  );
  if(follow&&follow!=='[SILÊNCIO]'){
    await q.appendRoomMessage({role:'assistant',agent:'Mistral',text:follow});
    await telegramSend(env,'📍 MISTRAL\n'+follow);
  }
}

async function runCouncil(env,topic){
  const subject=String(topic||'').trim().slice(0,5000);
  if(!subject)return;

  const project=projectFromTopic(subject);
  const repoContext=await getRepoContextForCouncil(env,project);
  const evidence=compactRepoContext(repoContext);
  await telegramSend(env,'⚙️ ESQUADRÃO ACTIVADO\n\n5 especialistas em paralelo · projecto: '+project+'\nRepositório: '+(repoContext.available?'contexto disponível':'contexto limitado'));

  try{
    const scoutP=councilTurn(
      env,FAST_MODEL,
      'És o EXPLORADOR. Abre oportunidades e riscos. Português de Portugal, curto, concreto, sem inventar. Máximo 220 palavras.',
      'TEMA:\n'+subject,340,MODEL
    );
    const repoP=councilTurn(
      env,QWEN_MODEL,
      'És o ENGENHEIRO DE REPOSITÓRIO. Foca arquitectura, código, performance, manutenção e alterações concretas. Se não tiveres evidência de ficheiros, diz isso claramente. Português de Portugal. Máximo 280 palavras.',
      'TEMA:\n'+subject,430,MODEL
    );
    const seoP=councilTurn(
      env,MISTRAL_MODEL,
      'És o ESPECIALISTA SEO/GEO/AEO. Foca intenção local, estrutura, conteúdo, dados estruturados e descoberta. Não inventes rankings. Português de Portugal. Máximo 260 palavras.',
      'TEMA:\n'+subject,400,FAST_MODEL
    );
    const uxP=councilTurn(
      env,GEMMA_MODEL,
      'És o ESPECIALISTA UX/CONVERSÃO. Foca mobile, clareza, CTA, confiança, fricção e percurso do utilizador. Português de Portugal. Máximo 260 palavras.',
      'TEMA:\n'+subject,400,FAST_MODEL
    );
    const auditP=councilTurn(
      env,MODEL,
      'És o AUDITOR. Procura riscos, pressupostos frágeis, performance, segurança, manutenção e testes necessários. Não faças conversa social. Português de Portugal. Máximo 260 palavras.',
      'TEMA:\n'+subject,400,FAST_MODEL
    );

    const scout=await scoutP;
    await telegramSend(env,'⚡ GLM · EXPLORADOR\n\n'+(scout||'Sem resposta.'));

    const settled=await Promise.allSettled([repoP,seoP,uxP,auditP]);
    const take=(i)=>settled[i].status==='fulfilled'&&settled[i].value?settled[i].value:'Sem resposta.';
    const repoAnswer=take(0),seo=take(1),ux=take(2),audit=take(3);

    await Promise.all([
      telegramSend(env,'🧩 QWEN · ENGENHEIRO DE REPO\n\n'+repoAnswer),
      telegramSend(env,'📍 MISTRAL · SEO/GEO/AEO\n\n'+seo),
      telegramSend(env,'🎛️ GEMMA · UX/CONVERSÃO\n\n'+ux),
      telegramSend(env,'🔎 LLAMA 70B · AUDITOR\n\n'+audit)
    ]);

    const synthesis=await councilTurn(
      env,DEEP_MODEL,
      [
        'És o DIRECTOR FINAL de um esquadrão multi-agente.',
        'Não continues a debater: transforma as análises em execução.',
        'Português de Portugal, sem gerúndio.',
        'Formato: PRIORIDADE AGORA; ACÇÕES CONCRETAS; ALTERAÇÕES TÉCNICAS; TESTES; BLOQUEIOS.',
        'Distingue factos de hipóteses. Máximo 480 palavras.'
      ].join(' '),
      'TEMA:\n'+subject+
      '\n\nEXPLORADOR:\n'+scout+
      '\n\nENGENHEIRO:\n'+repoAnswer+
      '\n\nSEO/GEO:\n'+seo+
      '\n\nUX:\n'+ux+
      '\n\nAUDITOR:\n'+audit,
      720,MODEL
    );

    await telegramSend(env,'🎯 GPT-OSS-120B · DIRECTOR\n\n'+(synthesis||'Sem resposta.'));
    await telegramSend(env,'✅ ESQUADRÃO CONCLUÍDO');
  }catch(error){
    await telegramSend(env,'ESQUADRÃO INTERROMPIDO\n\n'+String(error?.message||error).slice(0,1200));
  }
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

function deterministicProjectFront(text){
  const raw=String(text||'').trim();
  const lower=raw.toLowerCase();
  const improvementIntent=/\b(melhorar|melhorias|optimizar|otimizar|corrigir|hoje|fazer melhor)\b/i.test(raw);
  if(!improvementIntent)return null;

  if(lower.includes('pentehouse')){
    return {
      answer:[
        'Hoje eu atacaria 5 pontos na Pentehouse:',
        '1. Mobile/hero: confirmar que marca, Marquês e CTA de WhatsApp ficam claros logo na primeira dobra.',
        '2. Reservas: reduzir passos entre escolher serviço/barbeiro e iniciar contacto.',
        '3. SEO local: rever titles, H1/H2 e conteúdo para Marquês, Constituição e Porto sem repetição artificial.',
        '4. Confiança: dar mais destaque à equipa, galeria real e informação prática.',
        '5. Técnico: confirmar velocidade, indexação, schema e links internos no site publicado.'
      ].join('\n'),
      project:'pentehouse',
      claudePrompt:'Analisa o projecto Pentehouse real e o site publicado. Verifica mobile/hero, conversão e reservas, SEO local Marquês/Constituição/Porto, equipa/galeria, performance, indexação, schema e links internos. Não inventes métricas. Devolve prioridades concretas e alterações de código recomendadas.'
    };
  }

  if(lower.includes('best pizza')||lower.includes('pizza')||lower.includes('kebab')){
    return {
      answer:[
        'Hoje eu atacaria 5 pontos no Best Pizza & Kebab:',
        '1. Menu mobile: reduzir comprimento e tornar categorias/pesquisa realmente rápidas.',
        '2. Conversão: manter pedido/telefone sempre acessível.',
        '3. SEO local: reforçar Campanhã e São Roque nas páginas certas.',
        '4. Conteúdo: evitar blocos repetidos e destacar os produtos/benefícios principais.',
        '5. Técnico: confirmar headings, schema, sitemap, indexação e links internos.'
      ].join('\n'),
      project:'pizza',
      claudePrompt:'Analisa o projecto Best Pizza & Kebab real e o site publicado. Verifica menu mobile, pesquisa/categorias, conversão, SEO local Campanhã/São Roque, headings, schema, sitemap, indexação e links internos. Não inventes métricas. Devolve prioridades e alterações concretas.'
    };
  }

  if(lower.includes('2 irmãos')||lower.includes('dois irmãos')||lower.includes('doisirmaos')){
    return {
      answer:[
        'Hoje eu atacaria 5 pontos no 2 Irmãos:',
        '1. Hero: comida portuguesa, Campanhã e contacto imediatamente claros.',
        '2. Menu: destacar os pratos fortes e reduzir navegação desnecessária.',
        '3. Confiança: localização, horários e informação prática consistentes.',
        '4. SEO local: headings e conteúdo orientados a Campanhã/Porto.',
        '5. Técnico: validar schema Restaurant, indexação e performance.'
      ].join('\n'),
      project:'doisirmaos',
      claudePrompt:'Analisa o projecto 2 Irmãos real e o site publicado. Verifica hero, menu, confiança/localização, SEO Campanhã/Porto, schema Restaurant, indexação e performance. Não inventes dados. Devolve prioridades e alterações concretas.'
    };
  }

  if(lower.includes('centro de negócios')||lower.includes('centro negocios')||lower.includes('centro')){
    return {
      answer:[
        'Hoje eu atacaria 5 pontos no Centro:',
        '1. Latência: resposta frontal imediata e execução pesada em segundo plano.',
        '2. Resiliência: supervisor, retries e recuperação automática.',
        '3. Memória: SQLite central para tarefas, projectos e histórico.',
        '4. Router: separar IA rápida, Claude, auditor e executor.',
        '5. Observabilidade: estado, tempos, erros e fila num painel único.'
      ].join('\n'),
      project:'centro',
      claudePrompt:'Analisa o projecto Centro de Negócios real. Verifica latência, supervisor/retries, arquitectura de memória SQLite, router multi-agente e observabilidade. Não inventes estado. Devolve melhorias concretas por prioridade.'
    };
  }

  return null;
}

async function handleTelegramUpdate(env,update,ctx){
  const q=taskQueue(env);
  const claimed=await q.claimTelegramUpdate(update?.update_id);
  if(!claimed)return {ok:true,duplicate:true};

  const message=update?.message;
  if(message&&String(message.chat?.id||'')===String(env.TELEGRAM_CHAT_ID)){
    const text=String(message.text||'').trim();

    const mesa=text.match(/^\/mesa(?:\s+([\s\S]{1,5000}))?$/i);
    if(mesa){
      const topic=String(mesa[1]||'').trim();
      if(!topic){
        await telegramSend(env,'Usa: /mesa <tema>\n\nExemplo: /mesa como levamos a Pentehouse ao próximo nível?');
      }else{
        await q.enqueueCouncil(topic);
        await telegramSend(env,'🗣️ SALA DE CONSELHO ABERTA\n\nTema: '+topic.slice(0,1200)+'\n\nExecução cloud directa. A primeira LLM deve responder em poucos segundos.');
      }
      return {ok:true};
    }

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
    }else if(text==='/limpar'){
      await q.clearRoom();
      await telegramSend(env,'Conversa do grupo limpa.');
    }else if(text==='/repos'){
      const status=await q.repoSnapshotStatus();
      const lines=['REPOSITÓRIOS DA ESTAÇÃO'];
      for(const [name,row] of Object.entries(status)){
        lines.push((row.available?'✅ ':'⚠️ ')+name+(row.available?' · '+(row.source||'snapshot'):' · sem snapshot'));
      }
      await telegramSend(env,lines.join('\n'));
    }else if(text==='/status'){
      const stats=await q.taskStats();
      await telegramSend(env,'OPERIT\n\n'+(stats.paired?'Dispositivo: ligado':'Dispositivo: por emparelhar')+'\nFila: '+stats.queued+'\nEm execução: '+stats.running+'\nConcluídas: '+stats.completed);
    }else if(text==='/start'){
      await telegramSend(env,'Centro de Negócios online.\n\nConversa normal = grupo multi-LLM\n/mesa <tema> — análise formal\n/limpar — limpar memória do grupo\n/repos — repositórios\n/station — estação completa\n/doctor — diagnóstico\n/server — servidor privado\n/claude <pedido>\n/claude @pentehouse <pedido>\n\n/operit system\n/operit sites\n/operit git-status centro\n/operit git-pull centro\n/status');
    }else if(text){
      if(text.startsWith('/')){
        await telegramSend(env,'Centro disponível:\nConversa normal = grupo multi-LLM\n/mesa <tema> — análise formal\n/limpar — limpar memória do grupo\n/repos — repositórios\n/station — estação completa\n/doctor — diagnóstico\n/server — servidor privado\n/claude <pedido>\n/claude @pentehouse <pedido>\n\nOperit:\n/operit system\n/operit sites\n/operit git-status centro\n/operit git-pull centro\n\nProjectos: centro, pentehouse, pizza, kebab, doisirmaos\n/status — estado do executor');
      }else{
        await telegramApi(env,'sendChatAction',{chat_id:env.TELEGRAM_CHAT_ID,action:'typing'});
        const job=runGroupChat(env,text);
        if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(job);
        else await job;
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
  async fetch(request,env,ctx){
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
        await handleTelegramUpdate(env,update,ctx);
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
        deepModel:DEEP_MODEL,
        agentModel:AGENT_MODEL,
        fastModel:FAST_MODEL,
        councilCriticModel:COUNCIL_CRITIC_MODEL,
        telegramConfigured:Boolean(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID),
        operitQueue:Boolean(env.TASKS),
        telegramFront:'v3-deterministic-projects'
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

    if(url.pathname==='/api/repo/snapshot'&&request.method==='POST'){
      try{
        const token=bearer(request);
        const hash=await sha256Hex(token);
        const q=taskQueue(env);
        if(!await q.authenticate(hash))return json({ok:false,error:'Dispositivo não autorizado.'},401,origin);
        const project=String(body?.project||'').toLowerCase();
        if(!PROJECT_REPOS[project])return json({ok:false,error:'Projecto inválido.'},400,origin);
        const snapshot=body?.snapshot&&typeof body.snapshot==='object'?body.snapshot:{};
        const saved=await q.setRepoSnapshot(project,{...snapshot,source:'centro-agent-local'});
        return json({ok:true,...saved},200,origin);
      }catch(error){
        return json({ok:false,error:String(error?.message||error)},500,origin);
      }
    }

    if(url.pathname==='/api/council/run'&&request.method==='POST'){
      try{
        const token=bearer(request);
        const hash=await sha256Hex(token);
        const q=taskQueue(env);
        if(!await q.authenticate(hash))return json({ok:false,error:'Dispositivo não autorizado.'},401,origin);
        const topic=String(body?.topic||'').trim();
        if(!topic)return json({ok:false,error:'Tema em falta.'},400,origin);
        await runCouncil(env,topic);
        return json({ok:true},200,origin);
      }catch(error){
        await telegramSend(env,'MESA INTERROMPIDA\n\n'+String(error?.message||error).slice(0,1200));
        return json({ok:false,error:String(error?.message||error)},500,origin);
      }
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
        if(done.task.action==='council_run'){
          await telegramSend(env,result.exitCode===0?'✅ SALA DE CONSELHO CONCLUÍDA':'⚠️ SALA DE CONSELHO TERMINOU COM ERRO');
        }else{
          await telegramSend(env,'OPERIT CONCLUÍDO\n\n'+done.task.label+'\n\nExit: '+result.exitCode+'\nTempo: '+result.durationMs+' ms\n\n'+output);
        }
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
          let result=null,usedModel=AGENT_MODEL,parsed=null;
          try{
            result=await runAgent(env,question,context);
            const response=result?.response;
            parsed=response&&typeof response==='object'?response:extractJson(typeof response==='string'?response:'');
          }catch{}
          if(!parsed){
            usedModel=COUNCIL_CRITIC_MODEL;
            try{
              const fallback=await env.AI.run(COUNCIL_CRITIC_MODEL,{
                messages:[
                  {role:'system',content:baseSystem()+' Devolve JSON válido com summary string e actions array. Se não houver acções seguras, actions deve ser vazio.'},
                  {role:'user',content:'PEDIDO:\n'+question+'\n\nDADOS ACTUAIS:\n'+JSON.stringify(context).slice(0,30000)}
                ],
                response_format:{
                  type:'json_schema',
                  json_schema:{
                    type:'object',
                    properties:{
                      summary:{type:'string'},
                      actions:{type:'array',items:{type:'object'}}
                    },
                    required:['summary','actions']
                  }
                },
                max_tokens:650,
                temperature:0.1
              });
              const response=fallback?.response;
              parsed=response&&typeof response==='object'?response:extractJson(typeof response==='string'?response:'');
              result=fallback;
            }catch{}
          }
          if(!parsed)return json({ok:true,summary:'Análise concluída sem propostas estruturadas.',actions:[],model:usedModel,usage:result?.usage||null},200,origin);
          const actions=Array.isArray(parsed.actions)?parsed.actions.slice(0,5).filter(x=>x&&typeof x==='object'):[];
          return json({ok:true,summary:String(parsed.summary||'').trim()||'Análise concluída.',actions,model:usedModel,usage:result?.usage||null},200,origin);
        }

        let result=null,usedModel=MODEL,answer='';
        try{
          result=await runAssist(env,question,context);
          answer=typeof result?.response==='string'?result.response.trim():'';
        }catch{}
        if(!answer){
          usedModel=FAST_MODEL;
          try{
            result=await env.AI.run(FAST_MODEL,{
              messages:[
                {role:'system',content:baseSystem()},
                {role:'user',content:'PEDIDO:\n'+question+'\n\nDADOS ACTUAIS:\n'+JSON.stringify(context).slice(0,30000)}
              ],
              max_tokens:550,
              temperature:0.2
            });
            answer=typeof result?.response==='string'?result.response.trim():'';
          }catch{}
        }
        if(!answer)return json({ok:true,answer:'IA temporariamente sem resposta. A estação e o Telegram continuam operacionais.',model:'fallback-local',usage:null},200,origin);
        return json({ok:true,answer,model:usedModel,usage:result?.usage||null},200,origin);
      }catch(error){
        return json({ok:false,error:'Falha no Workers AI: '+String(error?.message||error)},500,origin);
      }
    }

    return json({ok:false,error:'Rota não encontrada.'},404,origin);
  }
};