import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectWebAnswer} from '../travis-web-projection.mjs';
const original={tool:'web_open',reply:'Opening the requested website.',result:{action:'open_url',url:'https://www.google.com/'}};
const google=projectWebAnswer(original);
assert.equal(google.ui.kind,'web-search');
assert.equal(google.ui.title,'Google · pesquisa');
assert.equal(google.reply.includes('Travis'),true);
assert.equal(original.ui,undefined,'Mapping must not mutate the original receipt.');
const youtube=projectWebAnswer({tool:'open_youtube',result:{action:'open_url',url:'https://www.youtube.com/'}});
assert.equal(youtube.ui.kind,'youtube');
assert.equal(youtube.result.action,'youtube_open');
const untouched=projectWebAnswer({ui:{kind:'youtube',videoId:'dQw4w9WgXcQ'},tool:'play_youtube',result:{videoId:'dQw4w9WgXcQ'}});
assert.equal(untouched.ui.videoId,'dQw4w9WgXcQ');
const website=projectWebAnswer({tool:'web_open',result:{action:'open_url',url:'https://example.com/path'}});
assert.equal(website.ui.kind,'web-page');
assert.equal(website.ui.items[0].request,'Lê a página https://example.com/path');
const researched=projectWebAnswer({tool:'web_research',result:{query:'pesquisa',results:[
 {title:'First',url:'https://example.com/1',snippet:'Found result'},
 {title:'Invalid',url:'javascript:alert(1)',snippet:'Must not show'},
 {title:'Second',url:'https://example.com/2',snippet:'Another result'}
]}});
assert.equal(researched.ui.kind,'web-search');
assert.equal(researched.ui.items.length,2);
assert.equal(researched.ui.items[0].request,'Lê a página https://example.com/1');
const reading=projectWebAnswer({tool:'web_read',result:{url:'https://example.com/',title:'Source',answer:'Page content'}});
assert.equal(reading.ui.kind,'web-page');
assert.equal(reading.ui.items[0].detail,'Page content');
const html=fs.readFileSync('index.html','utf8'),scene=fs.readFileSync('travis-3d.mjs','utf8');
const sw=fs.readFileSync('sw.js','utf8'),app=fs.readFileSync('app.js','utf8');
assert(html.includes('travis-3d.mjs?v=matter-2'));
assert(scene.includes('projectWebAnswer(answer)'),'Every tool response must pass through the holographic mapper.');
assert(sw.includes('./travis-web-projection.mjs?v=agent-1'));
assert(!scene.includes('location.assign(url)'),'Travis must never auto-leave after opening a website');
assert(!app.includes("window.location.assign('https://www.youtube.com/')"));
console.log('PROJECTION_ROUTING_OK',JSON.stringify({google:google.ui.kind,youtube:youtube.ui.kind,web:website.ui.kind,
  found:researched.ui.items.length,reading:reading.ui.kind,stayInApp:true}));
