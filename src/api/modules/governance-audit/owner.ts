import { stat, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuditCheck, AuditReport } from '../../../../contracts/audit.ts';

export async function inScopeExists(root: string, target: string, directory: boolean) {
  try {
    const info = await stat(target);
    const relative = path.relative(root, await realpath(target));
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) &&
      (directory ? info.isDirectory() : info.isFile());
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
}

export async function auditOwner(root: string, owner: string, onCheck?: (check: AuditCheck) => void, includeGovernance = false, selectedIds?: readonly string[]) {
  const ownerRoot = path.resolve(root, owner);
  if (!ownerRoot.startsWith(root + path.sep)) throw new Error('Owner is outside the workspace.');
  const governance = path.join(root, 'mcp-governance/docs/governance.md');
  const violations: AuditReport['violations'] = [];
  const checks: AuditCheck[] = [];
  const wanted = (id: string) => !selectedIds || selectedIds.includes(id);
  const check = (id: string, label: string, passed: boolean, failure: string, rule = id) => {
    const result = { id, label, passed, message: passed ? `${label} verified.` : failure };
    checks.push(result);
    if (!passed) violations.push({ owner, rule, message: failure });
    onCheck?.(result);
  };
  if (includeGovernance && wanted('governance')) check('governance', 'Central governance', await inScopeExists(root, governance, false), 'Central governance document is missing or outside the workspace.');
  const product = owner.startsWith('apps/') || owner.startsWith('devkit/') || owner === 'infrastructure/database-manager';
  const required = product ? ['contracts', 'src/api/modules', 'src/web/modules', 'tests', 'docs'] : ['contracts', 'src', 'tests', 'docs'];
  for (const folder of required) if (wanted(`folder:${folder}`)) check(`folder:${folder}`, folder, await inScopeExists(root, path.join(ownerRoot, folder), true), `Missing or out-of-scope folder: ${folder}`, 'structure');
  if (product && wanted('legacy-modules')) check('legacy-modules', 'No outdated module folder', !await inScopeExists(root, path.join(ownerRoot, 'src/modules'), true), 'Move src/modules into src/api/modules.');
  if (!wanted('instructions') && !wanted('governance-link')) return { checks, violations };
  const agentPath = path.join(ownerRoot, 'AGENTS.md');
  const hasInstructions = await inScopeExists(root, agentPath, false);
  if (wanted('instructions')) check('instructions', 'AGENTS.md', hasInstructions, 'AGENTS.md is missing or outside the workspace.');
  if (!wanted('governance-link')) return { checks, violations };
  if (hasInstructions) {
    const content = await readFile(agentPath, 'utf8');
    const links = [...content.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
    check('governance-link', 'Single central governance link', links.length === 1 && path.resolve(ownerRoot, links[0]) === governance, 'AGENTS.md must link only to the central governance.md.');
  } else {
    // Still emit the final progress step; the missing-file violation above is sufficient.
    const skipped = { id: 'governance-link', label: 'Single central governance link', passed: false, message: 'Cannot verify the link without AGENTS.md.' };
    checks.push(skipped); onCheck?.(skipped);
    if (!wanted('instructions')) violations.push({ owner, rule: 'governance-link', message: skipped.message });
  }
  return { checks, violations };
}
