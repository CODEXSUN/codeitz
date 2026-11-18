import {prepareProjectDatabase,projectDatabase,projectSchema} from './project-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm,symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createHttpServer } from '@workspace/framework';
import { AgentChat } from '../src/api/modules/agent-chat/service.ts';
import { ChatStore } from '../src/api/modules/agent-chat/store.ts';
import { registerAgentChatRoutes } from '../src/api/modules/agent-chat/routes.ts';
import { registerApiDocumentation } from '../src/api/openapi.ts';
import { parseLocation } from '../contracts/navigation.ts';
async function fixture(connector) {
 const root=await mkdtemp(path.join(tmpdir(),'codeitz-chat-'));const owner='apps/example';
 for(const folder of ['apps/example/docs','devkit','mcp-governance/docs'])await mkdir(path.join(root,folder),{recursive:true});
 await writeFile(path.join(root,'mcp-governance/docs/governance.md'),'Central governance');await writeFile(path.join(root,'mcp-governance/docs/coding-standard.md'),'Modular coding rules');
 await writeFile(path.join(root,owner,'AGENTS.md'),'Follow central governance');await writeFile(path.join(root,owner,'docs/work-record.md'),'old entry\n'.repeat(3000)+'LATEST WORK NOTE');
 const file=await prepareProjectDatabase(root);const chat=new AgentChat(root,file,connector);const app=createHttpServer({name:'chat-test',logLevel:'silent'});registerApiDocumentation(app);registerAgentChatRoutes(app,root,root,chat);await app.ready();
 return {root,owner,file,chat,app,close:async()=>{await app.close();await rm(root,{recursive:true,force:true});}};
}
async function finished(chat,id) {for(let deadline=Date.now()+15000;Date.now()<deadline;){const detail=(await chat.store.read(id));if(!detail.messages.some(item=>item.status==='running'))return detail;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('Reply did not finish.');}
test('project chat reads governance/latest work, persists conversation context and avoids duplicate turns',async()=>{
 let calls=0;const prompts=[];const f=await fixture(async input=>{calls++;prompts.push(input.prompt);assert.equal(input.directory.endsWith(path.join('apps','example')),true);assert.ok(input.prompt.includes('Read-only access only'));assert.ok(input.prompt.includes('LATEST WORK NOTE'));assert.ok(input.prompt.includes('Central governance'));input.onActivity?.('tool','Workspace command: completed');return '**Reviewed** the project.';});
 try{
  const conversation=await f.chat.create(f.owner);const requestId=randomUUID();
  await f.chat.send(conversation.id,'Review the project','review',requestId);let detail=await finished(f.chat,conversation.id);
  assert.equal(detail.messages.length,2);assert.equal(detail.messages[1].content,'**Reviewed** the project.');assert.equal(detail.messages[1].status,'completed');assert.ok(detail.activities.some(item=>item.kind==='tool'));
  await f.chat.send(conversation.id,'Review the project','review',requestId);assert.equal(calls,1);assert.equal((await f.chat.store.read(conversation.id)).messages.length,2);
  await assert.rejects(f.chat.send(conversation.id,'Different message','review',requestId),/different message/);
  await f.chat.send(conversation.id,'What comes next?','plan',randomUUID());detail=await finished(f.chat,conversation.id);assert.ok(prompts[1].includes('Reviewed'));assert.ok(prompts[1].includes('What comes next?'));
  const restarted=new ChatStore(f.file);assert.deepEqual((await restarted.read(conversation.id)),detail);assert.equal((await restarted.list())[0].owner,f.owner);assert.equal((await restarted.recover()),0);
 }finally{await f.close();}
});
test('stop, single-worker limits and failed replies retain their database records',async()=>{
 let started;const ready=new Promise(resolve=>{started=resolve;});const f=await fixture(async({signal})=>{started();return new Promise((resolve,reject)=>{if(signal.aborted)reject(new Error('aborted'));else signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});});
 try{
  const one=await f.chat.create(f.owner);const two=await f.chat.create(f.owner);await f.chat.send(one.id,'Inspect this','explore',randomUUID());await ready;
  await assert.rejects(f.chat.send(two.id,'Concurrent','explore',randomUUID()),/running/);await assert.rejects(f.chat.stop(two.id),/No reply/);
  assert.deepEqual(await f.chat.stop(one.id),{stopped:true});const detail=await finished(f.chat,one.id);assert.equal(detail.messages[1].status,'stopped');assert.equal(detail.messages[0].content,'Inspect this');
 }finally{await f.close();}
 const failed=await fixture(async()=>{throw new Error('Codex unavailable');});try{const conversation=await failed.chat.create(failed.owner);await failed.chat.send(conversation.id,'Hello','explore',randomUUID());assert.equal((await finished(failed.chat,conversation.id)).messages[1].status,'failed');assert.match((await new ChatStore(failed.file).read(conversation.id)).messages[1].content,/unavailable/);}finally{await failed.close();}
});
test('interrupted replies recover once after restart without losing messages or starting Codex',async()=>{
 const f=await fixture(async()=>{throw new Error('Must not run automatically');});try{const conversation=await f.chat.create(f.owner);(await f.chat.store.begin(conversation.id,'Saved question','plan',randomUUID()));const restarted=new ChatStore(f.file);assert.equal((await restarted.recover()),1);const detail=(await restarted.read(conversation.id));assert.equal(detail.messages[0].content,'Saved question');assert.equal(detail.messages[1].status,'interrupted');assert.equal((await restarted.recover()),0);}finally{await f.close();}
});
test('chat APIs reject invalid scope, arbitrary permissions and cross-origin requests and document all paths',async()=>{
 const f=await fixture(async()=> 'Safe reply');try{
  assert.equal((await f.app.inject({method:'POST',url:'/api/v1/chats',payload:{owner:'../outside'}})).statusCode,400);
  assert.equal((await f.app.inject({method:'POST',url:'/api/v1/chats',headers:{origin:'https://other.invalid'},payload:{owner:f.owner}})).statusCode,403);
  const created=await f.app.inject({method:'POST',url:'/api/v1/chats',payload:{owner:f.owner}});assert.equal(created.statusCode,201);const {id}=created.json();
  assert.equal((await f.app.inject(`/api/v1/chats/${randomUUID()}`)).statusCode,404);assert.equal((await f.app.inject('/api/v1/chats/bad-id')).statusCode,400);
  for(const input of [{content:'Hello',mode:'code',requestId:randomUUID()},{content:' ',mode:'explore',requestId:randomUUID()},{content:'Hello',mode:'explore',requestId:randomUUID(),command:'anything'}]) assert.equal((await f.app.inject({method:'POST',url:`/api/v1/chats/${id}/messages`,payload:input})).statusCode,400);
  assert.equal((await f.app.inject({method:'POST',url:`/api/v1/chats/${id}/messages`,payload:{content:'Hello',mode:'explore',requestId:randomUUID()}})).statusCode,202);await finished(f.chat,id);
  assert.equal((await f.app.inject(`/api/v1/chats/${id}`)).json().messages.length,2);
  assert.ok((await f.app.inject('/api/openapi.json')).json().paths['/api/v1/chats/{id}/messages'].post.operationId);
 }finally{await f.close();}
});
test('chat SSE starts with saved state, streams activity and closes cleanly',async()=>{
 const f=await fixture(async input=>{input.onActivity?.('codex','Inspecting selected project');await new Promise(resolve=>setTimeout(resolve,20));return 'Inspection complete';});const controller=new AbortController();
 try{const conversation=await f.chat.create(f.owner);const address=await f.app.listen({port:0,host:'127.0.0.1'});const response=await fetch(`${address}/api/v1/chats/${conversation.id}/stream`,{signal:controller.signal});assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/snapshot/);
  await f.chat.send(conversation.id,'Inspect','explore',randomUUID());const update=await reader.read();assert.match(new TextDecoder().decode(update.value),/running|Inspecting/);await finished(f.chat,conversation.id);controller.abort();
 }finally{controller.abort();await f.close();}
});
test('agent chat direct links restore project and mode while validating IDs and omitting draft content',()=>{const id=randomUUID();assert.equal(parseLocation(`/agent-chat/${id}?mode=plan&owner=apps%2Fexample&content=secret`).canonical,`/agent-chat/${id}?mode=plan`);assert.equal(parseLocation('/agent-chat?owner=devkit%2Fcodeitz&mode=review').page,'agent-chat');assert.equal(parseLocation('/agent-chat/bad').page,'missing');});
