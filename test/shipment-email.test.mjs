import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, processQueue } from '../lib/shipment-email.mjs';

const job = {id:'job-1',lock_token:'lease-1',attempts:1,recipient:'customer@example.test',
  payload:{guide:'FG-2026-TEST',customer_name:'Cliente <script>',status:'En reparto',note:'Caja & sello',occurred_at:'2026-10-15T18:00:00Z'}};
const env = key => ({EMAIL_NOTIFICATIONS_ENABLED:'true',RESEND_API_KEY:'test-key',SHIPMENT_EMAIL_FROM:'FOX GAMER <notificaciones@entregasfoxgamer.co>',SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'test-service'})[key];
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

test('disabled or incomplete configuration does not claim or send',async()=>{
  for(const lookup of [()=>undefined,key=>key==='RESEND_API_KEY'?undefined:env(key)]) {
    const result=await processQueue({env:lookup,fetcher:()=>assert.fail('No network call allowed')});
    assert.equal(result.enabled,false);
  }
});

test('message escapes client content, uses Colombia time and a working public query link',()=>{
  const message=buildMessage(job,env('SHIPMENT_EMAIL_FROM'));
  assert.deepEqual(message.to,[job.recipient]);
  assert.match(message.html,/&lt;script&gt;/);
  assert.doesNotMatch(message.html,/<script>/);
  assert.match(message.text,/1:00/);
  assert.match(message.text,/https:\/\/entregasfoxgamer.co\/\?guia=FG-2026-TEST/);
});

test('accepted email records provider id and stable idempotency key',async()=>{
  let claim=0;const patches=[];const keys=[];
  const result=await processQueue({env,fetcher:async(url,options)=>{
    if(url.includes('/rpc/')) return json(claim++===0?[job]:[]);
    if(url==='https://api.resend.com/emails') {keys.push(options.headers['Idempotency-Key']);return json({id:'provider-1'});}
    patches.push(JSON.parse(options.body));return json([{}]);
  }});
  assert.equal(result.accepted,1);assert.deepEqual(keys,['shipment-event/job-1']);
  assert.equal(patches[0].state,'sent');assert.equal(patches[0].provider_id,'provider-1');
});

test('temporary rejection retries, invalid recipient does not, retries are bounded',async()=>{
  for(const [status,attempts,state] of [[429,1,'pending'],[503,2,'pending'],[422,1,'failed'],[503,8,'failed']]) {
    let claim=0;let patch;
    const result=await processQueue({env,now:()=>0,fetcher:async(url,options)=>{
      if(url.includes('/rpc/')) return json(claim++===0?[{...job,attempts}]:[]);
      if(url==='https://api.resend.com/emails') return json({},status);
      patch=JSON.parse(options.body);return json([{}]);
    }});
    assert.equal(result.accepted,0);assert.equal(patch.state,state);
    if(state==='pending') assert.equal(Date.parse(patch.next_attempt_at),60000*2**(attempts-1));
  }
});

test('network timeout preserves a retry; failed database acknowledgement never reports success',async()=>{
  let claim=0;let patch;
  await processQueue({env,fetcher:async(url,options)=>{
    if(url.includes('/rpc/')) return json(claim++===0?[job]:[]);
    if(url==='https://api.resend.com/emails') throw new Error('timeout');
    patch=JSON.parse(options.body);return json([{}]);
  }});
  assert.equal(patch.state,'pending');
  await assert.rejects(processQueue({env,fetcher:async(url)=>{
    if(url.includes('/rpc/')) return json([job]);
    if(url==='https://api.resend.com/emails') return json({id:'accepted'});
    return json({},503);
  }}),/database_503/);
});
