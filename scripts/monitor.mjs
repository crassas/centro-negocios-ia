import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const sites=JSON.parse(await fs.readFile(new URL('../data/sites.json',import.meta.url),'utf8'));
let previous={sites:[]};
try{previous=JSON.parse(await fs.readFile(new URL('../data/live.json',import.meta.url),'utf8'));}catch{}
const previousById=new Map((previous.sites||[]).map(x=>[x.id,x]));
const now=new Date().toISOString();

function cleanText(value=''){return value.replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();}
function textMatch(html,re){const m=html.match(re);return m?cleanText(m[1]):'';}
function meta(html,name){
  const escaped=name.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
  const patterns=[
    new RegExp('<meta[^>]+(?:name|property)=["\\\']'+escaped+'["\\\'][^>]+content=["\\\']([^"\\\']*)["\\\'][^>]*>','i'),
    new RegExp('<meta[^>]+content=["\\\']([^"\\\']*)["\\\'][^>]+(?:name|property)=["\\\']'+escaped+'["\\\'][^>]*>','i')
  ];
  for(const re of patterns){const m=html.match(re);if(m)return cleanText(m[1]);}
  return '';
}
function linkRel(html,rel){
  const patterns=[
    new RegExp('<link[^>]+rel=["\\\'][^"\\\']*\\b'+rel+'\\b[^"\\\']*["\\\'][^>]+href=["\\\']([^"\\\']+)["\\\'][^>]*>','i'),
    new RegExp('<link[^>]+href=["\\\']([^"\\\']+)["\\\'][^>]+rel=["\\\'][^"\\\']*\\b'+rel+'\\b[^"\\\']*["\\\'][^>]*>','i')
  ];
  for(const re of patterns){const m=html.match(re);if(m)return m[1].trim();}
  return '';
}
function extract(html){
  const h1s=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  return {
    title:textMatch(html,/<title[^>]*>([\s\S]*?)<\/title>/i),
    description:meta(html,'description'),
    h1Count:h1s.length,
    firstH1:h1s[0]?cleanText(h1s[0][1]):'',
    canonical:linkRel(html,'canonical'),
    robotsMeta:meta(html,'robots'),
    schemaCount:(html.match(/application\/ld\+json/gi)||[]).length
  };
}
async function fetchTimed(url,extraHeaders={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);const start=Date.now();
  try{
    const res=await fetch(url,{redirect:'follow',signal:controller.signal,cache:'no-store',headers:{'user-agent':'Mozilla/5.0 (compatible; CentroNegocios-Monitor/2.0; +https://github.com/crassas/centro-negocios-ia)','accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','cache-control':'no-cache','pragma':'no-cache',...extraHeaders}});
    return {res,ms:Date.now()-start};
  }finally{clearTimeout(timer);}
}
async function pageSnapshot(url){
  const first=await fetchTimed(url);let html=(await first.res.text()).slice(0,2000000);let extracted=extract(html);let responseTimeMs=first.ms;let finalUrl=first.res.url;let status=first.res.status;let ok=first.res.ok;
  if(first.res.ok&&(!extracted.title||extracted.h1Count===0)){
    await new Promise(r=>setTimeout(r,900));
    const separator=url.includes('?')?'&':'?';
    const second=await fetchTimed(url+separator+'__centro_audit='+Date.now());const html2=(await second.res.text()).slice(0,2000000);const extracted2=extract(html2);
    if((extracted2.h1Count>extracted.h1Count)||(!extracted.title&&extracted2.title)){html=html2;extracted=extracted2;responseTimeMs=second.ms;finalUrl=second.res.url;status=second.res.status;ok=second.res.ok;}
  }
  return {html,extracted,responseTimeMs,finalUrl,status,ok};
}
async function endpoint(url){try{const x=await fetchTimed(url,{accept:'application/xml,text/plain,text/html,*/*'});return {ok:x.res.ok,status:x.res.status,text:x.res.ok?await x.res.text():''};}catch(e){return {ok:false,status:null,text:'',error:e.name==='AbortError'?'timeout':String(e.message||e)};}}
function sameCanonical(canonical,finalUrl){try{const a=new URL(canonical,finalUrl);const b=new URL(finalUrl);return a.origin===b.origin;}catch{return false;}}
async function inspect(site){
  const base={id:site.id,name:site.name,url:site.url,area:site.area||'',checkedAt:now,online:false,status:null,responseTimeMs:null,finalUrl:null,title:'',description:'',h1Count:0,firstH1:'',canonical:'',robotsMeta:'',schemaCount:0,sitemapUrls:null,checks:{title:false,description:false,h1:false,canonical:false,robots:false,sitemap:false,schema:false},issues:[]};
  try{
    const snap=await pageSnapshot(site.url);base.status=snap.status;base.responseTimeMs=snap.responseTimeMs;base.finalUrl=snap.finalUrl;base.online=snap.ok;Object.assign(base,snap.extracted);
    const normalized=snap.html.replace(/\s+/g,' ').trim();base.contentHash=crypto.createHash('sha256').update(normalized).digest('hex');const prev=previousById.get(site.id);base.changed=prev&&prev.contentHash?prev.contentHash!==base.contentHash:null;base.changedAt=base.changed===true?now:(prev&&prev.changedAt)||null;
    const origin=new URL(base.finalUrl||site.url).origin;const [robots,sitemap]=await Promise.all([endpoint(origin+'/robots.txt'),endpoint(origin+'/sitemap.xml')]);base.robotsStatus=robots.status;base.sitemapStatus=sitemap.status;
    if(sitemap.ok){base.sitemapUrls=(sitemap.text.match(/<url>/gi)||[]).length;if(base.sitemapUrls===0)base.sitemapUrls=(sitemap.text.match(/<sitemap>/gi)||[]).length;}
    base.checks={title:Boolean(base.title),description:Boolean(base.description),h1:base.h1Count===1,canonical:Boolean(base.canonical)&&sameCanonical(base.canonical,base.finalUrl||site.url),robots:robots.ok,sitemap:sitemap.ok,schema:base.schemaCount>0};
    if(!base.online)base.issues.push({level:'danger',message:'Homepage respondeu HTTP '+base.status+'.'});
    if(!base.title)base.issues.push({level:'danger',message:'Title em falta na homepage.'});
    if(!base.description)base.issues.push({level:'warn',message:'Meta description em falta na homepage.'});
    if(base.h1Count===0)base.issues.push({level:'warn',message:'Nenhum H1 detectado após duas leituras.'});
    if(base.h1Count>1)base.issues.push({level:'warn',message:base.h1Count+' H1 detectados na homepage.'});
    if(!base.canonical)base.issues.push({level:'warn',message:'Canonical em falta na homepage.'});
    else if(!sameCanonical(base.canonical,base.finalUrl||site.url))base.issues.push({level:'warn',message:'Canonical aponta para outro domínio.'});
    if(/noindex/i.test(base.robotsMeta))base.issues.push({level:'danger',message:'Meta robots contém noindex.'});
    if(!robots.ok)base.issues.push({level:'warn',message:'robots.txt não respondeu com sucesso.'});
    if(!sitemap.ok)base.issues.push({level:'warn',message:'sitemap.xml não respondeu com sucesso.'});
    if(!base.schemaCount)base.issues.push({level:'warn',message:'JSON-LD não detectado na homepage.'});
    if(base.responseTimeMs>3000)base.issues.push({level:'warn',message:'Resposta do servidor acima de 3 s ('+base.responseTimeMs+' ms).'});
  }catch(e){base.error=e.name==='AbortError'?'timeout':String(e.message||e);base.issues.push({level:'danger',message:'Falha ao carregar a homepage: '+base.error});}
  return base;
}

const results=[];for(const site of sites)results.push(await inspect(site));
const output={generatedAt:now,source:'github-actions',intervalMinutes:15,sites:results};
await fs.writeFile(new URL('../data/live.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));