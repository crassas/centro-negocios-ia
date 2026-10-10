#!/usr/bin/env node
// claude-motion web-sim workflow adapted for the actual Travis renderer.
import fs from 'node:fs/promises';import http from 'node:http';import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';import {spawn,execFileSync} from 'node:child_process';import {once} from 'node:events';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const args=process.argv.slice(2),opt=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const out=path.resolve(opt('out',path.join(here,'out','travis-motion.mp4'))),timelinePath=path.resolve(opt('timeline',path.join(here,'timeline.json')));
const timeline=JSON.parse(await fs.readFile(timelinePath,'utf8'));
const fps=Number(opt('fps',timeline.fps||30)),width=Number(opt('width',540)),height=Number(opt('height',960));
if(!Number.isFinite(timeline.duration)||timeline.duration<=0||timeline.duration>120||!Array.isArray(timeline.beats)||!timeline.beats.length)throw new Error('Invalid timeline');
for(const [i,b] of timeline.beats.entries())if(!Number.isFinite(b.at)||b.at<0||b.at>=timeline.duration||i&&b.at<timeline.beats[i-1].at)throw new Error('Beat times must be ordered and within the timeline');
if(![12,24,25,30,60].includes(fps)||![width,height].every(n=>Number.isInteger(n)&&n>=240&&n<=1920&&n%2===0))throw new Error('Use 12/24/25/30/60 fps, even 240–1920 dimensions');
try{await fs.access(out);throw new Error('Output exists; choose a new --out file');}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(path.dirname(out),{recursive:true});
const work=await fs.mkdtemp(path.join(path.dirname(out),'.travis-render-'));
const three=path.resolve(process.env.TRAVIS_THREE_DIR||path.join(here,'node_modules/three'));
const {chromium}=process.env.TRAVIS_PLAYWRIGHT?await import(pathToFileURL(process.env.TRAVIS_PLAYWRIGHT)):await import('playwright');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),third=url.pathname.startsWith('/_three/'),base=third?three:root;
 const file=path.resolve(base,'.'+(third?url.pathname.slice(7):url.pathname));
 if(!file.startsWith(base+path.sep)){res.writeHead(403);return res.end();}
 let body=await fs.readFile(file);if(file.endsWith('studio.html'))body=Buffer.from(body.toString().replaceAll('https://cdn.jsdelivr.net/npm/three@0.180.0/','/_three/'));
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,encoder;
try{
 browser=await chromium.launch({executablePath:process.env.TRAVIS_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text());});
 await page.route('https://**',route=>route.abort());await page.addInitScript(t=>window.__TRAVIS_TIMELINE=t,timeline);
 await page.goto(`http://127.0.0.1:${server.address().port}/tools/travis-motion/studio.html?capture`);
 await page.waitForFunction(()=>window.TRAVIS_MOTION?.ready,{},{timeout:60000});await page.evaluate(()=>document.fonts.ready);
 // Nonsequential seeks must produce identical pixels. This checks state leakage.
 const probe=Math.min(18,timeline.duration-.5);await page.evaluate(t=>TRAVIS_MOTION.render(t),probe);const first=await page.screenshot();
 await page.evaluate(()=>TRAVIS_MOTION.render(.2));await page.evaluate(t=>TRAVIS_MOTION.render(t),probe);const second=await page.screenshot();
 if(!first.equals(second))throw new Error('Non-deterministic render after backward seek');
 await page.evaluate(()=>TRAVIS_MOTION.render(0));
 const raw=path.join(work,'silent.mp4');encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',raw],{stdio:['pipe','ignore','pipe']});
 let stderr='';encoder.stderr.on('data',b=>stderr+=b);encoder.stdin.on('error',()=>{});const completion=once(encoder,'close');
 const frames=Math.ceil(timeline.duration*fps);
 for(let frame=0;frame<frames;frame++){
  await page.evaluate(t=>TRAVIS_MOTION.render(t),frame/fps);
  const bytes=await page.screenshot({type:'jpeg',quality:92});
  await new Promise((resolve,reject)=>encoder.stdin.write(bytes,e=>e?reject(e):resolve()));
  if(frame%(fps*4)===0)console.log(`Captured ${frame}/${frames}`);
 }
 encoder.stdin.end();const [code]=await completion;if(code!==0)throw new Error('ffmpeg: '+stderr);
 if(errors.length)throw new Error(errors.join('\n'));
 const wav=path.join(work,'cues.wav');execFileSync('python3',[path.join(here,'sounds.py'),timelinePath,wav],{stdio:'inherit'});
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',raw,'-i',wav,'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',out]);
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',out],{encoding:'utf8'}));
 const video=info.streams.find(x=>x.codec_type==='video');if(Number(video.nb_frames)!==frames)throw new Error('Encoded frame count mismatch');
 await fs.writeFile(out+'.json',JSON.stringify({width,height,fps,frames,duration:Number(info.format.duration),deterministicSeek:true,timeline,errors},null,2));
 execFileSync(process.execPath,[path.join(here,'review.mjs'),'--video',out,'--timeline',timelinePath],{stdio:'inherit'});
 console.log(JSON.stringify({ok:true,out,frames,fps,review:out+'.sheet.jpg'}));
}finally{if(encoder&&encoder.exitCode===null)encoder.kill('SIGTERM');await browser?.close();await new Promise(resolve=>server.close(resolve));await fs.rm(work,{recursive:true,force:true});}
