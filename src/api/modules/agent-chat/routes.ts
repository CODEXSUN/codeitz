import type { ChatPlanTaskCreator } from '../../../../contracts/task.ts';
import { requireLocalRequest, type createHttpServer } from '@workspace/framework';
import path from 'node:path';
import { z } from 'zod';
import { AgentChat } from './service.ts';
import { ChatError } from './store.ts';
import { chatCreate, chatSend } from '../../../../contracts/chat.ts';
import { listProducts } from '../governance-audit/index.ts';
import { checkCodexConnection } from '../task-runner/index.ts';
export function registerAgentChatRoutes(app: ReturnType<typeof createHttpServer>, workspace: string, appRoot: string, chat = new AgentChat(workspace,undefined), taskRunner?: ChatPlanTaskCreator) {
  const options = { preHandler: requireLocalRequest };
  const params = z.object({ id:z.string().uuid() });
  const streams = new Set<import('node:http').ServerResponse>();
  app.addHook('onReady', async () => { await chat.store.recover(); });
  app.addHook('preClose', async () => { for (const stream of streams) stream.end(); });
  app.addHook('onClose', async () => { await chat.close(); });
  app.get('/api/v1/chats', options, async (_request,reply) => { reply.header('Cache-Control','no-store'); await chat.flushPending(); return { conversations:await chat.store.list() }; });
  app.get('/api/v1/chats/setup', options, async () => ({ projects:await listProducts(workspace), codex:await checkCodexConnection(appRoot) }));
  app.post('/api/v1/chats', options, async (request,reply) => {
    const input = chatCreate.safeParse(request.body); if (!input.success) return reply.code(400).send({ message:'Select an existing workspace project.' });
    try { return reply.code(201).send(await chat.create(input.data.owner)); } catch (error) { if (error instanceof ChatError) return reply.code(error.statusCode).send({ message:error.message }); throw error; }
  });
  app.get('/api/v1/chats/:id', options, async (request,reply) => {
    const id = params.safeParse(request.params); if (!id.success) return reply.code(400).send({ message:'Choose a valid conversation.' });
    reply.header('Cache-Control','no-store');
    try { return await chat.read(id.data.id); } catch (error) { if (error instanceof ChatError) return reply.code(error.statusCode).send({ message:error.message }); throw error; }
  });
  app.post('/api/v1/chats/:id/messages', options, async (request,reply) => {
    const id = params.safeParse(request.params); const input = chatSend.safeParse(request.body);
    if (!id.success || !input.success) return reply.code(400).send({ message:'Enter a message and valid chat mode.' });
    try { return reply.code(202).send(await chat.send(id.data.id,input.data.content,input.data.mode,input.data.requestId)); }
    catch (error) { if (error instanceof ChatError) return reply.code(error.statusCode).send({ message:error.message }); throw error; }
  });
  app.post('/api/v1/chats/:id/tasks', options, async (request,reply) => {
    const id = params.safeParse(request.params);
    const input = z.object({ messageId: z.string().uuid(), approvePlan: z.literal(true) }).strict().safeParse(request.body);
    if (!id.success || !input.success) return reply.code(400).send({ message: 'Approve a saved chat plan to create its task. Coding approval is separate.' });
    if (!taskRunner) return reply.code(409).send({ message: 'Task runner connection is unavailable.' });
    try { return await chat.createPlanTask(id.data.id,input.data.messageId,taskRunner); }
    catch (error) { return reply.code(error instanceof ChatError ? error.statusCode : 409).send({ message: error instanceof Error ? error.message : 'Task could not be created. Retry the same plan.' }); }
  });
  app.post('/api/v1/chats/:id/stop', options, async (request,reply) => {
    const id = params.safeParse(request.params);
    if (!id.success || !z.object({}).strict().safeParse(request.body ?? {}).success) return reply.code(400).send({ message:'Choose a valid conversation.' });
    try { return await chat.stop(id.data.id); } catch (error) { if (error instanceof ChatError) return reply.code(error.statusCode).send({ message:error.message }); throw error; }
  });
  app.get('/api/v1/chats/:id/stream', options, async (request,reply) => {
    const id = params.safeParse(request.params); if (!id.success) return reply.code(400).send({ message:'Choose a valid conversation.' });
    try { await chat.store.read(id.data.id); } catch (error) { if (error instanceof ChatError) return reply.code(error.statusCode).send({ message:error.message }); throw error; }
    reply.hijack(); reply.raw.writeHead(200,{ 'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no' }); streams.add(reply.raw);
    let reading = false, dirty = false;
    const send = async () => {
      if (reading) { dirty = true; return; }
      reading = true;
      try {
      do {
      dirty = false;
      if (reply.raw.destroyed || reply.raw.writableEnded) return;
      if (reply.raw.writableLength > 1024*1024) { reply.raw.end(); return; }
      try {
        const data = await chat.store.read(id.data.id);
        if (reply.raw.destroyed || reply.raw.writableEnded) return;
        reply.raw.write(`data: ${JSON.stringify({ type:'snapshot', data })}\n\n`);
      }
      catch { reply.raw.end(); }
      } while (dirty && !reply.raw.destroyed && !reply.raw.writableEnded);
      } finally { reading = false; }
    };
    const unsubscribe = chat.subscribe(changed => { if (changed === id.data.id) send(); });
    const heartbeat = setInterval(() => { if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(': heartbeat\n\n'); },15000);
    reply.raw.once('close',() => { clearInterval(heartbeat); unsubscribe(); streams.delete(reply.raw); }); send();
  });
}
