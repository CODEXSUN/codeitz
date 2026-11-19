import {SyncService} from './modules/sync/service.ts';
import {registerSyncRoutes} from './modules/sync/routes.ts';
import {TaskRunner} from './modules/task-runner/application/service.ts';
import {AgentChat} from './modules/agent-chat/service.ts';
import { openDatabase } from './database.ts';
import { Projects } from './modules/projects/application/service.ts';
import { registerProjectRoutes } from './modules/projects/routes.ts';
import { GitHubManager } from './modules/github-manager/service.ts';
import { registerGitHubManagerRoutes } from './modules/github-manager/routes.ts';
import { TaskRepository } from './modules/business/task/repository.ts';
import { PostgresTodoRepository } from './modules/todos/repository.ts';
import { TaskService } from './modules/business/task/service.ts';
import { registerWorkTaskRoutes } from './modules/business/task/routes.ts';
import { registerAgentChatRoutes } from './modules/agent-chat/routes.ts';
import type { TodoRepository } from './modules/todos/service.ts';
import { registerTodoRoutes } from './modules/todos/routes.ts';
import { registerApiDocumentation } from './openapi.ts';
import { createHttpServer, registerFrontend, requireLocalRequest,localRequestPolicy } from '@workspace/framework';
import { z } from 'zod';
import { defaultAuditRoot, runGovernanceAudit } from './modules/governance-audit/run.ts';
import { loadCodeitzConfig } from './config.ts';
import { listProducts, productCheckCount, runProductAudits } from './modules/governance-audit/products.ts';
import { productCheckCatalog, type ProductAuditEvent } from '../../contracts/audit.ts';
import { registerTaskRoutes } from './modules/task-runner/routes.ts';

export function createServer({ auditRoot = defaultAuditRoot, runtimeRoot, todoRepository, workTaskScheduling = true, workTaskService, projectDatabase, projectTaskRunner, runtimeDatabase, database, databaseFactory = openDatabase, syncScheduling = true }: { database?: ReturnType<typeof openDatabase>; databaseFactory?: typeof openDatabase; syncScheduling?:boolean; auditRoot?: string; runtimeRoot?: string; todoRepository?: TodoRepository; workTaskScheduling?: boolean; workTaskService?: TaskService; projectDatabase?: ReturnType<typeof openDatabase>; runtimeDatabase?: ReturnType<typeof openDatabase>; projectTaskRunner?: import('./modules/task-runner/index.ts').ProjectTaskRunner } = {}) {
  const config = loadCodeitzConfig();
  // Normal startup owns one bounded pool. Explicit targets remain caller-owned.
  const sharedDb = database ?? databaseFactory();
  const projectsDb = projectDatabase ?? sharedDb;
  const recordsDb = runtimeDatabase ?? sharedDb;
  let dependencyProbe: Promise<boolean> | undefined;
  const app = createHttpServer({ name: 'codeitz', logLevel: config.logLevel, readinessChecks: [signal => {
    if (signal.aborted) return false;
    dependencyProbe ??= projectsDb.selectFrom('sync_identity').select('origin').executeTakeFirstOrThrow()
      .then(() => true, () => false).finally(() => { dependencyProbe = undefined; });
    return dependencyProbe;
  }] });
  // Fastify close hooks run in reverse order: register ownership before module drains.
  if (!database) app.addHook('onClose', async () => { await sharedDb.destroy(); });
  if(config.values.CODEITZ_BIND_MODE==='docker-direct'){
    const local=localRequestPolicy((config.values.CODEITZ_DOCKER_PEERS??'').split(',').filter(Boolean));
    app.addHook('onRequest',local);
    app.addHook('onRoute',route=>{if(route.preHandler===requireLocalRequest)route.preHandler=local;else if(Array.isArray(route.preHandler))route.preHandler=route.preHandler.map(handler=>handler===requireLocalRequest?local:handler);});
  }
  registerApiDocumentation(app);
  registerWorkTaskRoutes(app, workTaskService ?? new TaskService(new TaskRepository(sharedDb, false)), workTaskScheduling);
  const taskRunner = registerTaskRoutes(app, auditRoot, runtimeRoot ?? config.appRoot, new TaskRunner(auditRoot,recordsDb));
  registerSyncRoutes(app,new SyncService(projectsDb),syncScheduling);
  registerProjectRoutes(app, new Projects(auditRoot, projectTaskRunner ?? taskRunner, projectsDb));
  registerGitHubManagerRoutes(app, new GitHubManager(auditRoot));
  for (const method of ['GET','POST','PATCH'] as const) app.route({ method, url: '/api/projects/*', bodyLimit: 12 * 1024 * 1024, preHandler: requireLocalRequest, handler: async(request,reply) => reply.redirect(request.url.replace('/api/projects','/api/v1/projects'),307) });
  for (const method of ['GET','POST'] as const) app.route({ method, url: '/api/projects', preHandler: requireLocalRequest, handler: async(request,reply) => reply.redirect(request.url.replace('/api/projects','/api/v1/projects'),307) });
  registerAgentChatRoutes(app, auditRoot, runtimeRoot ?? config.appRoot, new AgentChat(auditRoot,recordsDb), taskRunner);
  registerTodoRoutes(app, auditRoot, runtimeRoot ?? config.appRoot, todoRepository ?? new PostgresTodoRepository(sharedDb, undefined, false));
  app.get('/api/v1/audit/products', { preHandler: requireLocalRequest }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { return { products: await listProducts(auditRoot), checksPerProduct: productCheckCount, checks: productCheckCatalog }; }
    catch { return reply.code(503).send({ message: 'Product list unavailable. Check the workspace and retry.' }); }
  });
  app.post('/api/v1/audit/products/run', { preHandler: requireLocalRequest }, async (request, reply) => {
    const checkIds = productCheckCatalog.map(check => check.id);
    const input = z.object({
      owner: z.string().min(1).max(150).optional(),
      checkIds: z.array(z.enum(checkIds)).min(1).max(checkIds.length).refine(ids => new Set(ids).size === ids.length).optional(),
    }).strict().safeParse(request.body ?? {});
    if (!input.success) return reply.code(400).send({ message: 'Choose one product or run all products. No commands or workspace paths are accepted.' });
    let owners: string[];
    try {
      const products = await listProducts(auditRoot);
      if (input.data.owner && !products.some(product => product.owner === input.data.owner)) {
        return reply.code(404).send({ message: 'Product not found in the configured workspace.' });
      }
      owners = input.data.owner ? [input.data.owner] : products.map(product => product.owner);
    } catch { return reply.code(503).send({ message: 'Product list unavailable. Check the workspace and retry.' }); }
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    let cancelled = false;
    const onClose = () => { cancelled = true; };
    reply.raw.on('close', onClose);
    const send = (event: ProductAuditEvent) => { if (!cancelled) reply.raw.write(`${JSON.stringify(event)}\n`); };
    try { await runProductAudits(auditRoot, owners, send, () => cancelled, input.data.checkIds); }
    catch { send({ type: 'run-error', message: 'Audit stream could not finish. Retry the run.' }); }
    finally {
      reply.raw.off('close', onClose);
      if (!cancelled) reply.raw.end();
    }
  });
  app.post('/api/v1/audit/run', { preHandler: requireLocalRequest }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (request.body !== undefined && !z.object({}).strict().safeParse(request.body).success) {
      return reply.code(400).send({ message: 'This audit accepts no commands or workspace overrides.' });
    }
    try {
      return await runGovernanceAudit(auditRoot);
    } catch {
      return reply.code(503).send({ message: 'Workspace audit could not finish. Check the configured workspace and file access.' });
    }
  });
  registerFrontend(app, config.webRoot);
  return app;
}
