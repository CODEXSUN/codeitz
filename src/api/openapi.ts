import {syncOperations} from './modules/sync/openapi.ts';
import { githubManagerPaths } from './modules/github-manager/openapi.ts';
import { projectManagerSpecification } from './modules/projects/openapi.ts';
import { workTaskOperations } from './modules/business/task/openapi.ts';
import { chatOperations } from './modules/agent-chat/openapi.ts';
import { todoOperations } from './modules/todos/openapi.ts';
import { requireLocalRequest, type createHttpServer } from '@workspace/framework';
import { taskOperations } from './modules/task-runner/openapi.ts';
import { auditOperations } from './modules/governance-audit/openapi.ts';
import packageInfo from '../../package.json' with { type: 'json' };
type Operation = { operationId: string; summary: string; response: object; body?: object; media?: string; status?: string; parameters?: object[]; specification?: Record<string, any> };
export const operations: Record<string, Operation> = { ...syncOperations, ...taskOperations, ...auditOperations, ...todoOperations, ...chatOperations, ...workTaskOperations };
for (const [url, methods] of Object.entries({ ...projectManagerSpecification.paths, ...githubManagerPaths })) {
  if (!url.startsWith('/api/v1/')) continue;
  for (const [method, value] of Object.entries(methods)) {
    const specification = value as Record<string, any>;
    operations[`${method.toUpperCase()} ${url}`] = { operationId: specification.operationId, summary: specification.summary, response: {}, specification };
  }
}
export function registerApiDocumentation(app: ReturnType<typeof createHttpServer>) {
  const paths: Record<string, Record<string, object>> = {};
  // Capture the actual registered canonical routes; missing documentation fails startup.
  app.addHook('onRoute', route => {
    if (!route.url.startsWith('/api/v1/')) return;
    const url = route.url.replace(/:([a-zA-Z]+)/g, '{$1}');
    for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
      if (method === 'HEAD') continue;
      const operation = operations[`${method} ${url}`];
      if (!operation) throw new Error(`Missing API documentation: ${method} ${url}`);
      if (operation.specification) {
        (paths[url] ??= {})[method.toLowerCase()] = { ...operation.specification, description: url.startsWith('/api/v1/sync/exchange') ? operation.specification.description : 'Local loopback access only. ' + operation.specification.description };
        continue;
      }
      const error = { description: 'Validation, permission, domain or workspace failure; message explains the error', content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string' } } } } } };
      (paths[url] ??= {})[method.toLowerCase()] = {
        operationId: operation.operationId, summary: operation.summary,
        tags: [url.includes('/work-tasks') ? 'Work tasks' : url.includes('/chats') ? 'Agent chat' : url.includes('/todos') ? 'Todos' : url.includes('/tasks') ? 'Task runner' : 'Governance audit'],
        description: 'Local loopback access only. Same-origin requests only; write requests require JSON. URL values do not grant execution approval.',
        parameters: operation.parameters ?? (url.includes('{id}') ? [{ name: 'id', in: 'path', required: true, schema: url.includes('/work-tasks') ? { type: 'string', pattern: '^[a-z0-9]{8}$' } : url.includes('/todos') ? { type: 'string', pattern: '^(?:[a-z0-9]{8}|[0-9a-fA-F-]{36})$' } : { type: 'string', format: 'uuid' } }] : []),
        ...(operation.body ? { requestBody: { required: url.includes('/work-tasks') || url.includes('/chats') || url.includes('/todos') || url === '/api/v1/tasks' || url.endsWith('/step') || url.endsWith('/review') || url.endsWith('/manage'), content: { 'application/json': { schema: operation.body } } } } : {}),
        responses: { [operation.status ?? '200']: { description: 'Successful operation', content: { [operation.media ?? 'application/json']: { schema: operation.response } } }, '400': error, '403': error, ...(method === 'POST' && url.includes('/tasks') ? { '409': error } : {}), ...(url.includes('/chats') ? { '404':error,'409':error,'500':error } : {}), ...(url.includes('/work-tasks') ? { '404':error,'409':error,'500':error } : {}), ...(url.includes('/todos') ? { '404': error, '409': error, '500': error } : {}), ...(url.includes('/audit/') ? { '404': error, '503': error } : {}) },
      };
    }
  });
  app.get('/api/openapi.json', { preHandler: requireLocalRequest }, async () => ({ openapi: '3.1.0', info: { title: 'Codeitz API', version: packageInfo.version }, servers: [{ url: '/' }], components: {...projectManagerSpecification.components,securitySchemes:{ConnectedApp:{type:'apiKey',in:'header',name:'Authorization',description:'token APP_TOKEN:APP_SECRET'}}}, paths }));
  app.get('/api/docs', { preHandler: requireLocalRequest }, async (_request, reply) => {
    reply.header('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const rows = Object.entries(paths).flatMap(([url, methods]) => Object.entries(methods).map(([method, value]) => `<li><strong>${method.toUpperCase()} ${url}</strong> — ${(value as { summary: string }).summary}</li>`)).join('');
    return reply.type('text/html; charset=utf-8').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Codeitz API docs</title><h1>Codeitz API</h1><p>Local-only API. Same-origin JSON writes. Planning and approved coding remain separate.</p><p><a href="/api/openapi.json">OpenAPI specification: parameters, bodies, responses and errors</a></p><ul>${rows}</ul><p>Legacy /api/tasks aliases are deprecated; integrated projects use the runner directly. /api/health is the shared framework health probe.</p></html>`);
  });
}
