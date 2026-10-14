// Full-page Travis hologram browser smoke test (mobile viewport).
// Uses the exact deployed GLB, glTF material and application shaders, not a mocked face.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';

const [playwrightDir,chromePath,threeDir,out] = process.argv.slice(2);
if(!playwrightDir||!chromePath||!threeDir||!out)
  throw new Error('usage: node scripts/travis-mj3d-browser-smoke.mjs <playwrightDir> <chromium> <threeDir> <output>');
const {chromium}=await import(pathToFileURL(path.resolve(playwrightDir,'index.mjs')).href);
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}));return;}
  if(req.method!=='GET'){
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false}));return;
  }
  const file=name.startsWith('/_three/')?path.join(threeDir,name.slice(8)):path.join(repo,name==='/'?'index.html':name);
  try{
    let data=await fs.readFile(file);
    if(file.endsWith('.html')){
      data=Buffer.from(data.toString().replaceAll(
        'https://cdn.jsdelivr.net/npm/three@0.180.0/','/_three/'));
    }
    res.setHeader('Content-Type',file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':
      file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');
    res.end(data);
  }catch(e){res.writeHead(404);res.end(e.message);}
});
await new Promise(resolve=>server.listen(8770,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:chromePath,headless:true,args:[
  '--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
  '--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required'
]});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1.5,
    serviceWorkers:'block',permissions:[]});
  const errors=[],logs=[],failed=[];
  page.on('pageerror',err=>errors.push('PAGE ERROR: '+err.message));
  page.on('console',m=>{
    const t=m.text();
    if(m.type()==='error'||/(Travis 3D|bust loaded|GLTF|WebGLProgram|shader|MJ3D)/i.test(t))
      logs.push(m.type()+': '+t.slice(0,2200));
  });
  page.on('requestfailed',r=>{
    if(!/tesseract|analytics/i.test(r.url()))failed.push(r.url()+' '+r.failure()?.errorText);
  });
  await page.route('https://**',route=>route.abort());
  await page.goto('http://127.0.0.1:8770/?travis=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.TravisVisual),{},{timeout:20000});
  await page.waitForTimeout(10000);
  const result=await page.evaluate(()=>{
    const diag=window.TravisVisual.diagnostics();
    const canvas=document.querySelector('#travis-three-canvas');
    const c=canvas?.getBoundingClientRect();
    return {ready:diag.ready,opened:diag.opened,faceAsset:diag.faceAsset,
      form:diag.form,frames:diag.renderedFrames,avatar:diag.avatar,
      canvas:canvas?{width:canvas.width,height:canvas.height,rect:c?.toJSON(),
        hidden:getComputedStyle(canvas).display==='none'}:null,
      state:diag.state};
  });
  await page.screenshot({path:path.join(out,'travis-mj3d-browser-smoke.png')});
  const report={result,logs,errors,failed};
  await fs.writeFile(path.join(out,'travis-mj3d-browser-smoke.json'),JSON.stringify(report,null,2));
  console.log('TRAVIS_MJ3D_BROWSER_REPORT',JSON.stringify(report));
  assert.equal(result.ready,true,'3D scene init failed (see logged JS errors)');
  assert.equal(result.faceAsset,'mj-3d','MJ3D asset failed during Blender GLB integration');
  assert.equal(result.avatar.visible,true,'3D hologram faceRoot invisible');
  assert(result.frames>15,'WebGL frame loop not rendering');
  assert(!logs.some(x=>/WebGLProgram.*Shader Error|Shader Error.*VALIDATE_STATUS|shader.*compile failed/i.test(x)),
    'Holographic GPU shader compilation failed');
  console.log('TRAVIS_MJ3D_BROWSER_SMOKE=PASS');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
