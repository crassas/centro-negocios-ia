const MODEL='@cf/meta/llama-3.2-3b-instruct';
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
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json;charset=UTF-8',...cors(origin)}
  });
}
function cleanContext(context){
  if(!context||typeof context!=='object')return {};
  return {
    generatedAt:context.generatedAt||null,
    auditGeneratedAt:context.auditGeneratedAt||null,
    projects:Array.isArray(context.projects)?context.projects.slice(0,30):[],
    leads:Array.isArray(context.leads)?context.leads.slice(0,50):[],
    finance:context.finance||null,
    searchConsole:context.searchConsole||null
  };
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const origin=request.headers.get('origin')||'';

    if(request.method==='OPTIONS'){
      return new Response(null,{status:204,headers:cors(origin)});
    }

    if(url.pathname==='/health'&&request.method==='GET'){
      return json({ok:true,service:'centro-negocios-ai',model:MODEL},200,origin);
    }

    if(url.pathname!=='/api/assist'||request.method!=='POST'){
      return json({ok:false,error:'Rota não encontrada.'},404,origin);
    }

    if(origin&&origin!==ALLOWED_ORIGIN&&!origin.startsWith('http://localhost')&&!origin.startsWith('http://127.0.0.1')){
      return json({ok:false,error:'Origem não autorizada.'},403,origin);
    }

    let body;
    try{body=await request.json();}catch{return json({ok:false,error:'Pedido inválido.'},400,origin);}

    const question=String(body?.question||'').trim();
    if(!question)return json({ok:false,error:'Pergunta em falta.'},400,origin);
    if(question.length>4000)return json({ok:false,error:'Pergunta demasiado longa.'},400,origin);

    const context=cleanContext(body?.context);
    const contextText=JSON.stringify(context).slice(0,60000);

    const system=[
      'És o assistente operacional de um pequeno negócio digital em Portugal.',
      'Responde sempre em português de Portugal, com linguagem directa e sem gerúndio.',
      'Usa apenas os dados fornecidos como factos. Não inventes métricas, rankings, clientes, pagamentos ou resultados.',
      'Quando faltarem dados, diz exactamente o que falta.',
      'Distingue claramente facto observado, inferência e recomendação.',
      'Prioriza acções concretas, simples e de baixo custo para pequenos negócios locais.',
      'Podes analisar SEO técnico, CRM, leads, caixa agregado e Search Console.',
      'Nunca peças nem assumes passwords, tokens ou dados do Cofre.',
      'Não afirmes que alteraste o CRM, caixa ou sites. Podes apenas propor alterações.',
      'Quando houver várias tarefas, ordena-as por prioridade e explica brevemente porquê.'
    ].join(' ');

    try{
      const result=await env.AI.run(MODEL,{
        messages:[
          {role:'system',content:system},
          {role:'user',content:'PEDIDO:\n'+question+'\n\nDADOS ACTUAIS DO CENTRO DE NEGÓCIOS:\n'+contextText}
        ],
        max_tokens:700,
        temperature:0.2
      });

      const answer=typeof result?.response==='string'?result.response.trim():'';
      if(!answer)return json({ok:false,error:'O modelo não devolveu texto.'},502,origin);

      return json({
        ok:true,
        answer,
        model:MODEL,
        usage:result?.usage||null
      },200,origin);
    }catch(error){
      return json({
        ok:false,
        error:'Falha no Workers AI: '+String(error?.message||error)
      },500,origin);
    }
  }
};