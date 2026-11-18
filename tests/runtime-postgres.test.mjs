import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareProjectDatabase,projectSchema} from './project-fixture.mjs';
import {importSqlite as importRunner,verify as verifyRunner} from '../src/api/modules/task-runner/database/import-sqlite.ts';
import {importSqlite as importChat,verify as verifyChat} from '../src/api/modules/agent-chat/database/import-sqlite.ts';
import {readTasks,appendEvent} from '../src/api/modules/task-runner/infrastructure/store.ts';
import {ChatStore} from '../src/api/modules/agent-chat/store.ts';
import {openDatabase} from '../src/api/database.ts';
test('runner/chat imports preserve IDs, order, approval links and sequences; retries never duplicate',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'codeitz-runtime-pg-')),db=await prepareProjectDatabase(root),schema=projectSchema(root),time='2026-11-17T01:02:03.123Z';
 const task={id:'task',owner:'apps/sample',goal:'Saved goal',status:'planned',createdAt:time,updatedAt:time,plan:'Approved plan',result:'',checks:[],changedFiles:[]};
 const runner={checksum:'runner-fixture',tables:{tasks:[{id:'task',created_at:time,body:JSON.stringify(task)}],events:[{id:42,task_id:'task',time,kind:'phase',message:'Plan ready'}],metadata:[{key:'json-import',value:time}]}};
 const common={mode:'plan',createdAt:time,updatedAt:time,status:'completed'};
 const chat={checksum:'chat-fixture',tables:{conversations:[{id:'chat',owner:'apps/sample',title:'Saved',created_at:time,updated_at:time}],chat_messages:[{id:'user',chat_id:'chat',body:JSON.stringify({...common,id:'user',role:'user',content:'Saved goal'}),request_id:'request',reply_to:null,position:3},{id:'assistant',chat_id:'chat',body:JSON.stringify({...common,id:'assistant',role:'assistant',content:'Approved plan'}),request_id:null,reply_to:'user',position:4}],chat_activity:[{id:9,chat_id:'chat',kind:'approval',message:'Plan approved; coding separate',time}],chat_task_links:[{message_id:'assistant',chat_id:'chat',task_id:'task',approved_at:time,state:'pending'}]}};
 try{
  await importRunner(db,runner,schema);await importChat(db,chat,schema);await verifyRunner(db,runner,schema);await verifyChat(db,chat,schema);
  assert.equal((await importRunner(db,runner,schema)).alreadyImported,true);assert.equal((await importChat(db,chat,schema)).alreadyImported,true);
  await assert.rejects(importRunner(db,{...runner,checksum:'changed'},schema),/changed/);await assert.rejects(importChat(db,{...chat,checksum:'changed'},schema),/changed/);
  assert.equal((await readTasks(db))[0].id,'task');assert.equal((await appendEvent(db,'task','audit','Reviewed')).id,43);
  const store=new ChatStore(db);assert.deepEqual((await store.read('chat')).messages.map(row=>row.id),['user','assistant']);
  assert.equal((await store.begin('chat','Saved goal','plan','request')).started,false);
  assert.equal((await store.reservePlanTask('chat','assistant')).link.taskId,'task');await store.completePlanTask('chat','assistant','task');assert.equal((await store.read('chat')).taskLinks[0].state,'ready');
  const other=openDatabase().withSchema(schema);try{assert.equal((await new ChatStore(other).read('chat')).messages[1].content,'Approved plan');assert.equal((await readTasks(other))[0].plan,'Approved plan');}finally{await other.destroy();}
 }finally{await rm(root,{recursive:true,force:true});}
});
