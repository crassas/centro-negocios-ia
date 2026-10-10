#!/usr/bin/env node
// Review encoded frames at every named beat, plus a waveform. No source-frame substitute.
import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2),opt=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const video=path.resolve(opt('video',path.join(here,'out/travis-motion.mp4'))),timeline=JSON.parse(await fs.readFile(opt('timeline',path.join(here,'timeline.json')),'utf8'));
const dir=await fs.mkdtemp(path.join(path.dirname(video),'.travis-review-'));
const run=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args]);
try{
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',video],{encoding:'utf8'}));
 // Inspect a mid-morph and a settled frame per beat, including final face return.
 const times=timeline.beats.flatMap(b=>[Math.min(duration-.1,b.at+.45),Math.min(duration-.1,b.at+1.55)]);
 for(const [index,time] of times.entries())run(['-ss',String(time),'-i',video,'-frames:v','1','-vf','scale=270:-2','-update','1',path.join(dir,String(index).padStart(3,'0')+'.png')]);
 const sheet=video+'.sheet.jpg',wave=video+'.wave.png';
 run(['-framerate','1','-i',path.join(dir,'%03d.png'),'-vf',`tile=4x${Math.ceil(times.length/4)}:padding=8:margin=8:color=0x080604`,'-frames:v','1','-update','1',sheet]);
 run(['-i',video,'-filter_complex','[0:a]showwavespic=s=1200x180:colors=0xe7c99d','-frames:v','1','-update','1',wave]);
 await fs.writeFile(video+'.review.json',JSON.stringify({video,sheet,wave,frames:times.map((at,i)=>({beat:timeline.beats[Math.floor(i/2)].name,phase:i%2?'settled':'transition',at}))},null,2));
 console.log('Encoded review: '+sheet);
}finally{await fs.rm(dir,{recursive:true,force:true});}
