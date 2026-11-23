import { productCheckCatalog } from '../../../../contracts/audit.ts';
const text = { type: 'string' };
const report = { type: 'object', required: ['passed', 'productsChecked', 'ownersChecked', 'violations', 'checkedAt', 'durationMs'], properties: {
  passed: { type: 'boolean' }, productsChecked: { type: 'integer' }, ownersChecked: { type: 'integer' }, checkedAt: text, durationMs: { type: 'number' },
  violations: { type: 'array', items: { type: 'object', properties: { owner: text, rule: text, message: text } } },
} };
export const auditOperations = {
  'GET /api/v1/platform/config': { operationId: 'getPlatformPresentation', summary: 'Read public authentication availability', response: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } } },
  'GET /api/v1/workspace': { operationId: 'getPlatformWorkspace', summary: 'Read the authenticated Platform workspace scope', response: { type: 'object' } },
  'GET /api/v1/audit/products': { operationId: 'listAuditProducts', summary: 'Discover products and selectable governance checks', response: { type: 'object', properties: { products: { type: 'array', items: { type: 'object', properties: { owner: text, name: text } } }, checksPerProduct: { type: 'integer' }, checks: { type: 'array', items: { type: 'object', properties: { id: text, label: text, description: text } } } } } },
  'POST /api/v1/audit/products/run': { operationId: 'runProductAudits', summary: 'Stream selected product checks; omitted filters run all', body: { type: 'object', additionalProperties: false, properties: { owner: { type: 'string', minLength: 1, maxLength: 150 }, checkIds: { type: 'array', minItems: 1, maxItems: productCheckCatalog.length, uniqueItems: true, items: { type: 'string', enum: productCheckCatalog.map(check => check.id) } } } }, media: 'application/x-ndjson', response: { type: 'string', description: 'One JSON event per line: run-start, owner-start, check, owner-complete, owner-error, run-error, run-complete. Check and owner results contain real violations and progress.' } },
  'POST /api/v1/audit/run': { operationId: 'runWorkspaceAudit', summary: 'Audit owner structures, governance links and Codeitz routing', body: { type: 'object', additionalProperties: false }, response: report },
};
