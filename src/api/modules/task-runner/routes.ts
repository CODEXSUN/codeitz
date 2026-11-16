import { requireLocalRequest, type createHttpServer } from '@workspace/framework';
import { z } from 'zod';
import path from 'node:path';
import { TaskRunner } from './application/service.ts';
import { codexStatus } from './infrastructure/codex.ts';
import { listProducts } from '../governance-audit/index.ts';

export function registerTaskRoutes(app: ReturnType<typeof createHttpServer>, workspace: string, appRoot: string, runner = new TaskRunner(workspace, path.join(appRoot, '.codeitz/tasks'))) {
  app.addHook('onClose', async () => { await runner.close(); });
  // Task execution is local-only and accepts same-origin JSON requests, not shell commands.
  const local = requireLocalRequest;
  app.get('/api/tasks', { preHandler: local }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { tasks: await runner.list() };
  });
  const streams = new Set<import('node:http').ServerResponse>();
  app.addHook('preClose', async () => { for (const stream of streams) stream.end(); });
  app.get('/api/tasks/stream', { preHandler: local }, async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    streams.add(reply.raw);
    let ready = false;
    const pending: unknown[] = [];
    const send = (data: unknown) => {
      if (reply.raw.destroyed || reply.raw.writableEnded) return;
      if (reply.raw.writableLength > 1024 * 1024) { reply.raw.end(); return; }
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    const unsubscribe = runner.subscribe(update => { if (ready) send(update); else pending.push(update); });
    const heartbeat = setInterval(() => { if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n'); }, 15000);
    reply.raw.once('close', () => { clearInterval(heartbeat); unsubscribe(); streams.delete(reply.raw); });
    try {
      send({ type: 'snapshot', tasks: await runner.list() }); ready = true;
      for (const update of pending) send(update);
    } catch { send({ type: 'error', message: 'Task stream could not read saved records.' }); reply.raw.end(); }
  });
  app.post('/api/tasks/:id/review', { preHandler: local }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const input = z.object({ decision: z.enum(['accepted', 'changes_requested']), feedback: z.string().trim().max(3000).optional() }).strict().safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ message: 'Choose a valid review decision.' });
    try { return await runner.review(params.data.id, input.data.decision, input.data.feedback); }
    catch (error) { return reply.code(409).send({ message: error instanceof Error ? error.message : 'Review could not be saved.' }); }
  });
  app.post('/api/tasks/:id/manage', { preHandler: local }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const input = z.object({ action: z.enum(['archive', 'restore', 'drop']) }).strict().safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ message: 'Choose a valid record action.' });
    try { return await runner.manage(params.data.id, input.data.action); }
    catch (error) { return reply.code(409).send({ message: error instanceof Error ? error.message : 'Record action failed.' }); }
  });
  app.post('/api/tasks/:id/audit', { preHandler: local }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: 'Choose a valid task.' });
    try { return await runner.audit(params.data.id); }
    catch (error) { return reply.code(409).send({ message: error instanceof Error ? error.message : 'Record audit failed.' }); }
  });
  app.get('/api/tasks/setup', { preHandler: local }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { products: await listProducts(workspace), codex: await codexStatus(appRoot) };
  });
  app.post('/api/tasks', { preHandler: local }, async (request, reply) => {
    const input = z.object({ owner: z.string().min(1).max(150), goal: z.string().trim().min(1).max(3000) }).strict().safeParse(request.body);
    if (!input.success) return reply.code(400).send({ message: 'Select an app and enter a goal.' });
    try { return reply.code(202).send(await runner.create(input.data.owner, input.data.goal)); }
    catch (error) { return reply.code(409).send({ message: error instanceof Error ? error.message : 'Task could not start.' }); }
  });
  app.post('/api/tasks/:id/step', { preHandler: local }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const input = z.object({ action: z.enum(['plan', 'code', 'check']) }).strict().safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ message: 'Choose a valid task step.' });
    try { return reply.code(202).send(await runner.step(params.data.id, input.data.action)); }
    catch (error) { return reply.code(409).send({ message: error instanceof Error ? error.message : 'Task step could not start.' }); }
  });
}
