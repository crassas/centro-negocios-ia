import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const sites = JSON.parse(await fs.readFile(new URL('../data/sites.json', import.meta.url),'utf8'));
let previous = {sites:[]};
try{previous = JSON.parse(await fs.readFile(new URL('../data/live.json', import.meta.url),'utf8'));}catch{}
const previousById = new Map((previous.sites||[]).map(x=>[x.id,x]));
const now = new Date().toISOString();

function textMatch(html, re){
  const m = html.match(re);
  return m ? m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim() : '';
}
function meta(html,name){
  const esc = name.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
  const patterns=[
    new RegExp('<meta[^>]+(?:name|property)=["\\\']'+esc+'["\\\'][^>]+content=["\\\']([^"\\\']*)["\\\'][^>]*>','i'),
    new RegExp('<meta[^>]+content=["\\\']([^"\\\']*)["\\\'][^>]+(?:name|property)=["\\\']'+esc+'["\\\'][^>]*>','i')
  ];
  for(const re of patterns){const m=html.match(re);if(m)return m[1].trim();}
  return '';
}
function linkRel(html,rel){
  const patterns=[
    new RegExp('<link[^>]+rel=["\\\']'+rel+'["\\\'][^>]+href=["\\\']([^"\\\']+)["\\\'][^>]*>','i'),
    new RegExp('<link[^>]+href=["\\\']([^"\\\']+)["\\\'][^>]+rel=["\\\']'+rel+'["\\\'][^>]*>','i')
  ];
  for(const re of patterns){const m=html.match(re);if(m)return m[1].trim();}
  return '';
}
async function fetchTimed(url, opts={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20000);
  const start=Date.now();
  try{
    const res=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 (compatible; CentroNegociosIA-Monitor/1.0; +https://github.com/crassas/centro-negocios-ia)','accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'},...opts});
    return {res,ms:Date.now()-start};
  }finally{clearTimeout(timer);}
}
async function endpoint(url){
  try{
    const x=await fetchTimed(url);
    return {ok:x.res.ok,status:x.res.status,text:x.res.ok?await x.res.text():''};
  }catch(e){return {ok:false,status:null,text:'',error:e.name==='AbortError'?'timeout':String(e.message||e)};}
}
async function inspect(site){
  const base={id:site.id,name:site.name,url:site.url,checkedAt:now,online:false,status:null,responseTimeMs:null,finalUrl:null,title:'',description:'',h1Count:0,firstH1:'',canonical:'',robotsMeta:'',schemaCount:0,sitemapUrls:null,checks:{title:false,description:false,h1:false,canonical:false,robots:false,sitemap:false,schema:false},issues:[]};
  try{
    const page=await fetchTimed(site.url);
    base.status=page.res.status;base.responseTimeMs=page.ms;base.finalUrl=page.res.url;base.online=page.res.ok;
    const html=(await page.res.text()).slice(0,1500000);
    base.title=textMatch(html,/<title[^>]*>([\s\S]*?)<\/title>/i);
    base.description=meta(html,'description');
    const h1s=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
    base.h1Count=h1s.length;base.firstH1=h1s[0]?h1s[0][1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim():'';
    base.canonical=linkRel(html,'canonical');
    base.robotsMeta=meta(html,'robots');
    base.schemaCount=(html.match(/application\/ld\+json/gi)||[]).length;
    const normalized=html.replace(/\s+/g,' ').trim();
    base.contentHash=crypto.createHash('sha256').update(normalized).digest('hex');
    const prev=previousById.get(site.id);
    base.changed=prev&&prev.contentHash?prev.contentHash!==base.contentHash:null;
    base.changedAt=base.changed===true?now:(prev&&prev.changedAt)||null;

    const origin=new URL(base.finalUrl||site.url).origin;
    const robots=await endpoint(origin+'/robots.txt');
    const sitemap=await endpoint(origin+'/sitemap.xml');
    base.robotsStatus=robots.status;base.sitemapStatus=sitemap.status;
    if(sitemap.ok){
      base.sitemapUrls=(sitemap.text.match(/<url>/gi)||[]).length;
      if(base.sitemapUrls===0)base.sitemapUrls=(sitemap.text.match(/<sitemap>/gi)||[]).length;
    }
    base.checks={title:Boolean(base.title),description:Boolean(base.description),h1:base.h1Count>0,canonical:Boolean(base.canonical),robots:robots.ok,sitemap:sitemap.ok,schema:base.schemaCount>0};
    if(!page.res.ok)base.issues.push({level:'danger',message:'Homepage respondeu HTTP '+page.res.status+'.'});
    if(!base.title)base.issues.push({level:'danger',message:'Title em falta na homepage.'});
    if(!base.description)base.issues.push({level:'warn',message:'Meta description em falta na homepage.'});
    if(!base.h1Count)base.issues.push({level:'warn',message:'Nenhum H1 detectado na homepage.'});
    if(!base.canonical)base.issues.push({level:'warn',message:'Canonical não detectado na homepage.'});
    if(!robots.ok)base.issues.push({level:'warn',message:'robots.txt não respondeu com sucesso.'});
    if(!sitemap.ok)base.issues.push({level:'warn',message:'sitemap.xml não respondeu com sucesso.'});
    if(!base.schemaCount)base.issues.push({level:'warn',message:'Nenhum bloco JSON-LD detectado na homepage.'});
    if(base.responseTimeMs>3000)base.issues.push({level:'warn',message:'Resposta do servidor acima de 3 segundos ('+base.responseTimeMs+' ms).'});
  }catch(e){
    base.error=e.name==='AbortError'?'timeout':String(e.message||e);
    base.issues.push({level:'danger',message:'Não foi possível carregar a homepage: '+base.error});
  }
  return base;
}
const results=[];
for(const site of sites)results.push(await inspect(site));
const output={generatedAt:now,source:'github-actions',sites:results};
await fs.writeFile(new URL('../data/live.json', import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
