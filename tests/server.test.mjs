import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestServer as createServer } from './server-fixture.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('server connects health, audit, and built frontend without exposing unknown APIs', async () => {
  const app = await createServer();
  try {
    assert.equal((await app.inject('/api/health')).json().ready, true);
    const audit = await app.inject({ method: 'POST', url: '/api/v1/audit/run' });
    assert.equal(audit.statusCode, 200);
    assert.equal(typeof audit.json().ownersChecked, 'number');
    assert.ok(audit.json().checkedAt);
    assert.equal(typeof audit.json().durationMs, 'number');
    assert.equal(audit.headers['cache-control'], 'no-store');
    const page = await app.inject('/');
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Codeitz/);
    assert.equal((await app.inject('/api/missing')).statusCode, 404);
    assert.equal((await app.inject('/assets/missing.js')).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/audit/run', payload: { command: 'anything' } })).statusCode, 400);
  } finally { await app.close(); }
});

test('run endpoint reports violations and rechecks corrected files on the next request', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeitz-api-audit-'));
  const app = await createServer({ auditRoot: root });
  try {
    for (const folder of ['apps', 'devkit', 'addons', 'foundation', 'packages', 'mcp-governance/docs']) {
      await mkdir(path.join(root, folder), { recursive: true });
    }
    await writeFile(path.join(root, 'mcp-governance/docs/governance.md'), '# Governance');
    const owner = path.join(root, 'infrastructure/database-manager');
    for (const folder of ['contracts', 'src/api/modules', 'src/web/modules', 'tests', 'docs']) {
      await mkdir(path.join(owner, folder), { recursive: true });
    }
    await writeFile(path.join(owner, 'AGENTS.md'), '[Wrong](missing.md)');
    const failed = (await app.inject({ method: 'POST', url: '/api/v1/audit/run' })).json();
    assert.equal(failed.passed, false);
    assert.equal(failed.violations[0].rule, 'governance-link');
    await writeFile(path.join(owner, 'AGENTS.md'), '[Governance](../../mcp-governance/docs/governance.md)');
    const passed = (await app.inject({ method: 'POST', url: '/api/v1/audit/run' })).json();
    assert.equal(passed.passed, true);
    assert.deepEqual(passed.violations, []);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('run endpoint reports an unavailable workspace as an error', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeitz-unavailable-'));
  const app = await createServer({ auditRoot: path.join(root, 'missing') });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/audit/run' });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().passed, undefined);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('product audits stream real check progress, isolate individual runs, and reject arbitrary paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codeitz-products-'));
  const app = await createServer({ auditRoot: root });
  const owners = ['apps/one', 'devkit/two', 'infrastructure/database-manager'];
  try {
    await mkdir(path.join(root, 'mcp-governance/docs'), { recursive: true });
    await writeFile(path.join(root, 'mcp-governance/docs/governance.md'), '# Governance');
    for (const owner of owners) {
      for (const folder of ['contracts', 'src/api/modules', 'src/web/modules', 'tests', 'docs']) await mkdir(path.join(root, owner, folder), { recursive: true });
      await writeFile(path.join(root, owner, 'AGENTS.md'), '[Governance](../../mcp-governance/docs/governance.md)');
    }
    await writeFile(path.join(root, 'apps/one/AGENTS.md'), '[Wrong](missing.md)');
    const list = (await app.inject('/api/v1/audit/products')).json();
    assert.deepEqual(list.products.map(product => product.owner), owners);
    assert.equal(list.checksPerProduct, 10);
    assert.equal(list.checks.length, 10);
    assert.ok(list.checks.every(check => check.description.length > 0));
    const one = await app.inject({ method: 'POST', url: '/api/v1/audit/products/run', payload: { owner: 'apps/one' } });
    assert.match(one.headers['content-type'], /application\/x-ndjson/);
    const events = one.body.trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events[0], { type: 'run-start', owners: ['apps/one'] });
    assert.deepEqual(events.filter(event => event.type === 'check').map(event => event.completedChecks), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const completed = events.find(event => event.type === 'owner-complete');
    assert.equal(completed.report.passed, false);
    assert.equal(completed.report.violations[0].rule, 'governance-link');
    assert.equal(events.at(-1).type, 'run-complete');
    assert.equal(events.filter(event => event.type === 'owner-start').length, 1);
    const custom = await app.inject({ method: 'POST', url: '/api/v1/audit/products/run', payload: { owner: 'apps/one', checkIds: ['folder:tests', 'folder:docs'] } });
    const customEvents = custom.body.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(customEvents.find(event => event.type === 'owner-start').totalChecks, 2);
    assert.equal(customEvents.filter(event => event.type === 'check').length, 2);
    const customReport = customEvents.find(event => event.type === 'owner-complete').report;
    assert.equal(customReport.passed, true); // The broken link was intentionally not checked.
    assert.deepEqual(customReport.selectedCheckIds, ['folder:tests', 'folder:docs']);
    assert.deepEqual(customReport.checks.map(check => check.id), ['folder:tests', 'folder:docs']);
    for (const checkIds of [[], ['unknown'], ['instructions', 'instructions']]) {
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/audit/products/run', payload: { checkIds } })).statusCode, 400);
    }
    const all = await app.inject({ method: 'POST', url: '/api/v1/audit/products/run' });
    assert.equal(all.body.trim().split('\n').map(line => JSON.parse(line)).filter(event => event.type === 'owner-complete').length, 3);
    for (const owner of ['../outside', 'packages/ui', 'apps/not-listed']) {
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/audit/products/run', payload: { owner } })).statusCode, 404);
    }
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/audit/products/run', payload: { command: 'anything' } })).statusCode, 400);
    await rm(path.join(root, 'devkit/two/AGENTS.md'));
    const missing = await app.inject({ method: 'POST', url: '/api/v1/audit/products/run', payload: { owner: 'devkit/two' } });
    const result = missing.body.trim().split('\n').map(line => JSON.parse(line)).find(event => event.type === 'owner-complete').report;
    assert.equal(result.checks.length, 10);
    assert.equal(result.passed, false);
    const linkOnly = await app.inject({ method: 'POST', url: '/api/v1/audit/products/run', payload: { owner: 'devkit/two', checkIds: ['governance-link'] } });
    const linkReport = linkOnly.body.trim().split('\n').map(line => JSON.parse(line)).find(event => event.type === 'owner-complete').report;
    assert.equal(linkReport.passed, false);
    assert.equal(linkReport.violations[0].rule, 'governance-link');
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('readiness follows PostgreSQL recovery while liveness remains available',async()=>{
 let available=true,probes=0,hold;
 const projectDatabase={selectFrom:()=>({select:()=>({compile:()=>({sql:'select "origin" from "public"."sync_identity"'}),executeTakeFirstOrThrow:async()=>{probes++;if(hold)await hold;if(!available)throw Error('Fixture PostgreSQL recovery');return {origin:'fixture'};}})})};
 const app=await createServer({projectDatabase});
 try{assert.equal((await app.inject('/api/ready')).statusCode,200);available=false;assert.equal((await app.inject('/api/ready')).statusCode,503);assert.equal((await app.inject('/api/live')).statusCode,200);available=true;assert.equal((await app.inject('/api/ready')).statusCode,200);
 let release;hold=new Promise(r=>release=r);const before=probes;const reads=Array.from({length:12},()=>app.inject('/api/ready'));await new Promise(r=>setTimeout(r,30));assert.equal(probes-before,1);release();assert.ok((await Promise.all(reads)).every(r=>r.statusCode===200));
 }finally{await app.close();}
});
