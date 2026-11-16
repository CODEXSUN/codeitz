import { loadCodeitzConfig } from '../../config.ts';
import { auditWorkspace } from './audit.ts';
import type { AuditReport } from '../../../../contracts/audit.ts';

export const defaultAuditRoot = loadCodeitzConfig().auditRoot;

/** Shared runner for the frontend API and local audit command. */
export async function runGovernanceAudit(root = defaultAuditRoot): Promise<AuditReport> {
  const started = performance.now();
  const result = await auditWorkspace(root);
  return { ...result, checkedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started) };
}
