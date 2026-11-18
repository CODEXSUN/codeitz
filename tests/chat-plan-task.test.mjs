import {prepareProjectDatabase,projectDatabase,projectSchema} from './project-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createHttpServer } from '@workspace/framework';
import { AgentChat } from '../src/api/modules/agent-chat/service.ts';
import { ChatStore } from '../src/api/modules/agent-chat/store.ts';
import { TaskRunner } from '../src/api/modules/task-runner/application/service.ts';
import { registerTaskRoutes } from '../src/api/modules/task-runner/routes.ts';
import { registerAgentChatRoutes } from '../src/api/modules/agent-chat/routes.ts';
import { registerApiDocumentation } from '../src/api/openapi.ts';
async function fixture() {
 const root=await mkdtemp(path.join(tmpdir(),'codeitz-chat-plan-task-'));const owner='apps/example';
 for(const directory of ['apps/example/docs','apps/example/src','apps/other/docs','devkit','mcp-governance/docs'])await mkdir(path.join(root,directory),{recursive:true});
 for(const name of ['governance.md','coding-standard.md','app-structure.md','frontend-design-system.md','server-startup.md'])await writeFile(path.join(root,'mcp-governance/docs',name),'# Rules');
 await writeFile(path.join(root,owner,'AGENTS.md'),'Follow central governance');await writeFile(path.join(root,owner,'docs/work-record.md'),'# Existing team notes');
 const codingCalls=[];const runner=new TaskRunner(root,await prepareProjectDatabase(root),async input=>{codingCalls.push(input.mode);assert.match(input.prompt,/APPROVED PLAN/);return 'Code step finished';});
 const file=await prepareProjectDatabase(root);const chat=new AgentChat(root,file,async()=> '1. Add the selected module.\n2. Reuse shared components.\n3. Run declared checks after coding approval.');
 const app=createHttpServer({name:'handoff-test',logLevel:'silent'});registerApiDocumentation(app);registerTaskRoutes(app,root,root,runner);registerAgentChatRoutes(app,root,root,chat,runner);await app.ready();
 async function plan(mode='plan'){const conversation=await chat.create(owner);await chat.send(conversation.id,'Add a small module in this project',mode,randomUUID());for(let deadline=Date.now()+15000;Date.now()<deadline;){const detail=(await chat.store.read(conversation.id));if(detail.messages[1]?.status==='completed')return {id:conversation.id,message:detail.messages[1],user:detail.messages[0]};await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Chat did not finish.');}
 return {root,owner,file,runner,chat,app,codingCalls,plan,close:async()=>{await app.close();await rm(root,{recursive:true,force:true});}};
}
test('approved chat plan creates one same-project PostgreSQL task and coding waits for a separate action',async()=>{
 const f=await fixture();try{
  const plan=await f.plan();const url=`/api/v1/chats/${plan.id}/tasks`;const payload={messageId:plan.message.id,approvePlan:true};
  const result=await f.app.inject({method:'POST',url,payload});assert.equal(result.statusCode,200);const {taskId,conversation}=result.json();
  const tasks=await f.runner.list();assert.equal(tasks.length,1);const task=tasks[0];assert.equal(task.id,taskId);assert.equal(task.owner,f.owner);assert.equal(task.goal,plan.user.content);assert.equal(task.plan,plan.message.content);assert.equal(task.status,'planned');assert.deepEqual(f.codingCalls,[]);assert.deepEqual(task.checks,[]);assert.deepEqual(task.changedFiles,[]);
  assert.equal(task.sourceChat.conversationId,plan.id);assert.equal(task.sourceChat.messageId,plan.message.id);assert.ok(task.sourceChat.approvedAt);assert.equal(conversation.taskLinks[0].state,'ready');assert.equal(conversation.taskLinks[0].taskId,taskId);
  assert.deepEqual(JSON.parse(JSON.stringify((await new ChatStore(f.file).read(plan.id)).taskLinks)),conversation.taskLinks);
  const saved=JSON.parse((await f.file.selectFrom('coding_tasks').select('body').where('id','=',taskId).executeTakeFirstOrThrow()).body);assert.deepEqual(saved.sourceChat,task.sourceChat);assert.equal(saved.status,'planned');
  await assert.rejects(f.runner.step(taskId,'check'),/not ready/);assert.deepEqual(f.codingCalls,[]);
  assert.equal((await f.app.inject({method:'POST',url:`/api/v1/tasks/${taskId}/step`,payload:{action:'code'}})).statusCode,202);
  for(let deadline=Date.now()+15000;Date.now()<deadline;){if((await f.runner.list())[0].status==='coded')break;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.deepEqual(f.codingCalls,['code']);assert.equal((await f.runner.list())[0].status,'coded');
  const repeat=(await f.app.inject({method:'POST',url,payload})).json();assert.equal(repeat.taskId,taskId);assert.equal((await f.runner.list()).length,1);assert.equal((await f.runner.list())[0].status,'coded');assert.equal(repeat.conversation.taskLinks[0].approvedAt,task.sourceChat.approvedAt);
 }finally{await f.close();}
});
test('handoff requires explicit approval of a completed Plan reply in the same conversation',async()=>{
 const f=await fixture();try{
  const plan=await f.plan();const other=await f.plan('explore');const url=`/api/v1/chats/${plan.id}/tasks`;
  for(const payload of [{messageId:plan.message.id},{messageId:plan.message.id,approvePlan:false},{messageId:plan.message.id,approvePlan:true,owner:'apps/other'}])assert.equal((await f.app.inject({method:'POST',url,payload})).statusCode,400);
  assert.equal((await f.app.inject({method:'POST',url,payload:{messageId:other.message.id,approvePlan:true}})).statusCode,409);
  assert.equal((await f.app.inject({method:'POST',url,payload:{messageId:plan.user.id,approvePlan:true}})).statusCode,409);
  assert.equal((await f.app.inject({method:'POST',url:`/api/v1/chats/${other.id}/tasks`,payload:{messageId:other.message.id,approvePlan:true}})).statusCode,409);
  assert.equal((await f.app.inject({method:'POST',url,headers:{origin:'https://other.invalid'},payload:{messageId:plan.message.id,approvePlan:true}})).statusCode,403);
  const pending=await f.chat.create(f.owner);(await f.chat.store.begin(pending.id,'Pending plan','plan',randomUUID()));const running=(await f.chat.store.read(pending.id)).messages[1];assert.equal((await f.app.inject({method:'POST',url:`/api/v1/chats/${pending.id}/tasks`,payload:{messageId:running.id,approvePlan:true}})).statusCode,409);
  assert.equal((await f.runner.list()).length,0);assert.deepEqual((await f.chat.store.read(plan.id)).taskLinks,[]);assert.deepEqual(f.codingCalls,[]);
 }finally{await f.close();}
});
test('pending PostgreSQL handoff recovers after a failure or restart without duplicating the task',async()=>{
 for(const afterInsert of [false,true]){
  const f=await fixture();try{
   const plan=await f.plan();const failing={createFromChatPlan:async input=>{if(afterInsert)await f.runner.createFromChatPlan(input);throw new Error('Simulated handoff interruption');}};
   await assert.rejects(f.chat.createPlanTask(plan.id,plan.message.id,failing),/interruption/);const pending=(await f.chat.store.read(plan.id)).taskLinks[0];assert.equal(pending.state,'pending');assert.equal((await f.runner.list()).length,afterInsert?1:0);
   const restartedChat=new AgentChat(f.root,f.file);const result=await restartedChat.createPlanTask(plan.id,plan.message.id,f.runner);assert.equal(result.taskId,pending.taskId);assert.equal(result.conversation.taskLinks[0].state,'ready');assert.equal(result.conversation.taskLinks[0].approvedAt,pending.approvedAt);assert.equal((await f.runner.list()).length,1);assert.deepEqual(f.codingCalls,[]);
  }finally{await f.close();}
 }
});
