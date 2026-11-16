import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { auditOwner } from './owner.ts';
import type { Product, ProductAuditEvent, ProductAuditReport } from '../../../../contracts/audit.ts';
import { productCheckCatalog, type ProductCheckId } from '../../../../contracts/audit.ts';

export const productCheckCount = productCheckCatalog.length;
export async function listProducts(workspaceRoot: string): Promise<Product[]> {
  const root = await realpath(workspaceRoot);
  const products: Product[] = [];
  for (const area of ['apps', 'devkit']) {
    const directory = await realpath(path.join(root, area));
    if (path.dirname(directory) !== root) throw new Error('Product area is outside the workspace.');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) products.push({ owner: `${area}/${entry.name}`, name: entry.name });
    }
  }
  products.push({ owner: 'infrastructure/database-manager', name: 'database-manager' });
  return products.sort((a, b) => a.owner.localeCompare(b.owner));
}

export async function runProductAudits(workspaceRoot: string, owners: string[], send: (event: ProductAuditEvent) => void, cancelled = () => false, selectedCheckIds: ProductCheckId[] = productCheckCatalog.map(check => check.id)) {
  const root = await realpath(workspaceRoot);
  send({ type: 'run-start', owners });
  for (const owner of owners) {
    if (cancelled()) return;
    const start = performance.now();
    send({ type: 'owner-start', owner, totalChecks: selectedCheckIds.length });
    try {
      let completedChecks = 0;
      const result = await auditOwner(root, owner, check => {
        if (!cancelled()) send({ type: 'check', owner, check, completedChecks: ++completedChecks, totalChecks: selectedCheckIds.length });
      }, true, selectedCheckIds);
      const report: ProductAuditReport = { owner, passed: result.violations.length === 0, ...result, selectedCheckIds, checkedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - start) };
      if (!cancelled()) send({ type: 'owner-complete', owner, report });
    } catch {
      if (!cancelled()) send({ type: 'owner-error', owner, message: 'Product audit could not finish. Check file access and retry.' });
    }
  }
  if (!cancelled()) send({ type: 'run-complete' });
}
