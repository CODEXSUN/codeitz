import test from 'node:test';
import assert from 'node:assert/strict';
import {pickAppActors, internalThreadName} from '../actor-pool.mjs';
import {CodexClient} from '../codex-client.mjs';

test('stable app supervisor and two reusable coworkers; all surplus history preserved',()=>{
 const chats=[{id:'new',app_id:'a',created_at:'2026-11-23'},{id:'old',app_id:'a',created_at:'2026-11-21'},{id:'foreign',app_id:'b'}];
 const coworkers=[{id:'third',conversation_id:'old',created_at:'2026-11-23'},{id:'first',conversation_id:'old',created_at:'2026-11-21'},{id:'second',conversation_id:'old',created_at:'2026-11-22'},{id:'historical',conversation_id:'new'},{id:'other',conversation_id:'foreign'}];
 const before=JSON.stringify({chats,coworkers});
 assert.deepEqual(pickAppActors('a',chats,coworkers),{supervisorId:'old',activeCoworkerIds:['first','second'],historyConversationIds:['new'],historyCoworkerIds:['historical','third']});
 assert.equal(JSON.stringify({chats,coworkers}),before);
 assert.equal(internalThreadName('Platform\n app','worker\t1'),'Codeitz · Platform app · worker 1');
});

function fixture(){
 const saved={id:'owned',name:null,status:{type:'idle'},history:['first task']}; let archived=false;
 const calls=[];
 const make=()=>{const client=new CodexClient('unused','unused'); client.ready=true;client.request=async(method,params)=>{
  calls.push({method,params});
  if(method==='thread/list')return {data:archived?[{id:saved.id}]:[],nextCursor:null};
  if(method==='thread/unarchive'){archived=false;return {thread:saved};}
  if(method==='thread/read')return {thread:saved};
  if(method==='thread/unsubscribe')return {status:'notSubscribed'};
  if(method==='thread/resume'||method==='thread/start')return {thread:saved,cwd:params.cwd};
  if(method==='thread/name/set'){saved.name=params.name;return {};}
  if(method==='turn/start'){saved.history.push(params.input[0].text);return {turn:{id:'turn-'+saved.history.length,status:'completed'}};}
  if(method==='thread/archive'){archived=true;return {};}
  throw Error(method);
 };return client;};
 return {make,saved,calls,get archived(){return archived;}};
}
test('same owned thread survives hiding, client restart and separate task workspaces',async()=>{
 const f=fixture(); let client=f.make();
 for(const [index,workspace] of ['/owned/one','/owned/two'].entries()){
  await client.thread({threadId:'owned',workspace,worker:true,internal:true,displayName:'Codeitz · Platform · coworker'});
  await assert.rejects(client.parkThread('owned'),/Active/);
  await client.turn('owned','task '+index,async()=>{},null,{workspace,worker:true});
  await client.parkThread('owned'); assert.equal(f.archived,true);
  client=f.make();
 }
 assert.deepEqual(f.saved.history,['first task','task 0','task 1']);
 assert.equal(f.saved.name,'Codeitz · Platform · coworker');
 assert.equal(f.calls.filter(c=>c.method==='thread/unarchive').length,1);
 assert.equal(f.calls.some(c=>c.method==='thread/start'),false);
 for(const call of f.calls.filter(c=>c.method==='turn/start')){
  assert.equal(call.params.approvalPolicy,'on-request');assert.equal(call.params.sandboxPolicy.networkAccess,false);
  assert.deepEqual(call.params.sandboxPolicy.writableRoots,[call.params.cwd]);
 }
});
test('foreign, active and uncertain sessions cannot be archived; user title retained',async()=>{
 const f=fixture(),client=f.make();
 await assert.rejects(client.parkThread('manual-user-chat'),/owned/);
 f.saved.name='My custom title';
 await client.thread({threadId:'owned',workspace:'/owned/one',worker:true,internal:true,displayName:'Codeitz · App · worker'});
 assert.equal(f.saved.name,'My custom title');
 await client.turn('owned','task',async()=>{},null,{workspace:'/owned/one',worker:true});
 for(const status of ['active','systemError','unknown']){
  f.saved.status.type=status;await assert.rejects(client.parkThread('owned'),/idle/);
 }
 f.saved.status.type='idle';client.activeThreadTurns.set('owned',{uncertain:true});
 await assert.rejects(client.parkThread('owned'),/uncertain/);
 assert.equal(f.calls.some(c=>c.method==='thread/archive'),false);
});
test('archive lookup uses exact ID and stops on incomplete pagination',async()=>{
 const client=new CodexClient('unused','unused');let calls=0;
 client.request=async()=>{calls++;return {data:[{id:'unrelated'}],nextCursor:'same'};};
 await assert.rejects(client.isArchived('owned'),/incomplete/);assert.equal(calls,2);
 client.request=async()=>{throw Error('offline')};await assert.rejects(client.isArchived('owned'),/offline/);
});

test('cosmetic naming failure retains the new persistent thread ID',async()=>{
 const f=fixture(),client=f.make(),request=client.request;
 client.request=async(method,params)=>{
  if(method==='thread/name/set')throw Error('name unavailable');
  return request(method,params);
 };
 const result=await client.thread({workspace:'/owned/one',worker:true,internal:true,displayName:'Codeitz · App · worker'});
 assert.equal(result.thread.id,'owned');assert.equal(result.codeitzNamePending,true);
 assert.equal(f.calls.find(call=>call.method==='thread/start').params.ephemeral,false);
 await client.turn(result.thread.id,'approved task',async()=>{},null,{workspace:'/owned/one',worker:true});
 assert.equal(f.saved.history.at(-1),'approved task');
});

test('a resume returning another session ID is rejected without a model turn',async()=>{
 const f=fixture(),client=f.make(),request=client.request;
 client.request=async(method,params)=>method==='thread/resume'
  ? {thread:{id:'different'},cwd:params.cwd}
  : request(method,params);
 await assert.rejects(client.thread({threadId:'owned',workspace:'/owned/one',worker:true,internal:true}),/session identity/);
 assert.equal(f.calls.some(call=>call.method==='turn/start'),false);
});
