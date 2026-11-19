import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID}from'node:crypto';import{sql}from'kysely';
import{openDatabase,databaseSettings}from'../src/api/database.ts';import{migrate}from'../scripts/database.ts';import{seed}from'../src/api/modules/todos/database/seeders/seed.ts';import{createServer}from'../src/api/server.ts';
import{mkdtemp,mkdir,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
const auditRoot=await mkdtemp(path.join(tmpdir(),'codeitz-shared-pool-'));for(const name of['apps','devkit','addons','foundation','packages','infrastructure','mcp-governance'])await mkdir(path.join(auditRoot,name));test.after(async()=>{assert.equal(path.dirname(auditRoot),tmpdir());assert.ok(path.basename(auditRoot).startsWith('codeitz-shared-pool-'));await rm(auditRoot,{recursive:true,force:true});});
const enabled=process.env.CODEITZ_TEST_POSTGRES==='1';
async function fixture(){const base=openDatabase(),schema='shared_pool_'+randomBytes(8).toString('hex'),db=base.withSchema(schema);await base.schema.createSchema(schema).execute();await migrate(db,schema);await seed(db);return {base,db,schema,async cleanup(){const control=openDatabase();try{await control.schema.dropSchema(schema).ifExists().cascade().execute();}finally{await control.destroy();await base.destroy();}}};}
const routes=['/api/v1/todos','/api/v1/work-tasks/options','/api/v1/tasks','/api/v1/chats','/api/v1/sync','/api/ready'];
test('one owned pool serves parallel modules with bounded connections and closes once after borrowers',{skip:!enabled},async()=>{
 const priorName=process.env.PGAPPNAME;process.env.PGAPPNAME='codeitz_pool_'+randomBytes(8).toString('hex');const f=await fixture();let opens=0,ends=0,drained=false;const destroy=f.db.destroy.bind(f.db);f.db.destroy=async()=>{ends++;assert.equal(drained,true);await destroy();};
 const app=createServer({auditRoot,databaseFactory:()=>{opens++;return f.db;},workTaskScheduling:false,syncScheduling:false});
 app.addHook('onClose',async()=>{await sql`select 1`.execute(f.db);drained=true;});
 try{await app.ready();const pidRows=await Promise.all(Array.from({length:25},()=>sql`select pg_backend_pid() as pid, current_user as role, current_database() as database, pg_sleep(0.01)`.execute(f.db)));assert.ok(new Set(pidRows.map(r=>r.rows[0].pid)).size<=5);assert.ok(new Set(pidRows.map(r=>r.rows[0].pid)).size>1);assert.equal(new Set(pidRows.map(r=>r.rows[0].role)).size,1);const expectedRole=databaseSettings().connection.user;if(expectedRole)assert.equal(pidRows[0].rows[0].role,expectedRole);assert.equal(pidRows[0].rows[0].database,databaseSettings().connection.database);
 const responses=await Promise.all(Array.from({length:4},()=>routes.map(url=>app.inject(url))).flat());for(const r of responses)assert.equal(r.statusCode,200,r.body);assert.equal(opens,1);const census=await sql`select count(*)::int as count from pg_stat_activity where application_name=${process.env.PGAPPNAME}`.execute(f.db);assert.ok(census.rows[0].count<=5,JSON.stringify(census.rows));
 await app.close();assert.equal(ends,1);await assert.rejects(()=>sql`select 1`.execute(f.db));
 }finally{if(!ends){drained=true;await app.close();}await f.cleanup();if(priorName===undefined)delete process.env.PGAPPNAME;else process.env.PGAPPNAME=priorName;}
});
test('caller-owned app, project and runtime schemas remain separate and usable after shutdown',{skip:!enabled},async()=>{
 const a=await fixture(),p=await fixture(),r=await fixture();let app;
 try{await a.db.insertInto('todo_categories').values({public_id:'appscope',name:'App scope',created_by:'local-owner',updated_by:'local-owner'}).execute();
 const id=randomUUID(),now=new Date().toISOString();await r.db.insertInto('agent_conversations').values({id,owner:'devkit/codeitz',title:'Runtime scope',created_at:now,updated_at:now}).execute();
 await p.db.updateTable('sync_identity').set({origin:randomUUID()}).execute();
 await a.db.deleteFrom('sync_identity').execute();
 app=createServer({auditRoot,database:a.db,projectDatabase:p.db,runtimeDatabase:r.db,workTaskScheduling:false,syncScheduling:false,databaseFactory:()=>{throw Error('Must not open a pool for an injected app database');}});await app.ready();
 const todo=await app.inject('/api/v1/todos');assert.equal(todo.statusCode,200);assert.match(todo.body,/App scope/);
 const chats=await app.inject('/api/v1/chats');assert.equal(chats.statusCode,200);assert.match(chats.body,/Runtime scope/);assert.equal((await a.db.selectFrom('agent_conversations').selectAll().execute()).length,0);
 assert.equal((await app.inject('/api/ready')).statusCode,200);await app.close();app=undefined;for(const f of[a,p,r])assert.equal((await sql`select 1 as alive`.execute(f.db)).rows[0].alive,1);
 }finally{await app?.close();for(const f of[a,p,r])await f.cleanup();}
});

import net from 'node:net';import{spawn}from'node:child_process';
test('shared startup pool survives idle loss and all modules recover committed scope',{skip:!enabled,timeout:45000},async()=>{
 const f=await fixture(),sockets=new Set(),upstream=databaseSettings().connection;let child,server;
 const proxy=()=>net.createServer(socket=>{const target=net.connect({host:upstream.host,port:upstream.port});for(const s of[socket,target]){sockets.add(s);s.on('error',()=>{});s.once('close',()=>sockets.delete(s));}socket.pipe(target);target.pipe(socket);socket.once('close',()=>target.destroy());target.once('close',()=>socket.destroy());});
 const closeProxy=async()=>{for(const s of sockets)s.destroy();if(server?.listening)await new Promise(r=>server.close(r));};
 try{await f.db.insertInto('todo_categories').values({public_id:'recover1',name:'Recovered scope',created_by:'local-owner',updated_by:'local-owner'}).execute();
 server=proxy();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const source=`import{createServer}from'./src/api/server.ts';const app=createServer({auditRoot:process.env.AUDIT_FIXTURE_ROOT,workTaskScheduling:false,syncScheduling:false});await app.ready();process.on('message',async action=>{try{if(action==='quit'){await app.close();process.disconnect();return;}const paths=['/api/ready','/api/v1/todos','/api/v1/work-tasks/options','/api/v1/tasks','/api/v1/chats','/api/v1/sync'];const values=await Promise.all(paths.map(async path=>{const r=await app.inject(path);return {path,status:r.statusCode,marker:r.body.includes('Recovered scope')};}));process.send(values);}catch{process.send({failed:true});}});process.send({started:true});`;
 child=spawn(process.execPath,['--input-type=module','-e',source],{cwd:new URL('../',import.meta.url),env:{...process.env,PGHOST:'127.0.0.1',PGPORT:String(port),PGSSLMODE:'disable',CODEITZ_PG_SCHEMA:f.schema,AUDIT_FIXTURE_ROOT:auditRoot},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
 const receive=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('Shared app recovery timed out')),15000);const exit=()=>finish(Error('Shared app exited unexpectedly'));const message=value=>finish(null,value);function finish(error,value){clearTimeout(timer);child.off('message',message);child.off('exit',exit);error?reject(error):resolve(value);}child.once('message',message);child.once('exit',exit);});
 await receive();let response=receive();child.send('read');const first=await response;assert.ok(first.every(r=>r.status===200),JSON.stringify(first));
 await closeProxy();await new Promise(r=>setTimeout(r,60));assert.equal(child.exitCode,null);response=receive();child.send('read');const down=await response;assert.equal(down.find(r=>r.path==='/api/ready').status,503);assert.ok(down.filter(r=>r.path!=='/api/ready').every(r=>r.status>=400),JSON.stringify(down));
 server=proxy();await new Promise(r=>server.listen(port,'127.0.0.1',r));response=receive();child.send('read');const recovered=await response;assert.ok(recovered.every(r=>r.status===200),JSON.stringify(recovered));assert.equal(recovered.find(r=>r.path==='/api/v1/todos').marker,true);
 const exited=new Promise(r=>child.once('exit',r));child.send('quit');assert.equal(await exited,0);child=undefined;
 }finally{child?.kill();await closeProxy();await f.cleanup();}
});

import{PostgresTodoRepository}from'../src/api/modules/todos/repository.ts';import{TaskRepository}from'../src/api/modules/business/task/repository.ts';import{TaskService}from'../src/api/modules/business/task/service.ts';
test('shutdown waits for both active reminder scans before ending the shared pool',{skip:!enabled},async t=>{
 t.mock.timers.enable({apis:['setInterval']});const f=await fixture(),todo=new PostgresTodoRepository(f.db,undefined,false),work=new TaskService(new TaskRepository(f.db,false));let todoCalls=0,workCalls=0,todoDone=false,workDone=false,ends=0,releaseTodo,releaseWork;
 const todoGate=new Promise(r=>releaseTodo=r),workGate=new Promise(r=>releaseWork=r),originalTodo=todo.deliverDue.bind(todo),originalWork=work.deliverSchedules.bind(work);
 todo.deliverDue=async()=>{todoCalls++;if(todoCalls>1){await todoGate;const value=await originalTodo();todoDone=true;return value;}return originalTodo();};
 work.deliverSchedules=async()=>{workCalls++;if(workCalls>1){await workGate;const value=await originalWork();workDone=true;return value;}return originalWork();};
 const destroy=f.db.destroy.bind(f.db);f.db.destroy=async()=>{assert.equal(todoDone,true);assert.equal(workDone,true);ends++;await destroy();};
 const app=createServer({auditRoot,databaseFactory:()=>f.db,todoRepository:todo,workTaskService:work,syncScheduling:false});let closing;
 try{await app.ready();t.mock.timers.tick(15000);await new Promise(r=>setImmediate(r));assert.equal(todoCalls,2);assert.equal(workCalls,2);let finished=false;closing=app.close().then(()=>finished=true);await new Promise(r=>setImmediate(r));assert.equal(finished,false);assert.equal(ends,0);releaseTodo();await new Promise(r=>setImmediate(r));assert.equal(ends,0);releaseWork();await closing;assert.equal(ends,1);t.mock.timers.tick(60000);assert.equal(todoCalls,2);assert.equal(workCalls,2);
 }finally{releaseTodo();releaseWork();if(!closing)closing=app.close();await closing;await f.cleanup();}
});
