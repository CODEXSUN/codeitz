import { requireLocalRequest, type createHttpServer } from '@workspace/framework';
import { z } from 'zod';
import { workspaceKinds } from '../../../../contracts/workspace.ts';
import { registerModuleRoutes } from './module-routes.ts';
import { registerNoteRoutes } from './notes-routes.ts';
import { Projects } from './application/service.ts';
export function registerProjectRoutes(app: ReturnType<typeof createHttpServer>, projects: Projects) {
  registerNoteRoutes(app,projects);
  registerModuleRoutes(app,projects);
  app.get('/api/v1/projects', { preHandler: requireLocalRequest }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { return await projects.overview(); } catch (error) { return reply.code(503).send({ message: error instanceof Error ? error.message : 'Project list unavailable.' }); }
  });
  app.post('/api/v1/projects', { preHandler: requireLocalRequest }, async (request, reply) => {
    const input = z.object({ name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(63), area: z.enum(['apps', 'devkit']), port: z.number().int().min(1024).max(65535), purpose: z.string().trim().min(1).max(2000), orderNo:z.number().int().min(1).max(2147483647).optional(), active:z.boolean().default(true) }).strict().safeParse(request.body);
    if (!input.success) return reply.code(400).send({ message: 'Enter a lowercase project name, area, port, and purpose.' });
    reply.hijack(); reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const send = (event: unknown) => { if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(JSON.stringify(event) + '\n'); };
    try { const project = await projects.create(input.data, send); send({ type: 'complete', project }); }
    catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : 'Creation failed. Inspect the target before retrying.' }); }
    finally { reply.raw.end(); }
  });
  const scope = z.object({ area: z.enum(['apps', 'devkit']), name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(63) });
  app.get('/api/v1/projects/:area/:name/blueprint',{preHandler:requireLocalRequest},async(request,reply)=>{const params=scope.safeParse(request.params);if(!params.success)return reply.code(400).send({message:'Invalid project.'});reply.header('Cache-Control','no-store');try{return await projects.blueprint(`${params.data.area}/${params.data.name}`);}catch{return reply.code(404).send({message:'Project blueprint unavailable.'});}});
  app.patch('/api/v1/projects/:area/:name', {preHandler:requireLocalRequest}, async(request,reply)=>{
    const params=scope.safeParse(request.params);
    const input=z.object({orderNo:z.number().int().min(1).max(2147483647),active:z.boolean()}).strict().safeParse(request.body);
    if(!params.success||!input.success)return reply.code(400).send({message:'Enter a positive order number and active status.'});
    try{return await projects.update(`${params.data.area}/${params.data.name}`,input.data);}
    catch(error){return reply.code(409).send({message:error instanceof Error?error.message:'Project update failed.'});}
  });
  app.get('/api/v1/projects/:area/:name/workspace', { preHandler: requireLocalRequest }, async (request, reply) => {
    const params = scope.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: 'Invalid project.' });
    reply.header('Cache-Control', 'no-store');
    try { return await projects.workspace(`${params.data.area}/${params.data.name}`); }
    catch (error) { return reply.code(404).send({ message: error instanceof Error ? error.message : 'Project unavailable.' }); }
  });
  const schemaFields = z.array(z.object({ name: z.string().trim().min(1).max(100), type: z.enum(['TEXT','INTEGER','REAL','BLOB','BOOLEAN','TIMESTAMP','JSON']), required: z.boolean(), primary: z.boolean(), reference: z.string().max(200) }).strict()).max(200).refine(fields => new Set(fields.map(field => field.name.toLowerCase())).size === fields.length, 'Column names must be unique.');
  const architecture = z.object({ blocks: z.array(z.object({ id: z.string().uuid(), name: z.string().max(200), type: z.string().max(100), description: z.string().max(5000), x: z.number().min(0).max(530), y: z.number().min(0).max(490) }).strict()).max(200), connections: z.array(z.object({ from: z.string().uuid(), to: z.string().uuid() }).strict()).max(500) }).strict().refine(document => new Set(document.blocks.map(b=>b.id)).size === document.blocks.length && document.connections.every(edge=>edge.from!==edge.to&&document.blocks.some(b=>b.id===edge.from)&&document.blocks.some(b=>b.id===edge.to)), 'Connections must refer to existing blocks.');
  const scene = z.object({ elements: z.array(z.object({ id: z.string(), type: z.string(), version: z.number(), x: z.number(), y: z.number() }).passthrough()).max(10000), appState: z.record(z.string(),z.unknown()).optional(), files: z.record(z.string(),z.unknown()).optional() }).passthrough();
  app.post('/api/v1/projects/:area/:name/workspace/:kind', { preHandler: requireLocalRequest, bodyLimit: 12 * 1024 * 1024 }, async (request, reply) => {
    const params = scope.extend({ kind: z.enum(workspaceKinds) }).safeParse(request.params);
    const input = z.object({ id: z.string().uuid().optional(), revision: z.number().int().positive().optional(), title: z.string().trim().min(1).max(200), content: z.string().max(10 * 1024 * 1024), status: z.enum(['draft','active','completed']), properties: z.object({ category: z.string().trim().min(1).max(100), assignedTo: z.string().trim().max(200) }).strict().optional() }).strict().safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ message: 'Enter a title and valid project content.' });
    try {
      if (input.data.properties && params.data.kind !== 'notes') throw new Error('Properties are supported for notes only.');
      if (params.data.kind === 'schemas') schemaFields.parse(JSON.parse(input.data.content));
      if (params.data.kind === 'architectures') architecture.parse(JSON.parse(input.data.content));
      if (params.data.kind === 'whiteboards') scene.parse(JSON.parse(input.data.content));
      return await projects.saveWorkspace(`${params.data.area}/${params.data.name}`, params.data.kind, input.data);
    } catch (error) { return reply.code(409).send({ message: error instanceof Error ? error.message : 'Save failed.' }); }
  });
  app.post('/api/v1/projects/:area/:name/tasks/:id/:action', { preHandler: requireLocalRequest }, async (request, reply) => {
    const params = scope.extend({ id: z.string().uuid(), action: z.enum(['audit','review']) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ message: 'Invalid task action.' });
    const input = (params.data.action === 'audit' ? z.object({}).strict() : z.object({ decision: z.enum(['accepted','changes_requested']), feedback: z.string().trim().max(3000).optional() }).strict()).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ message: 'Invalid review.' });
    try { return await projects.taskAction(`${params.data.area}/${params.data.name}`,params.data.id,params.data.action,input.data); }
    catch (error) { return reply.code(409).send({ message: error instanceof Error ? error.message : 'Task action failed.' }); }
  });
  app.post('/api/v1/projects/plan', { preHandler: requireLocalRequest }, async (request, reply) => {
    const input = z.object({ owner: z.string().regex(/^(apps|devkit)\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(80), goal: z.string().trim().min(1).max(3000) }).strict().safeParse(request.body);
    if (!input.success) return reply.code(400).send({ message: 'Choose a project and enter one goal.' });
    try { return reply.code(202).send(await projects.plan(input.data.owner, input.data.goal)); }
    catch (error) { return reply.code(409).send({ message: error instanceof Error ? error.message : 'Unable to create a Codeitz plan.' }); }
  });
}
