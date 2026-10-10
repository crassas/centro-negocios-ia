import test from 'node:test';
import assert from 'node:assert/strict';

test('Public CCTV autopilot chooses verified authorised source without manual selection',async()=>{
  let lastId='',lastKind='snapshot';
  const opened=[],focussed=[],layers=[];
  const available=[
    {id:'london-public-1',name:'Street Junction',city:'London',pack:'tfl',
      lat:51.507,lon:-.127,feedType:'image'},
    {id:'austin-public-1',name:'Public Square',city:'Austin',pack:'austin',
      lat:30.268,lon:-97.743,feedType:'image'},
    {id:'deldot-public-1',name:'Traffic at Market Street',city:'New Castle County',
      pack:'deldot',lat:39.72,lon:-75.57,feedType:'hls'}
  ];
  const eventHandlers={};
  globalThis.CustomEvent=class{
    constructor(type,opts={}){this.type=type;this.detail=opts.detail;}
  };
  globalThis.document={
    hidden:false,
    addEventListener(type,fn){eventHandlers[type]=fn;},
    getElementById(){return {getAttribute:()=> 'false'};},
    querySelector(){return null;}
  };
  globalThis.window={
    addEventListener(type,fn){eventHandlers[type]=fn;},
    dispatchEvent(){},
    TravisCctv:{
      async load(){return {state:'ready',count:available.length};},
      locations(){return available;}
    },
    TravisCctvPlayer:{
      async openCamera(id){
        opened.push(id);lastId=id;
        lastKind=id.startsWith('deldot-')?'video':'snapshot';
        return lastKind==='video'
          ? {ok:true,type:'hls-requested',liveVerified:false}
          : {ok:true,type:'snapshot'};
      },
      status(){return {
        sourceId:lastId,mode:lastKind==='video'?'video':'image',
        playingVerified:lastKind==='video',updatedFrame:Date.now()+1000
      };},
      close(){}
    },
    TravisGevBridge:{
      status(){return {open:true,place:'earth',coordinates:null};},
      toggleLayer(id,on){layers.push({id,on});},
      navigate(_,coords){focussed.push(coords);}
    }
  };
  const {default:noop}=await import('../travis-cctv-autopilot.mjs?selftest=1');
  assert.equal(noop,undefined);
  const ctl=window.TravisCctvAutopilot;
  assert.equal(typeof ctl.routeCommand,'function');
  const {cameraIntent}=await import('../travis-cctv-auto-policy.mjs');
  let a=await ctl.select(cameraIntent('Travis, mostra uma câmara em Londres'));
  assert.equal(a.handled,true);
  assert.equal(a.verified,true);
  assert.match(a.reply,/imagem real|imagem da|imagem/i);
  assert.equal(opened[0],'london-public-1');
  assert.equal(focussed[0].lat,51.507);
  assert.ok(layers.some(x=>x.id==='cctv'&&x.on===true));
  const before=opened.length;
  a=await ctl.select(cameraIntent('Mostra uma câmara no Porto'));
  assert.equal(a.verified,false);
  assert.equal(opened.length,before,'A city without registered sources must not fall back elsewhere');
  a=await ctl.select(cameraIntent('Show a live camera in Delaware'));
  assert.equal(a.verified,true);
  assert.match(a.reply,/playing video/i);
  assert.equal(opened.at(-1),'deldot-public-1');
  a=await ctl.select(cameraIntent('Show a live camera in London'));
  assert.equal(a.verified,false,'London snapshots must not be reported as HLS video');
  assert.match(a.reply,/no registered public HLS video/i);
  a=await ctl.routeCommand('Abre a câmara do telemóvel');
  assert.equal(a.handled,false);
  a=await ctl.routeCommand('Travis, mostra uma câmara em Londres');
  assert.equal(a.handled,true);
  assert.equal(a.verified,false,'voice request must acknowledge, not claim playback before it begins');
});
