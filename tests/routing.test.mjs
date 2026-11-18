import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createTestServer as createServer } from './server-fixture.mjs';
import { operations } from '../src/api/openapi.ts';
import { parseLocation } from '../contracts/navigation.ts';
import { auditOwner } from '../src/api/modules/governance-audit/owner.ts';

test('canonical APIs, OpenAPI coverage, docs, direct links and local boundaries', async () => {
  const app = await createServer();
  try {
    const response = await app.inject('/api/openapi.json');
    assert.equal(response.statusCode, 200);
    const spec = response.json(); assert.equal(spec.openapi, '3.1.0');
    const actual = Object.entries(spec.paths).flatMap(([url, methods]) => Object.entries(methods).map(([method]) => `${method.toUpperCase()} ${url}`)).sort();
    assert.deepEqual(actual, Object.keys(operations).sort());
    assert.equal(new Set(Object.values(spec.paths).flatMap(methods => Object.values(methods).map(op => op.operationId))).size, actual.length);
    for (const [url,methods] of Object.entries(spec.paths)) for (const operation of Object.values(methods)) {
      assert.ok(operation.description.includes(url.startsWith('/api/v1/sync/exchange')?'Connected-app authentication':'Local loopback'));if(url.startsWith('/api/v1/sync/exchange'))assert.deepEqual(operation.security,[{ConnectedApp:[]}]);
      assert.ok(operation.responses['403']);
      assert.ok(Object.values(operation.responses)[0].content);
    }
    const docs = await app.inject('/api/docs'); assert.equal(docs.statusCode, 200); assert.match(docs.body, /OpenAPI specification/);
    for (const url of ['/tasks/new', '/settings/codex', '/task-records?status=archived', '/governance-audit?tab=checks']) {
      const page = await app.inject(url); assert.equal(page.statusCode, 200); assert.match(page.body, /Codeitz/);
    }
    const canonical = await app.inject('/api/v1/tasks'); const legacy = await app.inject('/api/tasks');
    assert.equal(canonical.statusCode, 200); assert.deepEqual(legacy.json(), canonical.json());
    for (const url of ['/api/docs', '/api/openapi.json', '/api/v1/tasks', '/api/v1/audit/products']) {
      assert.equal((await app.inject({ url, headers: { origin: 'https://other.invalid' } })).statusCode, 403);
    }
    assert.equal((await app.inject('/api/v1/missing')).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/tasks', payload: { command: 'not permitted' } })).statusCode, 400);
  } finally { await app.close(); }
});

test('URL parser validates IDs and filters, normalizes legacy links and excludes unsaved goals', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal(parseLocation(`/?task=${id}`).canonical, `/tasks/${id}`);
  assert.equal(parseLocation('/?view=records&owner=devkit%2Fuiux').canonical, '/task-records?owner=devkit%2Fuiux');
  assert.equal(parseLocation(`/tasks/${id}?tab=results`).params.get('tab'), 'results');
  assert.equal(parseLocation(`/tasks/${id}?tab=unknown`).canonical, `/tasks/${id}`);
  assert.equal(parseLocation(`/tasks/${id}?tab=checks`).canonical, `/tasks/${id}`);
  assert.equal(parseLocation('/tasks/new?tab=activity').canonical, '/tasks/new');
  assert.equal(parseLocation('/dashboard?owner=devkit%2Fuiux&tab=checks').canonical, '/dashboard');
  assert.equal(parseLocation('/dashboard').page, 'dashboard');
  assert.equal(parseLocation('/').canonical, '/dashboard');
  assert.equal(parseLocation('/?owner=devkit%2Fuiux').canonical, '/tasks/new?owner=devkit%2Fuiux');
  assert.equal(parseLocation('/settings').canonical, '/settings/appearance');
  assert.equal(parseLocation('/settings/codex').section, 'codex');
  assert.equal(parseLocation('/tasks/bad-id').page, 'missing');
  assert.equal(parseLocation('/settings/wrong').page, 'missing');
  assert.equal(parseLocation(`/task-records/${id}?status=archived`).taskId, id);
  assert.equal(parseLocation('/task-records?status=oops&owner=../private&goal=secret').canonical, '/task-records');
  assert.equal(parseLocation('/governance-audit?tab=checks').params.get('tab'), 'checks');
});

test('routing audit passes real source and catches removed documentation and history wiring', async () => {
  const root = path.resolve('../..');
  const report = await auditOwner(root, 'devkit/codeitz', undefined, true, ['routing']);
  assert.deepEqual(report.violations, []);
  const fixture = await mkdtemp(path.join(tmpdir(), 'codeitz-routing-'));
  try {
    const owner = path.join(fixture, 'devkit/codeitz');
    await mkdir(owner, { recursive: true });
    await cp('src', path.join(owner, 'src'), { recursive: true });
    await cp('contracts', path.join(owner, 'contracts'), { recursive: true });
    await mkdir(path.join(owner, 'tests')); await writeFile(path.join(owner, 'tests/routing.test.mjs'), '// fixture');
    assert.deepEqual((await auditOwner(fixture, 'devkit/codeitz', undefined, true, ['routing'])).violations, []);
    await writeFile(path.join(owner, 'src/web/navigation.ts'), '// removed history');
    await writeFile(path.join(owner, 'src/api/openapi.ts'), '// removed docs');
    const failed = await auditOwner(fixture, 'devkit/codeitz', undefined, true, ['routing']);
    assert.equal(failed.violations.length, 1); assert.match(failed.violations[0].message, /documentation/); assert.match(failed.violations[0].message, /history/);
    const other = await auditOwner(fixture, 'apps/example', undefined, true, ['routing']);
    assert.equal(other.checks[0].skipped, true);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
