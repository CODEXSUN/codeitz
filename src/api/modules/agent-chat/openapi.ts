import { z } from 'zod';
import { chatCreate, chatSend } from '../../../../contracts/chat.ts';
const text = z.string();
const conversation = z.object({ id:z.string().uuid(), owner:text,title:text,createdAt:text,updatedAt:text });
const message = z.object({ id:z.string().uuid(),role:z.enum(['user','assistant']),content:text,mode:z.enum(['explore','plan','review']),status:z.enum(['completed','running','failed','stopped','interrupted']),createdAt:text,updatedAt:text });
const detail = z.toJSONSchema(z.object({ conversation,messages:z.array(message),activities:z.array(z.object({ id:z.number(),kind:text,message:text,time:text })),taskLinks:z.array(z.object({ messageId:z.string().uuid(),taskId:z.string().uuid(),approvedAt:text,state:z.enum(['pending','ready']) })) }));
export const chatOperations = {
 'GET /api/v1/chats': { operationId:'listChats',summary:'Read the latest 100 saved conversations from PostgreSQL',response:z.toJSONSchema(z.object({ conversations:z.array(conversation) })) },
 'GET /api/v1/chats/setup': { operationId:'getChatSetup',summary:'Discover projects and inspect the existing local Codex sign-in; no login flow',response:{ type:'object',properties:{ projects:{ type:'array',items:{ type:'object',properties:{ owner:{type:'string'},name:{type:'string'} } } },codex:{ type:'object',properties:{ available:{type:'boolean'},signedIn:{type:'boolean'},version:{type:'string'},message:{type:'string'} } } } } },
 'POST /api/v1/chats': { operationId:'createChat',summary:'Create a project-scoped conversation',status:'201',body:z.toJSONSchema(chatCreate),response:z.toJSONSchema(conversation) },
 'GET /api/v1/chats/{id}': { operationId:'readChat',summary:'Read up to 200 saved messages and 100 public activity events',response:detail },
 'POST /api/v1/chats/{id}/messages': { operationId:'sendChatMessage',summary:'Persist a turn and start a read-only local Codex reply; request ID prevents duplicate retries',status:'202',body:z.toJSONSchema(chatSend),response:detail },
 'POST /api/v1/chats/{id}/tasks': { operationId:'createTaskFromChatPlan',summary:'Explicitly approve a completed Plan-mode reply and create one same-project planned task. Coding approval is separate; retries reuse its PostgreSQL link.',body:z.toJSONSchema(z.object({ messageId:z.string().uuid(),approvePlan:z.literal(true) }).strict()),response:{type:'object',properties:{taskId:{type:'string',format:'uuid'},conversation:detail}} },
 'POST /api/v1/chats/{id}/stop': { operationId:'stopChatReply',summary:'Stop the active reply in this conversation and retain its records',body:z.toJSONSchema(z.object({}).strict()),response:{type:'object',properties:{stopped:{type:'boolean'}}} },
 'GET /api/v1/chats/{id}/stream': { operationId:'streamChat',summary:'Stream persisted chat snapshots and public activity; reconnect restores the current state',media:'text/event-stream',response:{type:'string',description:'SSE data contains {type: snapshot, data: chat detail}; heartbeat comments keep the stream open.'} },
};
