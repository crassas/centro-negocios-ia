const fs=require('node:fs');
const assert=require('node:assert/strict');
const puppeteer=require('/root/.centro-extensions/gods-eye-view/node_modules/puppeteer');
const output='/root/.centro-jarvis/coordination-stage/browser-proof.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/root/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome',headless:true,pipe:true,dumpio:true,
  args:['--no-zygote','--no-sandbox','--disable-dev-shm-usage','--disable-gpu-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-first-run','--disable-background-networking','--disable-renderer-backgrounding','--disable-background-timer-throttling','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();const errors=[],receipts=[],speeches=[];
 let result={};
 try{
  await page.setViewport({width:390,height:844,isMobile:true,deviceScaleFactor:1});
  await page.setRequestInterception(true);
  page.on('request',req=>{
   if(['/continuity','/resume'].some(p=>req.url().endsWith(p))&&req.method()==='POST'){
    const body=JSON.parse(req.postData());body.restorePersonal=false;
    req.continue({postData:JSON.stringify(body)});return;
   }
   if(req.url().endsWith('/interaction')&&req.method()==='POST'){
    const body=JSON.parse(req.postData());if(body.kind==='coordination')receipts.push(body);
   }
   if(req.url().endsWith('/speak')&&req.method()==='POST')speeches.push(JSON.parse(req.postData()));
   req.continue();
  });
  page.on('pageerror',e=>errors.push(String(e)));
  await page.evaluateOnNewDocument(()=>{
   window.__transcripts=[];window.__cameraResults=[];
   window.addEventListener('travis:transcript',e=>window.__transcripts.push(e.detail));
   window.addEventListener('travis:cctv-auto-result',e=>window.__cameraResults.push(e.detail));
  });
  await page.goto('http://127.0.0.1:8770/?coordination-e2e=1',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.TravisVisual&&window.TravisCctvAutopilot,{timeout:60000});
  console.log('BROWSER_READY');
  await page.click('#travis-launcher');
  await sleep(1200);
  await page.evaluate(()=>window.TravisVisual.ask('Show a random public camera'));
  await page.waitForFunction(()=>window.__cameraResults.length>0,{timeout:150000});
  console.log('CAMERA_RESULT',JSON.stringify(await page.evaluate(()=>window.__cameraResults.at(-1))));
  await page.waitForFunction(()=>window.TravisVisual.diagnostics().coordination.receipts>=3,{timeout:20000});
  await page.waitForFunction(()=>window.__transcripts.some(x=>x.role==='assistant'&&/still frame|playing video|could not verify|did not produce/i.test(x.text)),{timeout:60000});
  result=await page.evaluate(()=>({
   camera:window.TravisCctvPlayer.status(),diagnostics:window.TravisVisual.diagnostics(),
   results:window.__cameraResults,transcripts:window.__transcripts,
   image:{width:document.querySelector('#cctv-image')?.naturalWidth,visible:!document.querySelector('#cctv-image')?.hidden}
  }));
  assert.equal(result.results.at(-1).verified,true,'Random source must actually decode or play');
  assert.equal(result.diagnostics.preferredLanguage,'en');
  const sid=receipts.find(x=>x.action==='requested')?.session;
  result.session=sid;
  assert.ok(sid);
  await page.waitForFunction(()=>!window.TravisVisual.diagnostics().voiceBusy,{timeout:60000});
  await page.evaluate(()=>window.TravisVisual.ask('What am I looking at?'));
  await page.waitForFunction(()=>window.__transcripts.some(x=>x.role==='assistant'&&x.text.startsWith('You are viewing')),{timeout:45000});
  result.followup=await page.evaluate(()=>window.__transcripts.filter(x=>x.role==='assistant').at(-1));
  result.receipts=receipts;result.speeches=speeches;result.errors=errors;
  result.ok=true;
  await page.screenshot({path:'/root/.centro-jarvis/coordination-stage/browser-proof.png'});
  console.log('BROWSER_E2E_OK',JSON.stringify({sourceId:result.camera.sourceId,sourceName:result.camera.sourceName,imageWidth:result.image.width,followup:result.followup.text,receiptCount:receipts.length,errors}));
 }catch(error){result={...result,ok:false,error:String(error),errors,receipts,speeches};console.error(error);}
 finally{fs.writeFileSync(output,JSON.stringify(result,null,2));await browser.close();}
 if(!result.ok)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
