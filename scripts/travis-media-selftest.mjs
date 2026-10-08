import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const events=new Map(),notices=[],instances=[];
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.isConnected=true;}
  append(...children){this.children.push(...children);}
  setAttribute(name,value){this[name]=value;}
  addEventListener(){}
}
class Player {
  constructor(slot,options){this.slot=slot;this.events=options.events;this.calls=[];instances.push(this);}
  getPlayerState(){return 0;}
  setVolume(v){this.volume=v;}
  playVideo(){this.calls.push('play');}
  pauseVideo(){this.calls.push('pause');}
  destroy(){this.calls.push('destroy');}
}
const context=vm.createContext({console,URLSearchParams,setTimeout,clearTimeout,
  location:{origin:'http://127.0.0.1:8770'},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  document:{createElement:tag=>new Element(tag)},
  window:{YT:{Player},addEventListener:(name,fn)=>events.set(name,fn),dispatchEvent:event=>notices.push(event)}
});
const source=fs.readFileSync(new URL('../travis-youtube.mjs',import.meta.url),'utf8').replaceAll('export function','function');
vm.runInContext(source+'\nglobalThis.media={mountYouTube,closeYouTube,controlYouTube,youtubeState};',context);
const media=context.media,container=new Element('main');
media.mountYouTube({videoId:'M7lc1UVf-VE',items:[]},container);
media.controlYouTube('pause_youtube');
await Promise.resolve();
const first=instances[0];
assert.equal(first.slot.tag,'iframe');
assert(first.slot.allow.includes('autoplay'));
assert.equal(new URL(first.slot.src).searchParams.get('origin'),'http://127.0.0.1:8770');
first.events.onReady({target:first});
assert.deepEqual(first.calls,['pause'],'A pause spoken during loading survives onReady');
media.controlYouTube('resume_youtube');
assert.deepEqual(first.calls,['pause','play']);
first.events.onStateChange({data:1});assert.equal(media.youtubeState().playing,true);
events.get('travis:state')({detail:{state:'speaking'}});assert.equal(first.volume,8);
events.get('travis:state')({detail:{state:'listening'}});assert.equal(first.volume,38);
first.events.onError({data:150});assert.equal(media.youtubeState().error,'150');
assert.equal(notices.at(-1).type,'travis:media-notice','Player failures must reach the voice interface');
media.closeYouTube();
first.events.onReady({target:first});first.events.onStateChange({data:1});
assert.equal(media.youtubeState().open,false);assert.equal(media.youtubeState().playing,false);
media.mountYouTube({videoId:'dQw4w9WgXcQ'},new Element('main'));
media.closeYouTube();await Promise.resolve();
assert.equal(instances.length,1,'A closed projection cannot be resurrected by delayed API loading');
console.log('MEDIA_OK: embedded identity, controls during loading, voice notices, ducking, close races');
