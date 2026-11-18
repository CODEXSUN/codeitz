import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditWorkspace } from '../src/api/modules/governance-audit/audit.ts';

test('audit passes valid products and reports missing folders, old modules, and wrong links', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeitz-audit-'));
  try {
    await mkdir(path.join(root, 'mcp-governance/docs'), { recursive: true });
    await writeFile(path.join(root, 'mcp-governance/docs/governance.md'), '# Governance');
    for (const area of ['addons', 'foundation', 'packages']) {
      await mkdir(path.join(root, area));
    }
    for (const owner of ['apps/crm', 'devkit/example', 'infrastructure/database-manager']) {
      for (const folder of ['contracts', 'src/api/modules', 'src/web/modules', 'tests', 'docs']) {
        await mkdir(path.join(root, owner, folder), { recursive: true });
      }
      await writeFile(path.join(root, owner, 'AGENTS.md'), '[Governance](../../mcp-governance/docs/governance.md)');
    }
    assert.deepEqual(await auditWorkspace(root), { passed: true, productsChecked: 3, ownersChecked: 3, violations: [] });
    await rmdir(path.join(root, 'apps/crm/src/web/modules'));
    await mkdir(path.join(root, 'apps/crm/src/modules'));
    await writeFile(path.join(root, 'apps/crm/AGENTS.md'), '[Wrong](missing.md)');
    const failed = await auditWorkspace(root);
    assert.equal(failed.passed, false);
    assert.deepEqual(failed.violations.map(item => item.rule).sort(), ['governance-link', 'legacy-modules', 'structure']);
    await rm(path.join(root, 'apps/crm/AGENTS.md'));
    assert.ok((await auditWorkspace(root)).violations.some(item => item.rule === 'instructions'));
  } finally {
    // Remove only the temporary fixture created by this test.
    await rm(root, { recursive: true, force: true });
  }
});

test('simple owners use the basic pattern and report folder and instruction violations', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeitz-audit-'));
  try {
    await mkdir(path.join(root, 'mcp-governance/docs'), { recursive: true });
    await writeFile(path.join(root, 'mcp-governance/docs/governance.md'), '# Governance');
    for (const area of ['apps', 'devkit']) await mkdir(path.join(root, area));
    const simpleOwners = ['addons/blog', 'foundation/ai', 'packages/ui'];
    for (const owner of [...simpleOwners, 'infrastructure/database-manager']) {
      const folders = simpleOwners.includes(owner)
        ? ['contracts', 'src/modules', 'tests', 'docs']
        : ['contracts', 'src/api/modules', 'src/web/modules', 'tests', 'docs'];
      for (const folder of folders) await mkdir(path.join(root, owner, folder), { recursive: true });
      await writeFile(path.join(root, owner, 'AGENTS.md'), '[Governance](../../mcp-governance/docs/governance.md)');
    }
    const valid = await auditWorkspace(root);
    assert.equal(valid.passed, true);
    assert.equal(valid.ownersChecked, 4);
    assert.equal(valid.productsChecked, 1);
    await rmdir(path.join(root, 'addons/blog/contracts'));
    await writeFile(path.join(root, 'foundation/ai/AGENTS.md'), '[Wrong](missing.md)');
    await rm(path.join(root, 'packages/ui/AGENTS.md'));
    assert.deepEqual((await auditWorkspace(root)).violations.map(({ owner, rule }) => ({ owner, rule })), [
      { owner: 'addons/blog', rule: 'structure' },
      { owner: 'foundation/ai', rule: 'governance-link' },
      { owner: 'packages/ui', rule: 'instructions' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
