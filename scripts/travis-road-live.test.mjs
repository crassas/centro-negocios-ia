import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLondonDisruptions,parseFintrafficMeasurements,
  parseNYCSpeeds,nycLocalAgeMs,handleRoadLive,PROVIDERS
} from './travis-road-live.mjs';

test('London disruptions are actual TfL events with correct WGS84 geometry',()=>{
  const events=parseLondonDisruptions([
    {id:'test1',point:'[-0.1276,51.5072]',location:'Westminster roadworks',
      status:'Active',category:'Works',severity:'Serious',
      lastModifiedTime:'2026-10-10T21:00:00Z'},
    {id:'wrong',point:'[100,181]',location:'Not a road'},
    {id:'later',point:'[-0.13,51.5]',status:'Future'}
  ]);
  assert.equal(events.length,1);
  assert.equal(events[0].lat,51.5072);
  assert.equal(events[0].lon,-0.1276);
  assert.equal(events[0].type,'incident');
  assert.equal('speedKph' in events[0],false);
});
test('Fintraffic sensors are recent physical speed measurements (not car tracks)',()=>{
  const now=Date.parse('2026-10-10T22:50:00Z');
  const metadata={features:[
    {id:20002,geometry:{coordinates:[24.637997,60.220898]},
      properties:{collectionStatus:'GATHERING',name:'Espoo'}},
    {id:55,geometry:{coordinates:[23.3,60.0]},
      properties:{collectionStatus:'REMOVED',name:'Unknown'}}
  ]};
  const observation={stations:[
    {id:20002,sensorValues:[
      {id:5122,value:95,measuredTime:'2026-10-10T22:49:00Z'},
      {id:5158,value:88},
      {id:5125,value:0,measuredTime:'2026-10-10T22:49:00Z'}
    ]},
    {id:55,sensorValues:[{id:5122,value:90,measuredTime:'2026-10-10T22:49:00Z'}]}
  ]};
  const records=parseFintrafficMeasurements(metadata,observation,{now});
  assert.equal(records.length,1);
  assert.equal(records[0].speedKph,95);
  assert.equal(records[0].pctFreeFlow,88);
  assert.equal(records[0].type,'measured-speed');
});
test('NYC speed data is treated as local time and excluded when stale',()=>{
  const now=Date.parse('2026-10-10T22:50:00Z'); // 18:50 EDT
  assert.ok(nycLocalAgeMs('2026-10-10T18:45:00.000',now)<10*60000);
  const rows=[{speed:'34',status:'0',data_as_of:'2026-10-10T18:45:00.000',
    link_id:'77',link_points:'40.71,-74.0 40.72,-74.1',link_name:'Sample NYC segment'},
    {speed:'34',status:'-101',data_as_of:'2026-10-10T18:45:00.000',
    link_id:'78',link_points:'40.71,-74.0',link_name:'Device offline'}
  ];
  const fresh=parseNYCSpeeds(rows,{now});
  assert.equal(fresh.length,1);
  assert.equal(fresh[0].speedKph,55);
  assert.equal(parseNYCSpeeds(rows,{now:now+40*60000}).length,0);
});
test('Public route is allowlisted; third party input cannot specify target URLs',async()=>{
  const calls=[];
  const fakeFetch=async(url)=>{
    calls.push(url);
    return new Response(JSON.stringify([{
      id:'1',point:'[-0.11,51.51]',location:'Road works',status:'Active'
    }]),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const res={writeHead(code,headers){this.code=code;this.headers=headers},
    end(data){this.data=JSON.parse(data)}};
  let handled=await handleRoadLive({method:'GET'},res,
    new URL('http://127.0.0.1:4187/api/road-live/london?url=http://10.0.0.1/&limit=3'),
    {now:Date.parse('2026-10-10T23:00:00Z'),fetchImpl:fakeFetch});
  assert.equal(handled,true);
  assert.equal(res.code,200);
  assert.equal(res.data.items.length,1);
  assert.deepEqual(calls,[PROVIDERS.london.sourceUrl]);
  const invalid={writeHead(code){this.code=code},end(value){this.body=JSON.parse(value)}};
  handled=await handleRoadLive({method:'GET'},invalid,new URL('http://127.0.0.1:4187/api/road-live/http://evil'));
  assert.equal(handled,true);
  assert.equal(invalid.code,404);
});
