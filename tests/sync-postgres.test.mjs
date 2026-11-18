import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareProjectDatabase,projectDatabase} from './project-fixture.mjs';
import {SyncService} from '../src/api/modules/sync/service.ts';
import {registerSyncRoutes} from '../src/api/modules/sync/routes.ts';
import {registerApiDocumentation} from '../src/api/openapi.ts';
import {createHttpServer} from '@workspace/framework';
import {ProjectStore} from '../src/api/modules/projects/infrastructure/store.ts';
import {ModuleStore} from '../src/api/modules/projects/infrastructure/module-store.ts';
import {emptyModuleSpec} from '../contracts/modules.ts';
import {parseLocation} from '../contracts/navigation.ts';
const enabled=process.env.CODEITZ_TEST_POSTGRES==='1';
const input=()=>({title:'Identity',content:'Identity scope',status:'draft',spec:{...emptyModuleSpec(),code:'identity',owner:'apps/demo',version:'1',responsibility:'Identity management',apiRoutes:[{id:randomUUID(),method:'GET',path:'/api/v1/users',summary:'Read users',permission:'users.read',requestSchema:'{}',responseSchema:'{}'}],tables:[{id:randomUUID(),name:'users',description:'Users',fields:[{id:randomUUID(),name:'id',type:'UUID',sqlType:'UUID',generation:'none',indexed:false,required:true,primary:true,unique:true,defaultValue:'',reference:'',description:'Public identity'}]}]}});
async function instance(){const root='sync-test-'+randomUUID();await prepareProjectDatabase(root);const db=projectDatabase(root),env={},sync=new SyncService(db,()=>env),app=createHttpServer({name:'sync-test',logLevel:'silent'});registerApiDocumentation(app);registerSyncRoutes(app,sync,false);await app.listen({host:'127.0.0.1',port:0});return {root,db,env,sync,app,url:'http://127.0.0.1:'+app.server.address().port,store:new ProjectStore(db),modules:new ModuleStore(new ProjectStore(db))};}
async function link(a,b,allowSend=true){const config={name:'Peer',url:b.url,owners:['apps/demo'],remoteToken:'',secretEnv:'REMOTE_SECRET',enabled:true,allowSend,remoteEnvironment:'production'};const ca=await a.sync.connect(config),cb=await b.sync.connect({...config,url:a.url});a.env.REMOTE_SECRET=cb.secret;b.env.REMOTE_SECRET=ca.secret;await a.sync.configure(ca.id,{...config,remoteToken:cb.token});await b.sync.configure(cb.id,{...config,url:a.url,remoteToken:ca.token});return {ca,cb,config};}
async function send(instance){for(const row of (await instance.sync.overview()).queue)if(row.state==='held')await instance.sync.release(row.id);await instance.sync.dispatch();}
async function due(instance){await instance.db.updateTable('sync_deliveries').set({next_attempt:new Date(0)}).execute();await send(instance);}
const project={owner:'apps/demo',area:'apps',name:'demo',purpose:'Demo project',orderNo:1,active:true,state:'structure-only',auditPassed:null};
test('bidirectional project/module sync stages drafts, confirms exact aggregates, preserves IDs and prevents echo', {skip:!enabled},async()=>{
 const a=await instance(),b=await instance();try{
 const {ca,cb,config}=await link(a,b);
 assert.equal((await a.sync.overview()).policies.length,9);
 await a.store.save([project]);const module=await a.modules.save('apps/demo',input());
 assert.equal((await a.sync.overview()).queue.length,2);assert.ok((await a.sync.overview()).queue.every(row=>row.state==='held'));
 await send(a);let inbox=await b.sync.inbox();assert.equal(inbox.length,2);assert.ok(inbox.every(row=>row.state==='draft'));assert.equal((await b.store.list()).length,0);
 const child=inbox.find(row=>row.event.kind==='module'),parent=inbox.find(row=>row.event.kind==='project');
 await assert.rejects(()=>b.sync.review(child.id,'confirm',null),/parent project/);
 assert.equal((await b.sync.review(parent.id,'confirm',null)).state,'confirmed');
 assert.equal((await b.sync.review(child.id,'confirm',null)).state,'confirmed');
 let remote=await b.modules.read('apps/demo',module.id);assert.deepEqual(remote.spec,module.spec);assert.equal(remote.id,module.id);assert.equal(remote.approval,undefined);assert.equal((await b.sync.overview()).queue.length,0);
 await due(a);assert.ok((await a.sync.overview()).queue.every(row=>row.state==='confirmed'));
 let changed={title:remote.title,content:'Cloud change',status:remote.status,spec:remote.spec};remote=await b.modules.save('apps/demo',changed,remote.id,remote.revision);await send(b);
 inbox=await a.sync.inbox();assert.equal(inbox.length,1,JSON.stringify((await b.sync.overview()).queue));assert.equal((await a.modules.read('apps/demo',module.id)).content,module.content);
 assert.equal((await a.sync.review(inbox[0].id,'confirm',inbox[0].current.fingerprint)).state,'confirmed');assert.equal((await a.modules.read('apps/demo',module.id)).content,'Cloud change');await due(b);assert.equal((await b.sync.overview()).queue[0].state,'confirmed');
 // Independent edits require an explicit conflict decision.
 const local=await a.modules.read('apps/demo',module.id);await a.modules.save('apps/demo',{...changed,content:'Local concurrent'},local.id,local.revision);await b.modules.save('apps/demo',{...changed,content:'Cloud concurrent'},remote.id,remote.revision);
 await send(a);await send(b);
 let draft=(await b.sync.inbox()).find(row=>row.state==='draft');assert.ok(draft);const expected=draft.current.fingerprint;
 assert.equal((await b.sync.review(draft.id,'confirm',expected)).state,'conflict');assert.equal((await b.modules.read('apps/demo',module.id)).content,'Cloud concurrent');
 await assert.rejects(()=>b.sync.review(draft.id,'confirm','stale',true),/changed since review/);
 assert.equal((await b.sync.review(draft.id,'confirm',expected,true)).state,'confirmed');assert.equal((await b.modules.read('apps/demo',module.id)).content,'Local concurrent');
 const event=draft.event,connection=await b.sync.authenticate(`token ${cb.token}:${cb.secret}`);assert.equal((await b.sync.receive(connection,event)).state,'confirmed');
 await assert.rejects(()=>b.sync.receive(connection,{...event,payload:{...event.payload,content:'tampered'}}),/different payload/);
 const keep=(await a.sync.inbox()).find(row=>row.state==='draft');assert.equal((await a.sync.review(keep.id,'reject',keep.current.fingerprint)).state,'rejected');
 // Explicit rejection stays durable; confirmations and repeats never duplicate receipts.
 const previousCount=(await b.sync.inbox()).length;await b.sync.receive(connection,event);assert.equal((await b.sync.inbox()).length,previousCount);
 const restarted=new SyncService(b.db,()=>b.env);assert.equal((await restarted.inbox()).find(row=>row.id===draft.id).state,'confirmed');assert.deepEqual((await new ModuleStore(b.store).read('apps/demo',module.id)).spec,module.spec);
 assert.equal((await b.sync.connections())[0].secret,undefined);assert.equal((await b.sync.connections())[0].secret_hash,undefined);
 const external=await b.app.inject({method:'POST',url:'/api/v1/sync/exchange',remoteAddress:'203.0.113.8',headers:{authorization:`token ${cb.token}:${cb.secret}`},payload:event});assert.equal(external.statusCode,200,external.body);assert.equal(external.json().state,'confirmed');
 const identity=await b.db.selectFrom('sync_identity').select('origin').executeTakeFirstOrThrow();await assert.rejects(()=>b.sync.receive(connection,{...event,id:randomUUID(),origin:identity.origin}),/same sync identity/);
 const bad=await b.app.inject({method:'POST',url:'/api/v1/sync/exchange',headers:{authorization:'token '+cb.token+':wrong'},payload:event});assert.equal(bad.statusCode,403);
 await assert.rejects(()=>b.sync.receive(connection,{...event,id:randomUUID(),owner:'apps/other'}),/scope/);
 const cross=await b.app.inject({method:'POST',url:'/api/v1/sync/inbox/'+draft.id+'/review',headers:{origin:'https://other.invalid'},payload:{decision:'confirm',expected,resolve:true}});assert.equal(cross.statusCode,403);
 await b.sync.configure(cb.id,{...config,url:a.url,remoteToken:ca.token,enabled:false});await assert.rejects(()=>b.sync.authenticate(`token ${cb.token}:${cb.secret}`),/invalid/);
 }finally{await a.app.close();await b.app.close();}
});
test('transaction rollback leaves no events; initial snapshots are manual and delivery failures retry durably',{skip:!enabled},async()=>{
 const a=await instance(),b=await instance();try{
 await a.store.save([project]);const module=await a.modules.save('apps/demo',input());const count=(await a.sync.overview()).activities.length;
 await assert.rejects(()=>a.db.transaction().execute(async tx=>{await tx.updateTable('project_modules').set({content:'Rollback',revision:99}).where('id','=',module.id).execute();throw new Error('rollback');}),/rollback/);assert.equal((await a.sync.overview()).activities.length,count);assert.equal((await a.modules.read('apps/demo',module.id)).content,module.content);
 const {ca,cb}=await link(a,b);assert.equal((await a.sync.overview()).queue.length,0);assert.equal((await a.sync.initial(ca.id)).queued,2);
 a.env.REMOTE_SECRET='wrong';await send(a);assert.ok((await a.sync.overview()).queue.every(row=>row.state==='failed'));assert.ok((await a.sync.overview()).queue.every(row=>row.error==='Remote sync returned HTTP 403.'));
 a.env.REMOTE_SECRET=cb.secret;await due(a);let drafts=await b.sync.inbox();const parent=drafts.find(row=>row.event.kind==='project'),child=drafts.find(row=>row.event.kind==='module');
 await b.sync.review(parent.id,'confirm',null);await b.sync.review(child.id,'confirm',null);
 await a.db.deleteFrom('project_modules').where('id','=',module.id).execute();await due(a);drafts=await b.sync.inbox();const deletion=drafts.find(row=>row.event.action==='deleted');assert.ok(deletion);assert.equal(deletion.state,'draft');assert.ok(await b.modules.read('apps/demo',module.id));
 await b.sync.review(deletion.id,'confirm',deletion.current.fingerprint);await assert.rejects(()=>b.modules.read('apps/demo',module.id),/not found/);assert.equal((await b.sync.overview()).queue.length,0);

 }finally{await a.app.close();await b.app.close();}
});
test('sync URL state survives canonical refresh and Back navigation',()=>{for(const url of ['/sync','/sync/connections/97e7c31e-a30d-41b0-a30d-748da6159e75','/sync?tab=incoming','/sync?tab=connections','/sync?tab=queue','/sync?tab=activity','/sync?entry=97e7c31e-a30d-41b0-a30d-748da6159e75']){assert.equal(parseLocation(url).canonical,url);assert.equal(parseLocation(url).page,'sync');}assert.equal(parseLocation('/sync?tab=unknown').canonical,'/sync');});


test('development pulls are drafts and production sends are off until explicitly selected',{skip:!enabled},async()=>{
 const local=await instance(),cloud=await instance();try{
 const {ca,config}=await link(local,cloud,false);
 await cloud.store.save([project]);const module=await cloud.modules.save('apps/demo',input());
 await cloud.sync.dispatch();assert.equal((await local.sync.inbox()).length,0);assert.ok((await cloud.sync.overview()).queue.every(row=>row.state==='held'));
 const choice={owner:'apps/demo',kind:'project'};await assert.rejects(()=>local.sync.initial(ca.id,choice),/Sending is off/);
 const result=await local.sync.pull(ca.id,choice);assert.equal(result.drafts,1);assert.equal((await local.store.list()).length,0);assert.equal((await cloud.store.list())[0].purpose,project.purpose);
 let draft=(await local.sync.inbox())[0];await local.sync.review(draft.id,'confirm',null);
 assert.equal((await local.sync.pull(ca.id,{owner:'apps/demo',kind:'module',recordId:module.id})).drafts,1);draft=(await local.sync.inbox()).find(row=>row.state==='draft');await local.sync.review(draft.id,'confirm',null);
 assert.deepEqual((await local.modules.read('apps/demo',module.id)).spec,module.spec);
 await local.db.updateTable('projects').set({purpose:'Selected local concept'}).where('owner','=','apps/demo').execute();
 const held=(await local.sync.overview()).queue.find(row=>row.state==='held');assert.ok(held);await assert.rejects(()=>local.sync.release(held.id),/Sending is off/);
 await local.sync.dispatch();assert.equal((await cloud.sync.inbox()).length,0);
 await local.sync.configure(ca.id,{...config,remoteToken:(await local.sync.connections())[0].remoteToken,allowSend:true});
 const preview=await local.sync.preview(ca.id,choice);await local.db.updateTable('projects').set({active:false}).where('owner','=','apps/demo').execute();await assert.rejects(()=>local.sync.initial(ca.id,choice,preview.items),/changed since preview/);
 const fresh=await local.sync.preview(ca.id,choice);assert.equal((await local.sync.initial(ca.id,choice,fresh.items)).queued,1);
 await local.sync.dispatch();draft=(await cloud.sync.inbox()).find(row=>row.state==='draft');assert.ok(draft);assert.equal(draft.event.kind,'project');assert.equal((await cloud.store.list())[0].purpose,project.purpose);assert.equal((await cloud.sync.inbox()).length,1);
 assert.equal((await cloud.sync.review(draft.id,'confirm',draft.current.fingerprint)).state,'conflict');await cloud.sync.review(draft.id,'confirm',draft.current.fingerprint,true);assert.equal((await cloud.store.list())[0].purpose,'Selected local concept');
 assert.deepEqual((await cloud.modules.read('apps/demo',module.id)).spec,module.spec);
 assert.equal((await local.sync.connections())[0].remoteEnvironment,'production');
 }finally{await local.app.close();await cloud.app.close();}
});


test('Docker bridge connections are accepted while arbitrary remote HTTP is rejected',{skip:!enabled},async()=>{const a=await instance();try{const config={name:'Docker bridge',url:'http://host.docker.internal:4305',owners:['apps/demo'],remoteToken:'',secretEnv:'',enabled:true};const result=await a.sync.connect(config);assert.ok(result.id);await assert.rejects(()=>a.sync.connect({...config,url:'http://example.com'}),/HTTPS/);}finally{await a.app.close();}});
