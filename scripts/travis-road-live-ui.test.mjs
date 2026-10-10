import test from 'node:test';
import assert from 'node:assert/strict';

test("God's Eye road panel renders measured sources and annotates ONLY verified points",async()=>{
  const nodes=new Map(),calls={fetch:[],annotations:[],navigate:[],cameraClose:0};
  class FakeNode{
    constructor(tag='div',id=''){
      this.tagName=tag;this.id=id;this.hidden=false;this.children=[];this.dataset={};
      this.attributes=new Map();this.textContent='';this.href='';this.events={};
      if(id)nodes.set(id,this);
    }
    set innerHTML(value){
      this.html=value;
      for(const match of value.matchAll(/\bid="([^"]+)"/g))new FakeNode('div',match[1]);
      this.areaButtons=[...value.matchAll(/data-road-area="([^"]+)"/g)].map(x=>{
        const b=new FakeNode('button');b.dataset.roadArea=x[1];return b;
      });
    }
    querySelector(selector){
      return selector.startsWith('#')?nodes.get(selector.slice(1))||null:null;
    }
    querySelectorAll(selector){return selector==='[data-road-area]'?this.areaButtons||[]:[];}
    appendChild(child){this.children.push(child);return child;}
    append(...args){args.forEach(x=>this.appendChild(x));}
    replaceChildren(...args){this.children=args;}
    setAttribute(k,v){this.attributes.set(k,String(v));}
    removeAttribute(k){this.attributes.delete(k);}
  }
  const hud=new FakeNode('section','travis-hud');
  hud.getAttribute=()=> 'false';
  const toolbar=new FakeNode('nav');
  const document={
    hidden:false,
    getElementById:id=>nodes.get(id)||null,
    createElement:tag=>new FakeNode(tag),
    querySelector:selector=>selector==='#travis-gev-official .travis-gev-toolbar'?toolbar:null,
    addEventListener(){}
  };
  const window={
    dispatchEvent(){},addEventListener(){},
    TravisGevBridge:{
      status(){return {open:true,place:'london'};},
      navigate(place,coords){calls.navigate.push({place,coords});},
      setExternalAnnotations(rows){calls.annotations.push(rows);return rows.length;}
    },
    TravisCctvPlayer:{close(){calls.cameraClose++}}
  };
  const originalFetch=globalThis.fetch;
  Object.assign(globalThis,{window,document,location:{hostname:'127.0.0.1',port:'8770'},
    CustomEvent:class{constructor(type,props){this.type=type;this.detail=props?.detail;}},
    fetch:async(url)=>{
      calls.fetch.push(String(url));
      return new Response(JSON.stringify({
        schema:'travis-public-road-observations/v1',
        state:'current',area:'london',source:'Transport for London',
        sourceUrl:'https://api.tfl.gov.uk/',fetchedAt:new Date().toISOString(),
        count:1,items:[{type:'incident',provider:'TfL',
          id:'tfl-1',label:'London roadworks',detail:'Lane closure',
          observedAt:new Date().toISOString(),lat:51.5,lon:-.12}]
      }),{status:200,headers:{'Content-Type':'application/json'}});
    }});
  try{
    await import('../travis-road-live.mjs?selftest=20261010');
    assert.equal(typeof window.TravisRoadLive?.show,'function');
    assert.equal(nodes.get('travis-road-toggle').id,'travis-road-toggle');
    const result=window.TravisRoadLive.routeCommand('Travis, mostra trânsito real em Londres');
    assert.equal(result.handled,true);
    assert.match(result.reply,/Vou consultar/i);
    await new Promise(r=>setTimeout(r,50));
    assert.equal(window.TravisRoadLive.status().state,'current');
    assert.equal(nodes.get('travis-road-live').hidden,false);
    assert.ok(calls.fetch[0].includes('/api/road-live/london'));
    assert.equal(calls.annotations.at(-1)[0].latitude,51.5);
    assert.equal(nodes.get('travis-road-list').children.length,1);
    const prev=calls.fetch.length;
    const unsupported=window.TravisRoadLive.routeCommand('Travis mostra trânsito real em Porto');
    assert.equal(unsupported.handled,true);
    assert.match(unsupported.reply,/não tenho medições/i);
    assert.equal(calls.fetch.length,prev);
    assert.equal(window.TravisRoadLive.routeCommand('Travis mostra trânsito simulado').handled,false);
    window.TravisRoadLive.close();
    assert.deepEqual(calls.annotations.at(-1),[]);
  }finally{globalThis.fetch=originalFetch;}
});