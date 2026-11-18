import { requireLocalRequest, type createHttpServer } from '@workspace/framework';
import { z } from 'zod';
import { todoFields, todoInput, todoId } from '../../../../contracts/todo.ts';
import { listProducts } from '../governance-audit/index.ts';
import { PostgresTodoRepository } from './repository.ts';
import { openDatabase } from '../../database.ts';
import { TodoError, type TodoRepository } from './service.ts';
import type { TodoSnapshot } from '../../../../contracts/todo.ts';
export function registerTodoRoutes(app: ReturnType<typeof createHttpServer>, workspace: string, appRoot: string, store: TodoRepository = new PostgresTodoRepository(openDatabase())) {
  const revision = z.number().int().nonnegative();
  const params = z.object({ id: todoId });
  async function data() {
    const projects = (await listProducts(workspace)).map(product => ({ id: product.owner, name: product.name, icon: product.name.slice(0, 2).toUpperCase() }));
    return { projects };
  }
  function decorate(snapshot: TodoSnapshot, catalog: Awaited<ReturnType<typeof data>>) { return { ...snapshot, ...catalog }; }
  async function validProject(projectId?: string) {
    if (projectId && !(await data()).projects.some(project => project.id === projectId)) throw new TodoError('Select an existing workspace project.', 400);
  }
  let scheduleTimer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', async () => {
    await store.read();
    await store.deliverDue();
    let scanning = false;
    scheduleTimer = setInterval(async () => {
      if (scanning) return; scanning = true;
      try { await store.deliverDue(); } catch (error) { app.log.error({ err: error }, 'Todo reminder scan failed'); }
      finally { scanning = false; }
    }, 15000); scheduleTimer.unref();
  });
  app.addHook('onClose', async () => { clearInterval(scheduleTimer); await store.close?.(); });
  const options = { preHandler: requireLocalRequest };
  app.get('/api/v1/todos', options, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store'); return decorate(await store.read(), await data());
  });
  app.post('/api/v1/todos/categories', options, async (request, reply) => {
    const body = z.object({ revision, name: z.string().trim().min(1).max(80) }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ message: 'Enter a category name.' });
    try { const catalog = await data(); return reply.code(201).send(decorate(await store.createCategory(body.data.revision, body.data.name), catalog)); }
    catch (error) { if (error instanceof TodoError) return reply.code(error.statusCode).send({ message: error.message }); throw error; }
  });
  app.patch('/api/v1/todos/categories', options, async (request, reply) => {
    const body = z.object({ revision, name: z.string().trim().min(1).max(80), nextName: z.string().trim().min(1).max(80) }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ message: 'Enter valid category names.' });
    try { const catalog = await data(); return decorate(await store.changeCategory(body.data.revision, body.data.name, body.data.nextName), catalog); }
    catch (error) { if (error instanceof TodoError) return reply.code(error.statusCode).send({ message: error.message }); throw error; }
  });
  app.delete('/api/v1/todos/categories', options, async (request, reply) => {
    const body = z.object({ revision, name: z.string().trim().min(1).max(80) }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ message: 'Choose a valid category.' });
    try { const catalog = await data(); return decorate(await store.changeCategory(body.data.revision, body.data.name), catalog); }
    catch (error) { if (error instanceof TodoError) return reply.code(error.statusCode).send({ message: error.message }); throw error; }
  });
  app.post('/api/v1/todos', options, async (request, reply) => {
    const body = z.object({ revision, input: todoInput }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ message: 'Enter a todo title and valid options.' });
    try {
      const input = { priority: 'medium', category: '', dueDate: '', scheduledAt: '', status: 'open', projectId: '', visibility: 'private', ...body.data.input } as z.infer<typeof todoFields>;
      await validProject(input.projectId); const catalog = await data();
      return reply.code(201).send(decorate(await store.create(body.data.revision, input), catalog));
    } catch (error) { if (error instanceof TodoError) return reply.code(error.statusCode).send({ message: error.message }); throw error; }
  });
  app.patch('/api/v1/todos/:id', options, async (request, reply) => {
    const id = params.safeParse(request.params);
    const body = z.object({ revision, changes: todoFields.partial().refine(value => Object.keys(value).length > 0) }).strict().safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ message: 'Choose a valid todo and changes.' });
    try { await validProject(body.data.changes.projectId); const catalog = await data(); return decorate(await store.update(body.data.revision, id.data.id, body.data.changes), catalog); }
    catch (error) { if (error instanceof TodoError) return reply.code(error.statusCode).send({ message: error.message }); throw error; }
  });
  app.delete('/api/v1/todos/:id', options, async (request, reply) => {
    const id = params.safeParse(request.params); const body = z.object({ revision }).strict().safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ message: 'Choose a valid todo.' });
    try { const catalog = await data(); return decorate(await store.remove(body.data.revision, id.data.id), catalog); }
    catch (error) { if (error instanceof TodoError) return reply.code(error.statusCode).send({ message: error.message }); throw error; }
  });
  app.post('/api/v1/todos/reorder', options, async (request, reply) => {
    const body = z.object({ revision, orderedIds: z.array(todoId).max(10000) }).strict().safeParse(request.body);
    if (!body.success) return reply.code(400).send({ message: 'Provide a valid todo order.' });
    try { const catalog = await data(); return decorate(await store.reorder(body.data.revision, body.data.orderedIds), catalog); }
    catch (error) { if (error instanceof TodoError) return reply.code(error.statusCode).send({ message: error.message }); throw error; }
  });
}
