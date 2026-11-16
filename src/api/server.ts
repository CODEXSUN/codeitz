import { createHttpServer, registerFrontend } from '@workspace/framework';
import { z } from 'zod';
import { defaultAuditRoot, runGovernanceAudit } from './modules/governance-audit/run.ts';
import { loadCodeitzConfig } from './config.ts';
import { listProducts, productCheckCount, runProductAudits } from './modules/governance-audit/products.ts';
import { productCheckCatalog, type ProductAuditEvent } from '../../contracts/audit.ts';
import { registerTaskRoutes } from './modules/task-runner/routes.ts';

export function createServer({ auditRoot = defaultAuditRoot }: { auditRoot?: string } = {}) {
  const config = loadCodeitzConfig();
  const app = createHttpServer({ name: 'codeitz', logLevel: config.logLevel });
  registerTaskRoutes(app, auditRoot, config.appRoot);
  app.get('/api/audit/products', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { return { products: await listProducts(auditRoot), checksPerProduct: productCheckCount, checks: productCheckCatalog }; }
    catch { return reply.code(503).send({ message: 'Product list unavailable. Check the workspace and retry.' }); }
  });
  app.post('/api/audit/products/run', async (request, reply) => {
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
  app.post('/api/audit/run', async (request, reply) => {
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
