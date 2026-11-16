import { readdir, realpath } from 'node:fs/promises';
import { auditOwner, inScopeExists } from './owner.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Violation = { owner: string; rule: string; message: string };

/** Read-only checks for owner folders and their central governance link. */
export async function auditWorkspace(workspaceRoot: string) {
  const root = await realpath(workspaceRoot);
  const governance = path.join(root, 'mcp-governance/docs/governance.md');
  const violations: Violation[] = [];
  const owners: string[] = [];
  const add = (owner: string, rule: string, message: string) =>
    violations.push({ owner, rule, message });
  if (!await inScopeExists(root, governance, false)) add('.', 'governance', 'Central governance document is missing or outside the workspace.');
  for (const area of ['apps', 'devkit', 'addons', 'foundation', 'packages']) {
    try {
      for (const entry of await readdir(path.join(root, area), { withFileTypes: true })) {
        if (entry.isDirectory()) owners.push(`${area}/${entry.name}`);
        else if (entry.isSymbolicLink()) add(`${area}/${entry.name}`, 'scope', 'Linked owner directories are not audited.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      add(area, 'discovery', 'Owner area is missing.');
    }
  }
  owners.push('infrastructure/database-manager');
  owners.sort();
  for (const owner of owners) {
    violations.push(...(await auditOwner(root, owner)).violations);
  }
  return {
    passed: violations.length === 0,
    productsChecked: owners.filter(owner => owner.startsWith('apps/') || owner.startsWith('devkit/') || owner === 'infrastructure/database-manager').length,
    ownersChecked: owners.length,
    violations,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await auditWorkspace(process.argv[2] ?? process.cwd());
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.passed ? 0 : 1;
  } catch {
    process.stderr.write('Audit could not finish: workspace files could not be read.\n');
    process.exitCode = 2;
  }
}
