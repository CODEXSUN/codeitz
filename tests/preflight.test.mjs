import test from 'node:test';import assert from 'node:assert/strict';
import {checkDatabase,temporaryPostgresFailure} from '../scripts/preflight.ts';
function probe(errors=[]){let attempts=0;const builder=new Proxy({}, {get:(_t,key)=>key==='execute'||key==='executeTakeFirstOrThrow'?async()=>{if(++attempts<=errors.length)throw errors[attempts-1];return {id:1};}:()=>builder});return {db:{selectFrom:()=>builder},calls:()=>attempts};}
test('startup retries temporary PostgreSQL recovery but never schema or credentials',async()=>{
 const p=probe([Object.assign(Error('recovering'),{code:'57P03'}),Object.assign(Error('connect'),{code:'ECONNREFUSED'})]);const t=performance.now();const r=await checkDatabase(p.db,{timeoutMs:1000,initialDelayMs:5,maxDelayMs:10});assert.equal(r.attempts,3);assert.ok(performance.now()-t<1000);
 for(const code of ['28P01','42P01','42703']){const p=probe([Object.assign(Error('fatal'),{code})]);await assert.rejects(checkDatabase(p.db,{initialDelayMs:5,maxDelayMs:5}),e=>e.cause.code===code);assert.equal(p.calls(),1);}
});
test('startup has finite attempts and respects cancellation without writing',async()=>{
 const p=probe(Array.from({length:10},()=>Object.assign(Error('recovering'),{code:'57P03'})));await assert.rejects(checkDatabase(p.db,{maxAttempts:2,initialDelayMs:5,maxDelayMs:5}),e=>e.cause.reason==='attempts');assert.equal(p.calls(),2);
 const c=new AbortController();c.abort();await assert.rejects(checkDatabase(probe().db,{signal:c.signal}),e=>e.cause.reason==='aborted');
 assert.equal(temporaryPostgresFailure({code:'08006'}),true);assert.equal(temporaryPostgresFailure({code:'unknown'}),false);
});
