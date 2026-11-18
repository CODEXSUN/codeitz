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
async function link(a,b){const config={name:'Peer',url:b.url,owners:['apps/demo'],remoteToken:'',secretEnv:'REMOTE_SECRET',enabled:true};const ca=await a.sync.connect(config),cb=await b.sync.connect({...config,url:a.url});a.env.REMOTE_SECRET=cb.secret;b.env.REMOTE_SECRET=ca.secret;await a.sync.configure(ca.id,{...config,remoteToken:cb.token});await b.sync.configure(cb.id,{...config,url:a.url,remoteToken:ca.token});return {ca,cb,config};}
async function due(instance){await instance.db.updateTable('sync_deliveries').set({next_attempt:new Date(0)}).execute();await instance.sync.dispatch();}
const project={owner:'apps/demo',area:'apps',name:'demo',purpose:'Demo project',orderNo:1,active:true,state:'structure-only',auditPassed:null};
test('bidirectional project/module sync stages drafts, confirms exact aggregates, preserves IDs and prevents echo', {skip:!enabled},async()=>{
 const a=await instance(),b=await instance();try{
 const {ca,cb,config}=await link(a,b);
 assert.equal((await a.sync.overview()).policies.length,9);
 await a.store.save([project]);const module=await a.modules.save('apps/demo',input());
 assert.equal((await a.sync.overview()).queue.length,2);
 await a.sync.dispatch();let inbox=await b.sync.inbox();assert.equal(inbox.length,2);assert.ok(inbox.every(row=>row.state==='draft'));assert.equal((await b.store.list()).length,0);
 const child=inbox.find(row=>row.event.kind==='module'),parent=inbox.find(row=>row.event.kind==='project');
 await assert.rejects(()=>b.sync.review(child.id,'confirm',null),/parent project/);
 assert.equal((await b.sync.review(parent.id,'confirm',null)).state,'confirmed');
 assert.equal((await b.sync.review(child.id,'confirm',null)).state,'confirmed');
 let remote=await b.modules.read('apps/demo',module.id);assert.deepEqual(remote.spec,module.spec);assert.equal(remote.id,module.id);assert.equal(remote.approval,undefined);assert.equal((await b.sync.overview()).queue.length,0);
 await due(a);assert.ok((await a.sync.overview()).queue.every(row=>row.state==='confirmed'));
 let changed={title:remote.title,content:'Cloud change',status:remote.status,spec:remote.spec};remote=await b.modules.save('apps/demo',changed,remote.id,remote.revision);await b.sync.dispatch();
 inbox=await a.sync.inbox();assert.equal(inbox.length,1,JSON.stringify((await b.sync.overview()).queue));assert.equal((await a.modules.read('apps/demo',module.id)).content,module.content);
 assert.equal((await a.sync.review(inbox[0].id,'confirm',inbox[0].current.fingerprint)).state,'confirmed');assert.equal((await a.modules.read('apps/demo',module.id)).content,'Cloud change');await due(b);assert.equal((await b.sync.overview()).queue[0].state,'confirmed');
 // Independent edits require an explicit conflict decision.
 const local=await a.modules.read('apps/demo',module.id);await a.modules.save('apps/demo',{...changed,content:'Local concurrent'},local.id,local.revision);await b.modules.save('apps/demo',{...changed,content:'Cloud concurrent'},remote.id,remote.revision);
 await a.sync.dispatch();await b.sync.dispatch();
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
 a.env.REMOTE_SECRET='wrong';await a.sync.dispatch();assert.ok((await a.sync.overview()).queue.every(row=>row.state==='failed'));assert.ok((await a.sync.overview()).queue.every(row=>row.error==='Remote sync returned HTTP 403.'));
 a.env.REMOTE_SECRET=cb.secret;await due(a);let drafts=await b.sync.inbox();const parent=drafts.find(row=>row.event.kind==='project'),child=drafts.find(row=>row.event.kind==='module');
 await b.sync.review(parent.id,'confirm',null);await b.sync.review(child.id,'confirm',null);
 await a.db.deleteFrom('project_modules').where('id','=',module.id).execute();await due(a);drafts=await b.sync.inbox();const deletion=drafts.find(row=>row.event.action==='deleted');assert.ok(deletion);assert.equal(deletion.state,'draft');assert.ok(await b.modules.read('apps/demo',module.id));
 await b.sync.review(deletion.id,'confirm',deletion.current.fingerprint);await assert.rejects(()=>b.modules.read('apps/demo',module.id),/not found/);assert.equal((await b.sync.overview()).queue.length,0);

 }finally{await a.app.close();await b.app.close();}
});
test('sync URL state survives canonical refresh and Back navigation',()=>{for(const url of ['/sync','/sync?tab=connections','/sync?tab=queue','/sync?tab=activity','/sync?entry=97e7c31e-a30d-41b0-a30d-748da6159e75']){assert.equal(parseLocation(url).canonical,url);assert.equal(parseLocation(url).page,'sync');}assert.equal(parseLocation('/sync?tab=unknown').canonical,'/sync');});
