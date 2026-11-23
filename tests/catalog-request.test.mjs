import assert from 'node:assert/strict';
import test from 'node:test';

const origin = 'http://127.0.0.1:4305';
const selector = 'a'.repeat(32);
function storage(values = new Map()) {
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
globalThis.localStorage = storage();
globalThis.sessionStorage = storage(new Map([['codebiz.platform.tab', selector]]));
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_key, _options, run) => run() } } });
globalThis.window = new EventTarget();
window.top = window;
window.location = { origin };
const { fetchPlatformCatalog } = await import('../src/web/platform-client.ts');

test('catalogue uses the published selected app context and preserves cancellation', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ apps: [] }); };
  try {
    const controller = new AbortController();
    await fetchPlatformCatalog(origin + '/platform-api/v1/landing', {
      signal: controller.signal, credentials: 'include', redirect: 'follow',
      headers: { authorization: 'untrusted', cookie: 'untrusted', 'x-platform-tab': 'old-selector', 'x-platform-grant': 'untrusted', 'x-tenant-id': 'untrusted', 'x-csrf-token': 'untrusted', 'x-platform-activity': '1' },
    });
    assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.equal(url, origin + '/platform-api/v1/landing');
    assert.equal(init.method, 'GET');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.redirect, 'error');
    assert.equal(init.signal, controller.signal);
    assert.equal(init.headers.get('x-platform-tab'), selector);
    for (const key of ['authorization', 'cookie', 'x-platform-grant', 'x-tenant-id', 'x-csrf-token', 'x-platform-activity']) assert.equal(init.headers.has(key), false);
    controller.abort();
    assert.equal(init.signal.aborted, true);
  } finally { globalThis.fetch = original; }
});

test('catalogue rejects foreign, credentialed, query and mutation requests before dispatch', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  try {
    for (const url of ['https://foreign.test/platform-api/v1/landing', 'http://user:password@127.0.0.1:4305/platform-api/v1/landing', origin + '/api/v1/projects', origin + '/platform-api/v1/landing?selector=untrusted', origin + '/platform-api/v1/landing#fragment']) {
      await assert.rejects(fetchPlatformCatalog(url, {}), /same-origin/);
    }
    await assert.rejects(fetchPlatformCatalog(origin + '/platform-api/v1/landing', { method: 'POST' }), /same-origin/);
    await assert.rejects(fetchPlatformCatalog(origin + '/platform-api/v1/landing', { body: '{}' }), /same-origin/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
