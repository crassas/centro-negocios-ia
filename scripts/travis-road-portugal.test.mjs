import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePortugalIncidents,handlePortugalRoad} from './travis-road-portugal.mjs';

const make=(source,type,ageHours=1)=>{
  const now=Date.parse('2026-10-10T22:50:00Z');
  return {id:source+'-1',source,sourceUrl:'https://prociv.gov.pt/',
    type,status:'active',lat:41.15,lon:-8.61,
    district:'porto',title:'Corte de trânsito em Porto',
    description:'Aviso publicado, sujeito a confirmação',
    updatedAt:new Date(now-ageHours*3600000).toISOString()};
};
const t=Date.parse('2026-10-10T22:50:00Z');
test('Porto reports are public incidents, not speed measurements',()=>{
  const rows=parsePortugalIncidents({incidents:[
    make('prociv','accident'),make('cmp','closure'),
    make('ip','traffic',240),make('cp','transit',1),
    {...make('source','closure'),district:'lisboa'}
  ]},{area:'porto',now:t});
  assert.equal(rows.length,2);
  assert.equal(rows[0].originalProvider,'prociv');
  assert.ok(rows.every(x=>x.type==='incident'));
  assert.ok(rows.every(x=>!Object.hasOwn(x,'speedKph')));
  assert.ok(rows.every(x=>x.sourceUrl==='https://transitoagora.pt/api-publica'));
});
test('Porto source stops on announced keyless deadline',async()=>{
  let calls=0,result=null,status=0;
  const res={writeHead(n){status=n},end(x){result=JSON.parse(x)}};
  const handled=await handlePortugalRoad({method:'GET'},res,
    new URL('http://127.0.0.1:4187/api/road-live/porto'),
    {now:Date.parse('2026-10-14T00:00:00Z'),fetchImpl:async()=>{calls++;throw Error('No network')}});
  assert.equal(handled,true);
  assert.equal(status,503);assert.equal(calls,0);
  assert.match(result.error,/chave/i);
  assert.equal(result.state,'unavailable');
});
test('IP quota and exact Porto/Lisboa routing cannot be bypassed by URL',async()=>{
  const seen=[];
  let content=null,code=null;
  const res={writeHead(n){code=n},end(x){content=JSON.parse(x)}};
  const fetchImpl=async url=>{
    seen.push(url);
    return new Response(JSON.stringify({incidents:[make('prociv','accident')]}),
      {status:200,headers:{'content-type':'application/json'}});
  };
  const valid=await handlePortugalRoad({method:'GET'},res,
    new URL('http://127.0.0.1:4187/api/road-live/porto?host=evil.example&limit=4'),
    {now:t,fetchImpl});
  assert.equal(valid,true);
  assert.equal(code,200);
  assert.equal(content.count,1);
  assert.deepEqual(seen,['https://transitoagora.pt/api/v1/incidents?district=porto&format=json']);
  assert.equal(content.items[0].originalProvider,'prociv');
  const unsupported=await handlePortugalRoad({method:'GET'},res,
    new URL('http://127.0.0.1:4187/api/road-live/unknown'),
    {now:t,fetchImpl});
  assert.equal(unsupported,false);
  assert.equal(seen.length,1);
});
test('Stale and unrelated reports are never mapped as current accidents',()=>{
 const records=parsePortugalIncidents({incidents:[
   make('prociv','accident',56),make('ip','closure',1200),
   make('cmp','closure',6),{...make('cmp','accident'),lat:4444}
 ]},{area:'porto',now:t});
 assert.equal(records.length,1);
 assert.equal(records[0].originalProvider,'cmp');
});
