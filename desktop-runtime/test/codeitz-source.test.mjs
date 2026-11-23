import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CodeitzSource } from '../codeitz-source.mjs';

const origin = 'http://127.0.0.1:14305';
const runnerId = '12345678-1234-4234-8234-123456789abc';
const data = {
  '/api/v1/projects': { projects: [{ owner: 'devkit/codeitz', name: 'Codeitz', purpose: 'Development', active: true, orderNo: 1, state: 'configured', id: 999 }] },
  '/api/v1/tasks': { tasks: [{ id: runnerId, owner: 'devkit/codeitz', goal: 'Existing saved runner', status: 'completed', events: [{ secret: 'must-not-forward' }] }] },
  '/api/v1/work-tasks': { tasks: [{ id: 'abc123xy', title: 'Existing staff task', status: 'Open', revision: 3, assignedTo: 'Staff', owner: 'not-an-authoritative-project-link' }] },
  '/api/v1/todos': { revision: 7, todos: [{ id: 'todo1234', title: 'Codeitz labels do not imply a project', projectId: '', status: 'open' }, { id: runnerId, title: 'Legacy ID with explicit project', projectId: 'devkit/codeitz', status: 'in-progress' }] },
};
async function fixture(run, { deniedLogin = false, altered = {}, expireOnce = false, sourceOrigin = origin } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codeitz-source-test-'));
  const credentialsPath = path.join(root, 'owner.env');
  await fs.writeFile(credentialsPath, 'SUPER_ADMIN_USERNAME=fixture-owner\nSUPER_ADMIN_PASSWORD=fixture-password-not-real\nDEFAULT_TENANT_CORPORATE_ID=fixture-tenant\n');
  const calls = [];
  let expired = false;
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).origin, sourceOrigin);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Origin, sourceOrigin);
    assert.match(options.headers['X-Platform-Tab'], /^[a-f0-9]{32}$/);
    const route = new URL(url).pathname;
    calls.push({ route, method: options.method, options });
    if (route === '/platform-api/v1/identity/login') {
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { identifier: 'fixture-owner', password: 'fixture-password-not-real', corporateId: 'fixture-tenant', realm: 'sa' });
      return new Response('{}', { status: deniedLogin ? 401 : 200, headers: { 'set-cookie': 'platform_session=fixture-cookie; HttpOnly; Path=/' } });
    }
    assert.match(options.headers.Cookie, /platform_session=fixture-cookie/);
    if (route === '/platform-api/v1/identity/session') return Response.json({ realm: 'sa', user: { publicId: 'owner-id' }, csrfToken: 'fixture-csrf' });
    if (route === '/platform-api/v1/identity/logout') {
      assert.equal(options.method, 'POST'); assert.equal(options.headers['X-CSRF-Token'], 'fixture-csrf');
      return Response.json({ success: true });
    }
    assert.equal(options.method, 'GET');
    if (expireOnce && !expired && route === '/api/v1/projects') { expired = true; return Response.json({}, { status: 401 }); }
    if (!Object.hasOwn(data, route)) throw new Error('No unapproved API route is permitted');
    return Response.json(altered[route] ?? data[route]);
  };
  const source = new CodeitzSource({ credentialsPath, fetchImpl, origin: sourceOrigin });
  try { await run({ source, calls, credentialsPath }); }
  finally { await source.close(); await fs.rm(root, { recursive: true, force: true }); }
}

test('normal login reads stable owner/public IDs, separates task types and exposes no auth/raw event values', () => fixture(async ({ source, calls }) => {
  const result = await source.snapshot();
  assert.equal(result.connection.connected, true);
  assert.equal(result.projects[0].owner, 'devkit/codeitz');
  assert.equal(result.projects[0].id, undefined);
  assert.equal(result.runnerTasks[0].id, runnerId);
  assert.equal(result.runnerTasks[0].sourceKind, 'runner');
  assert.equal(result.businessTasks[0].id, 'abc123xy');
  assert.equal(result.businessTasks[0].owner, null);
  assert.equal(result.businessTasks[0].sourceKind, 'business');
  assert.equal(result.todoTasks[0].owner, null);
  assert.equal(result.todoTasks[0].id, 'todo1234');
  assert.equal(result.todoTasks[1].owner, 'devkit/codeitz');
  assert.equal(result.todoTasks[1].id, runnerId);
  assert.equal(result.todoTasks[1].revision, 7);
  const serialized = JSON.stringify(result);
  for (const secret of ['fixture-password-not-real', 'fixture-cookie', 'fixture-csrf', 'must-not-forward']) assert.equal(serialized.includes(secret), false);
  assert.equal(calls.filter(x => x.method !== 'GET' && !x.route.startsWith('/platform-api/v1/identity/')).length, 0);
}));

test('parallel refreshes share one in-memory login and one read snapshot', () => fixture(async ({ source, calls }) => {
  const results = await Promise.all([source.snapshot(), source.snapshot(), source.snapshot()]);
  assert.ok(results.every(x => x.connection.connected));
  assert.equal(calls.filter(x => x.route.endsWith('/login')).length, 1);
  assert.equal(calls.filter(x => x.route === '/api/v1/projects').length, 1);
}));

test('expired session retries original login once, without replaying any source action', () => fixture(async ({ source, calls }) => {
  assert.equal((await source.snapshot()).connection.connected, true);
  assert.equal(calls.filter(x => x.route.endsWith('/login')).length, 2);
  assert.equal(calls.some(x => x.method !== 'GET' && !x.route.startsWith('/platform-api/v1/identity/')), false);
}, { expireOnce: true }));

test('denied existing account yields honest disconnected view without a fallback account', () => fixture(async ({ source, calls }) => {
  const result = await source.snapshot();
  assert.equal(result.connection.connected, false);
  assert.deepEqual(result.projects, []);
  assert.equal(calls.filter(x => x.route.endsWith('/login')).length, 1);
  assert.equal(calls.some(x => x.route === '/api/v1/projects'), false);
}, { deniedLogin: true }));

test('invalid or ambiguous source ownership fails closed instead of inventing an identity', () => fixture(async ({ source }) => {
  assert.equal((await source.snapshot()).connection.connected, false);
}, { altered: { '/api/v1/projects': { projects: [{ owner: '../../foreign', name: 'Foreign' }] } } }));

test('a remote origin cannot receive local credentials', () => {
  assert.throws(() => new CodeitzSource({ credentialsPath: path.resolve('unused.env'), origin: 'https://foreign.invalid' }), /local Docker/);
});


test('main-repo source uses its exact approved local origin and original read-only identity flow', () => fixture(async ({source,calls}) => {
 const result=await source.snapshot();
 assert.equal(result.connection.connected,true);
 assert.equal(result.connection.origin,'http://127.0.0.1:4305');
 assert.equal(calls.some(call=>call.method!=='GET'&&!call.route.startsWith('/platform-api/v1/identity/')),false);
}, {sourceOrigin:'http://127.0.0.1:4305'}));
