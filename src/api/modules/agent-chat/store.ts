import {randomUUID} from 'node:crypto';
import {sql,type Kysely} from 'kysely';
import type {ChatDatabase} from './database/types.ts';
import type {Conversation,ChatMessage,ChatMode,ChatDetail,ChatTaskLink} from '../../../../contracts/chat.ts';
export class ChatError extends Error {statusCode:number;constructor(message:string,statusCode=409){super(message);this.statusCode=statusCode;}}
export class ChatStore {
 db:Kysely<ChatDatabase>;
 constructor(db:Kysely<ChatDatabase>){this.db=db;}
 private async conversation(db:Kysely<ChatDatabase>,id:string):Promise<Conversation>{const row=await db.selectFrom('agent_conversations').select(['id','owner','title','created_at as createdAt','updated_at as updatedAt']).where('id','=',id).executeTakeFirst();if(!row)throw new ChatError('Conversation not found.',404);return row;}
 async list(){return this.db.selectFrom('agent_conversations').select(['id','owner','title','created_at as createdAt','updated_at as updatedAt']).orderBy('updated_at','desc').limit(100).execute();}
 async create(owner:string,title='New chat'){const id=randomUUID(),now=new Date().toISOString();await this.db.insertInto('agent_conversations').values({id,owner,title,created_at:now,updated_at:now}).execute();return this.conversation(this.db,id);}
 async read(id:string):Promise<ChatDetail>{return this.db.transaction().setIsolationLevel('repeatable read').execute(async tx=>{
  const conversation=await this.conversation(tx,id);
  const messages=(await tx.selectFrom('agent_messages').select('body').where('chat_id','=',id).orderBy('position','desc').limit(200).execute()).reverse().map(row=>JSON.parse(row.body) as ChatMessage);
  const activities=(await tx.selectFrom('agent_chat_activity').select(['id','kind','message','time']).where('chat_id','=',id).orderBy('id','desc').limit(100).execute()).reverse();
  const taskLinks=await tx.selectFrom('agent_chat_task_links').select(['message_id as messageId','task_id as taskId','approved_at as approvedAt','state']).where('chat_id','=',id).execute();return {conversation,messages,activities,taskLinks};
 });}
 async begin(id:string,content:string,mode:ChatMode,requestId:string){return this.db.transaction().execute(async tx=>{
  await tx.selectFrom('agent_chat_state').select('id').where('id','=',1).forUpdate().executeTakeFirstOrThrow();
  const conversation=await this.conversation(tx,id),existing=await tx.selectFrom('agent_messages').selectAll().where('request_id','=',requestId).executeTakeFirst();
  if(existing){const body=JSON.parse(existing.body);if(existing.chat_id!==id||body.content!==content||body.mode!==mode)throw new ChatError('This request ID belongs to a different message.');const reply=await tx.selectFrom('agent_messages').select('id').where('reply_to','=',existing.id).executeTakeFirstOrThrow();return {started:false,assistantId:reply.id};}
  if(await tx.selectFrom('agent_messages').select('id').where(sql<boolean>`body::jsonb->>'status'='running'`).executeTakeFirst())throw new ChatError('A chat reply is running. Stop it or wait before sending another message.');
  const now=new Date().toISOString(),userId=randomUUID(),assistantId=randomUUID(),common={mode,createdAt:now,updatedAt:now};
  await tx.insertInto('agent_messages').values({id:userId,chat_id:id,body:JSON.stringify({...common,id:userId,role:'user',content,status:'completed'}),request_id:requestId,reply_to:null}).execute();
  await tx.insertInto('agent_messages').values({id:assistantId,chat_id:id,body:JSON.stringify({...common,id:assistantId,role:'assistant',content:'',status:'running'}),request_id:null,reply_to:userId}).execute();
  await tx.updateTable('agent_conversations').set({title:conversation.title==='New chat'?content.slice(0,70):conversation.title,updated_at:now}).where('id','=',id).execute();
  await tx.insertInto('agent_chat_activity').values({chat_id:id,kind:'status',message:'Local Codex reply started. Read-only project access.',time:now}).execute();return {started:true,assistantId};
 });}
 async activity(id:string,kind:string,message:string){await this.db.insertInto('agent_chat_activity').values({chat_id:id,kind,message,time:new Date().toISOString()}).execute();}
 async finish(id:string,assistantId:string,status:ChatMessage['status'],content:string){await this.db.transaction().execute(async tx=>{
  const row=await tx.selectFrom('agent_messages').select('body').where('id','=',assistantId).where('chat_id','=',id).forUpdate().executeTakeFirst();if(!row)throw new ChatError('Reply not found.',404);const message=JSON.parse(row.body);if(message.status!=='running')return;
  const now=new Date().toISOString();await tx.updateTable('agent_messages').set({body:JSON.stringify({...message,status,content,updatedAt:now})}).where('id','=',assistantId).execute();await tx.updateTable('agent_conversations').set({updated_at:now}).where('id','=',id).execute();await tx.insertInto('agent_chat_activity').values({chat_id:id,kind:'status',message:`Reply ${status}.`,time:now}).execute();
 });}
 async reservePlanTask(id:string,messageId:string){return this.db.transaction().execute(async tx=>{
  const conversation=await this.conversation(tx,id);await tx.selectFrom('agent_conversations').select('id').where('id','=',id).forUpdate().executeTakeFirstOrThrow();
  const row=await tx.selectFrom('agent_messages').selectAll().where('id','=',messageId).where('chat_id','=',id).executeTakeFirst();const message=row?JSON.parse(row.body) as ChatMessage:undefined;
  if(!message||message.role!=='assistant'||message.mode!=='plan'||message.status!=='completed'||!message.content.trim())throw new ChatError('Approve a completed Plan-mode reply from this conversation.');
  const original=await tx.selectFrom('agent_messages').select('body').where('id','=',row!.reply_to!).where('chat_id','=',id).executeTakeFirst();if(!original)throw new ChatError('The saved goal for this plan is unavailable.');
  let link=await tx.selectFrom('agent_chat_task_links').select(['message_id as messageId','task_id as taskId','approved_at as approvedAt','state']).where('message_id','=',messageId).executeTakeFirst();
  if(!link){link={messageId,taskId:randomUUID(),approvedAt:new Date().toISOString(),state:'pending'};await tx.insertInto('agent_chat_task_links').values({message_id:messageId,chat_id:id,task_id:link.taskId,approved_at:link.approvedAt,state:link.state}).execute();await tx.insertInto('agent_chat_activity').values({chat_id:id,kind:'approval',message:`Plan approved for task ${link.taskId}. Coding approval remains separate.`,time:link.approvedAt}).execute();}
  return {link,owner:conversation.owner,goal:(JSON.parse(original.body) as ChatMessage).content,plan:message.content};
 });}
 async completePlanTask(id:string,messageId:string,taskId:string){await this.db.transaction().execute(async tx=>{
  const changed=await tx.updateTable('agent_chat_task_links').set({state:'ready'}).where('chat_id','=',id).where('message_id','=',messageId).where('task_id','=',taskId).where('state','=','pending').returning('message_id').executeTakeFirst();if(changed)await tx.insertInto('agent_chat_activity').values({chat_id:id,kind:'task',message:`Task ${taskId} created from the approved plan. Open the task runner to approve coding.`,time:new Date().toISOString()}).execute();
 });}
 async recover(){return this.db.transaction().execute(async tx=>{
  await tx.selectFrom('agent_chat_state').select('id').where('id','=',1).forUpdate().executeTakeFirstOrThrow();const rows=await tx.selectFrom('agent_messages').selectAll().where(sql<boolean>`body::jsonb->>'status'='running'`).forUpdate().execute();const now=new Date().toISOString();
  for(const row of rows){await tx.updateTable('agent_messages').set({body:JSON.stringify({...JSON.parse(row.body),status:'interrupted',content:'Codeitz restarted before this reply finished. Send a new message to continue.',updatedAt:now})}).where('id','=',row.id).execute();await tx.insertInto('agent_chat_activity').values({chat_id:row.chat_id,kind:'status',message:'Reply interrupted by server restart.',time:now}).execute();}return rows.length;
 });}
}
