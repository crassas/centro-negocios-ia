// Convert local host-tool receipts into safe, in-app holographic views.
// A projection is not a copy of Google's website and never auto-navigates.
const normaliseUrl=value=>{
  if(typeof value!=='string'||value.length>2048)return null;
  try{
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
    return url;
  }catch{return null;}
};
const isGoogleSearch=url=>/^(?:www\.)?google\.[a-z.]+$/i.test(url.hostname)&&
  (url.pathname==='/'||url.pathname==='/search');
const isYouTubeHome=url=>/^(?:(?:www|m)\.)?youtube\.com$/i.test(url.hostname)&&
  (url.pathname==='/'||url.pathname==='/feed/trending');
const shortHost=url=>url.hostname.replace(/^www\./,'');
const clipped=(value,max)=>String(value??'').slice(0,max);

export function projectWebAnswer(answer){
  if(!answer||typeof answer!=='object')return answer;
  // Existing YouTube UI already contains real, actionable video identifiers.
  if(answer.ui?.kind==='youtube')return answer;
  const result=answer.result;
  if(result?.action==='open_url'){
    const url=normaliseUrl(result.url);
    if(!url)return answer;
    if(isYouTubeHome(url)){
      return {...answer,ui:{kind:'youtube',title:'YouTube',query:'',items:[]},
        result:{action:'youtube_open'}};
    }
    if(isGoogleSearch(url)){
      return {...answer,
        reply:'Search is ready inside Travis. What would you like me to find?',
        ui:{kind:'web-search',title:'Google · pesquisa',query:url.searchParams.get('q')||'',items:[],
          source:'Pesquisa através do Travis, não da página oficial do Google.'}};
    }
    return {...answer,
      reply:'I have prepared this website inside Travis. I can read it without leaving our conversation.',
      ui:{kind:'web-page',title:shortHost(url),url:url.href,items:[
        {title:'Ler e resumir este site',detail:'Consultar o conteúdo público no Travis.',request:'Lê a página '+url.href}
      ]}};
  }
  if(['web_research','web_search'].includes(answer.tool) && result && Array.isArray(result.results)){
    const rows=result.results.slice(0,12).flatMap(row=>{
      const url=normaliseUrl(row?.url);if(!url)return [];
      return [{title:clipped(row.title||shortHost(url),160),
        detail:clipped(row.snippet||shortHost(url),700),
        domain:shortHost(url),url:url.href,request:'Lê a página '+url.href}];
    });
    return {...answer,ui:{kind:'web-search',title:'Pesquisa web',
      query:clipped(result.query||'',240),source:'Resultados de pesquisa web; não são resultados oficiais do Google.',
      items:rows}};
  }
  if(answer.tool==='web_read' && typeof result?.answer==='string'){
    const url=normaliseUrl(result.url);
    const rows=[{title:'Síntese da página',detail:clipped(result.answer,2600)}];
    if(url)rows.push({title:'Origem',detail:url.href});
    return {...answer,ui:{kind:'web-page',title:clipped(result.title||url?.hostname||'Leitura web',130),
      url:url?.href||'',items:rows}};
  }
  return answer;
}
