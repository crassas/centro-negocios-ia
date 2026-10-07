#!/usr/bin/env node
import readline from 'node:readline';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('/root/.centro-browser/node_modules/playwright');

let browser=null,context=null,page=null;
const selector='a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]';

function safeUrl(value){
  const u=new URL(String(value));
  if(!['http:','https:'].includes(u.protocol))throw Error('Só são permitidos URLs HTTP/HTTPS');
  const h=u.hostname.toLowerCase();
  if(h==='localhost'||h==='127.0.0.1'||h==='::1'||h.endsWith('.local'))throw Error('Destino local recusado');
  return u.href;
}
async function ensure(){
  if(browser?.isConnected()&&page&&!page.isClosed())return;
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  context=await browser.newContext({viewport:{width:1280,height:800},locale:'pt-PT',userAgent:'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 Chrome/156 Safari/537.36'});
  page=await context.newPage();
  page.setDefaultTimeout(8000);
}
async function snapshot(){
  await ensure();
  const title=await page.title().catch(()=> '');
  const url=page.url();
  const text=String(await page.locator('body').innerText({timeout:5000}).catch(()=> '')).replace(/\s+/g,' ').trim().slice(0,9000);
  const loc=page.locator(selector);const count=Math.min(await loc.count(),100);const elements=[];
  for(let i=0;i<count;i++){
    const el=loc.nth(i);
    if(!await el.isVisible().catch(()=>false))continue;
    const row=await el.evaluate((node,index)=>{
      const tag=node.tagName.toLowerCase();
      const label=node.getAttribute('aria-label')||'';
      const placeholder=node.getAttribute('placeholder')||'';
      const type=node.getAttribute('type')||'';
      const role=node.getAttribute('role')||'';
      const href=node.href||'';
      const value=('value' in node&&['input','textarea','select'].includes(tag))?String(node.value||''):'';
      const text=(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim();
      return {index,tag,role,type,text:text.slice(0,180),label:label.slice(0,160),placeholder:placeholder.slice(0,160),href:href.slice(0,500),value:value.slice(0,120)};
    },i).catch(()=>null);
    if(row)elements.push(row);
  }
  return {ok:true,title,url,text,elements};
}
async function act(cmd){
  await ensure();
  const action=String(cmd.action||'');
  if(action==='health')return {ok:true,browser:true,url:page.url()};
  if(action==='goto'){
    const url=safeUrl(cmd.url);await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});return snapshot();
  }
  if(action==='snapshot')return snapshot();
  if(action==='back'){await page.goBack({waitUntil:'domcontentloaded',timeout:10000}).catch(()=>{});return snapshot();}
  if(action==='wait'){await page.waitForTimeout(Math.max(0,Math.min(Number(cmd.ms)||800,5000)));return snapshot();}
  const index=Number(cmd.index);
  if(!Number.isInteger(index)||index<0||index>200)throw Error('Índice de elemento inválido');
  const el=page.locator(selector).nth(index);
  if(action==='click'){
    const meta=await el.evaluate(n=>({type:n.getAttribute('type')||'',text:(n.innerText||n.textContent||n.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim().slice(0,180)}));
    const risky=/\b(pay|buy|purchase|checkout|place order|delete|remove account|send money|transfer|publish|confirm purchase)\b/i.test(meta.text);
    if(risky&&!cmd.confirmed) return {ok:false,requiresConfirmation:true,reason:'Acção potencialmente irreversível',element:meta,...await snapshot()};
    await el.click();await page.waitForLoadState('domcontentloaded',{timeout:5000}).catch(()=>{});return snapshot();
  }
  if(action==='fill'){
    const type=(await el.getAttribute('type').catch(()=>''))||'';
    if(type.toLowerCase()==='password')throw Error('Preenchimento automático de password recusado');
    await el.fill(String(cmd.value||'').slice(0,4000));return snapshot();
  }
  if(action==='press'){await el.press(String(cmd.key||'Enter').slice(0,30));await page.waitForLoadState('domcontentloaded',{timeout:5000}).catch(()=>{});return snapshot();}
  if(action==='select'){await el.selectOption(String(cmd.value||'').slice(0,500));return snapshot();}
  throw Error('Acção de browser desconhecida');
}
async function shutdown(){
 try{await context?.close();}catch{}
 try{await browser?.close();}catch{}
 browser=context=page=null;
}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
console.log('TRAVIS_BROWSER:'+JSON.stringify({ready:true}),);
for await(const line of rl){
 let out;
 try{out=await act(JSON.parse(line));}
 catch(error){out={ok:false,error:String(error?.message||error).slice(0,500)}}
 console.log('TRAVIS_BROWSER:'+JSON.stringify(out));
}
await shutdown();
