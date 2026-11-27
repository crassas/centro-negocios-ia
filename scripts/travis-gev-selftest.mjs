import test from 'node:test';
import assert from 'node:assert/strict';
import {GEO_LAYERS,GEO_PLACES,interpretGeoRequest} from '../travis-gev-intents.mjs';

test('17 keyless categories are represented with stable GEV layer IDs',()=>{
  assert.equal(GEO_LAYERS.length+1,17); // 16 toggleable groups + map stack
  const keys=new Set(GEO_LAYERS.map(layer=>layer.key));
  assert.equal(keys.size,16);
  assert.ok(GEO_LAYERS.find(g=>g.key==='weather').ids.includes('weather-radar'));
  assert.equal(GEO_PLACES.porto.lon,-8.6109);
});
test('Portuguese, English, show/hide and exit commands route explicitly',()=>{
  const pt=interpretGeoRequest('Travis mostra os aviões no Porto');
  assert.equal(pt.type,'layers');
  assert.ok(pt.layers.includes('flights'));
  assert.equal(pt.place,'porto');
  assert.equal(pt.language,'pt');
  const en=interpretGeoRequest('Show satellites over New York');
  assert.equal(en.type,'layers');
  assert.ok(en.layers.includes('satellites'));
  assert.equal(en.place,'nyc');
  assert.equal(en.language,'en');
  const remove=interpretGeoRequest('Desliga os satélites',{active:true});
  assert.equal(remove.type,'layers');
  assert.equal(remove.enable,false);
  assert.equal(interpretGeoRequest('Voltar ao Travis',{active:true}).type,'close');
  assert.equal(interpretGeoRequest('Qual a capital de Espanha?'),null);
});
test('The native fallback is not required for commands unrelated to geography',()=>{
  assert.equal(interpretGeoRequest('Envia mensagem à engomadoria'),null);
  assert.equal(interpretGeoRequest('Mostra o nosso CRM'),null);
});

test('Official frame bridge opens, sends real GEV views and unloads on return', async()=>{
  const registry=new Map();
  const listeners=new Map();
  const sent=[];
  let nativeOpens=0,nativeCloses=0;
  class El {
    constructor(tag='div',id=null){
      this.tagName=tag;this.id=id;this.dataset={};this.hidden=false;
      this.attributes=new Map();this.children=[];this.events=new Map();
      this.textContent='';this.src='';this.firstChild=null;
      if(id)registry.set(id,this);
    }
    set innerHTML(markup){
      this._html=markup;
      for(const match of markup.matchAll(/\bid="([^"]+)"/g))
        if(!registry.has(match[1]))new El('div',match[1]);
      const frame=registry.get('travis-gev-frame');
      if(frame&&!frame.contentWindow){
        frame.contentWindow={postMessage:(message,origin)=>sent.push({message,origin})};
      }
    }
    get innerHTML(){return this._html||'';}
    setAttribute(key,value){this.attributes.set(key,String(value));}
    getAttribute(key){return this.attributes.get(key)||null;}
    addEventListener(type,fn){const rows=this.events.get(type)||[];rows.push(fn);this.events.set(type,rows);}
    querySelector(sel){return sel.startsWith('#')?registry.get(sel.slice(1))||null:null;}
    querySelectorAll(sel){
      if(sel==='[data-gev-layer]')return registry.get('travis-gev-grid')?.children.filter(e=>e.dataset.gevLayer)||[];
      if(sel==='[data-gev-place]')return [];
      return [];
    }
    appendChild(el){this.children.push(el);return el;}
    insertBefore(el){this.children.push(el);registry.set(el.id,el);return el;}
    replaceChildren(...nodes){this.children=nodes;this.textContent=nodes.map(n=>n.text||'').join('');}
  }
  const hud=new El('section','travis-hud');
  hud.setAttribute('aria-hidden','false');
  const toggle=new El('button','travis-world-toggle');
  const document={
    getElementById:id=>registry.get(id)||null,
    createElement:tag=>new El(tag),
    createTextNode:text=>({text}),
    addEventListener(){}
  };
  const original=Object.freeze({
    open(){nativeOpens++;},
    close(){nativeCloses++;},
    status(){return {ready:true,engine:'native'};},
    locations:['earth','porto','nyc'],
    refresh(){},
    layer(){},
    routeCommand(){return {handled:false};}
  });
  const win={
    TravisWorld:original,TravisVisual:{open(){}},addEventListener(name,fn){
      const rows=listeners.get(name)||[];rows.push(fn);listeners.set(name,rows);
    },dispatchEvent(event){
      for(const fn of listeners.get(event.type)||[])fn(event);
    }
  };
  Object.assign(globalThis,{
    window:win,document,location:{hostname:'127.0.0.1',port:'8770'}
  });
  // Dynamic import after DOM and global stubs exist.
  const file=new URL('../travis-gev-bridge.mjs?selftest=20261010',import.meta.url);
  await import(file.href);
  assert.equal(typeof win.TravisGevBridge?.open,'function');
  assert.equal(win.TravisWorld.status().engine,'gods-eye-official');
  assert.equal(win.TravisGevBridge.open('porto'),true);
  assert.equal(hud.dataset.worldEngine,'official');
  assert.ok(registry.get('travis-gev-frame').src.includes('127.0.0.1:4173/?embed=1'));
  const frame=registry.get('travis-gev-frame');
  const message=(data,origin='http://127.0.0.1:4173')=>{
    win.dispatchEvent({type:'message',source:frame.contentWindow,origin,data});
  };
  message({type:'gev:ready'},'http://malicious.example');
  assert.equal(sent.length,0,'foreign origins cannot drive the bridge');
  message({type:'gev:ready'});
  assert.equal(sent.length,1);
  assert.equal(sent[0].message.type,'gev:view');
  assert.equal(sent[0].message.view.camera.lat,GEO_PLACES.porto.lat);
  assert.ok(sent[0].message.view.layers.includes('earthquakes'));
  message({type:'gev:view-applied',id:sent[0].message.id,ok:true,steps:[]});
  const command=win.TravisWorld.routeCommand('Show satellites over New York');
  assert.equal(command.handled,true);
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.ok(sent.some(item=>item.message.view.layers.includes('satellites')));
  assert.ok(sent.some(item=>item.message.view.camera.lat===GEO_PLACES.nyc.lat));
  win.TravisGevBridge.close();
  assert.equal(frame.src,'about:blank');
  assert.equal(hud.dataset.worldEngine,'none');
  assert.equal(nativeOpens,0,'successful official connection must not force native fallback');
  assert.equal(nativeCloses,1,'close allows native cleanup');
});
