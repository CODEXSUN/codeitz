import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHttpServer } from '@workspace/framework';
import { TaskRunner } from '../src/api/modules/task-runner/application/service.ts';
import { registerTaskRoutes } from '../src/api/modules/task-runner/routes.ts';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'codeitz-task-'));
  const app = path.join(root, 'apps/sample');
  for (const folder of ['apps/sample/docs', 'apps/sample/src/api/modules', 'devkit', 'mcp-governance/docs']) await mkdir(path.join(root, folder), { recursive: true });
  for (const name of ['governance.md', 'coding-standard.md', 'app-structure.md', 'frontend-design-system.md', 'server-startup.md']) await writeFile(path.join(root, 'mcp-governance/docs', name), `# ${name}\nKeep modules separate.`);
  await writeFile(path.join(app, 'AGENTS.md'), '[Governance](../../mcp-governance/docs/governance.md)');
  await writeFile(path.join(app, 'docs/work-record.md'), '# Work\nExisting team notes.');
  await writeFile(path.join(app, '.env'), 'SECRET=do-not-read-this-value');
  await writeFile(path.join(app, 'package.json'), JSON.stringify({ type: 'module', scripts: { typecheck: 'node --check src/api/modules/sample.js' } }));
  return { root, app, records: path.join(root, '.codeitz/tasks') };
}

async function waitFor(runner, id, status) {
  for (let count = 0; count < 200; count++) {
    const task = (await runner.list()).find(task => task.id === id);
    if (task?.status === status) return task;
    if (task?.status === 'failed') throw new Error(task.error);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Task did not reach expected state.');
}

test('planning, coding, and checks require separate steps and preserve app work records', async () => {
  const fixtureData = await fixture();
  const { root, app, records } = fixtureData;
  const calls = [];
  const runner = new TaskRunner(root, records, async ({ mode, prompt, directory }) => {
    calls.push(mode);
    assert.equal(directory, app);
    assert.match(prompt, /Existing team notes/);
    assert.match(prompt, /coding-standard.md/);
    assert.doesNotMatch(prompt, /do-not-read-this-value/);
    if (mode === 'code') await writeFile(path.join(directory, 'src/api/modules/sample.js'), 'export const answer = 42;');
    return mode === 'plan' ? 'Add one domain-owned module.' : 'Added the requested module. Checks remain to be run.';
  });
  try {
    const task = await runner.create('apps/sample', 'Add one small module.');
    await waitFor(runner, task.id, 'planned');
    assert.deepEqual(calls, ['plan']);
    await assert.rejects(readFile(path.join(app, 'src/api/modules/sample.js')), /ENOENT/);
    await assert.rejects(runner.step(task.id, 'check'), /not ready/);
    await runner.step(task.id, 'code');
    const coded = await waitFor(runner, task.id, 'coded');
    assert.deepEqual(coded.checks, []);
    assert.deepEqual(coded.changedFiles, ['src/api/modules/sample.js']);
    await runner.step(task.id, 'check');
    const complete = await waitFor(runner, task.id, 'completed');
    assert.equal(complete.checks[0].passed, true);
    await runner.close();
    const work = await readFile(path.join(app, 'docs/work-record.md'), 'utf8');
    assert.match(work, /Existing team notes/);
    assert.match(work, /typecheck: passed/);
    assert.match(work, /Added the requested module/);
  } finally { await runner.close(); await rm(root, { recursive: true, force: true }); }
});

test('task routes reject outside owners and cross-origin execution', async () => {
  const { root, records } = await fixture();
  const runner = new TaskRunner(root, records, async () => 'Plan only.');
  const app = createHttpServer({ name: 'test', logLevel: 'silent' });
  registerTaskRoutes(app, root, root, runner);
  try {
    const goal = { owner: 'apps/sample', goal: 'A small goal.' };
    assert.equal((await app.inject({ method: 'POST', url: '/api/tasks', headers: { origin: 'https://other.invalid' }, payload: goal })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/tasks', headers: { host: 'other.invalid' }, payload: goal })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/tasks', payload: { owner: '../outside', goal: 'Invalid' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/api/tasks', payload: { ...goal, command: 'anything' } })).statusCode, 400);
    const created = await app.inject({ method: 'POST', url: '/api/tasks', payload: goal });
    assert.equal(created.statusCode, 202);
    await waitFor(runner, created.json().id, 'planned');
    assert.equal((await app.inject('/api/tasks')).json().tasks.length, 1);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('Codex failures are recorded without marking coding or checks complete', async () => {
  const { root, records, app } = await fixture();
  const runner = new TaskRunner(root, records, async () => { throw new Error('Connection unavailable.'); });
  try {
    const task = await runner.create('apps/sample', 'A goal.');
    for (let count = 0; count < 100; count++) {
      const saved = (await runner.list()).find(saved => saved.id === task.id);
      if (saved.status === 'failed') {
        assert.equal(saved.error, 'Connection unavailable.');
        assert.deepEqual(saved.checks, []);
        await runner.close();
        assert.match(await readFile(path.join(app, 'docs/work-record.md'), 'utf8'), /Connection unavailable/);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Failure was not recorded.');
  } finally { await runner.close(); await rm(root, { recursive: true, force: true }); }
});

test('long work records include latest entries in planning context', async () => {
  const { root, app, records } = await fixture();
  await writeFile(path.join(app, 'docs/work-record.md'), 'OLD_ENTRY' + 'x'.repeat(35000) + '\nLATEST_ENTRY');
  const runner = new TaskRunner(root, records, async ({ prompt }) => {
    assert.match(prompt, /LATEST_ENTRY/);
    assert.doesNotMatch(prompt, /OLD_ENTRY/);
    return 'Plan using latest work.';
  });
  try {
    const task = await runner.create('apps/sample', 'Plan next work.');
    await waitFor(runner, task.id, 'planned');
  } finally { await runner.close(); await rm(root, { recursive: true, force: true }); }
});

test('interrupted tasks append failure to the app work record once', async () => {
  const { root, app, records } = await fixture();
  const { saveTask } = await import('../src/api/modules/task-runner/infrastructure/store.ts');
  const { randomUUID } = await import('node:crypto');
  const id = randomUUID();
  await saveTask(records, { id, owner: 'apps/sample', goal: 'Interrupted goal', status: 'coding', createdAt: new Date().toISOString(), updatedAt: '', plan: 'Plan', result: '', checks: [], changedFiles: [] });
  const runner = new TaskRunner(root, records);
  try {
    const recovered = await Promise.all([runner.list(), runner.list()]);
    assert.equal(recovered[0][0].status, 'failed');
    await runner.list();
    const work = await readFile(path.join(app, 'docs/work-record.md'), 'utf8');
    assert.match(work, /Existing team notes/);
    assert.match(work, /Previous run was interrupted/);
    assert.equal(work.split(`## Codeitz task ${id}`).length - 1, 1);
  } finally { await runner.close(); await rm(root, { recursive: true, force: true }); }
});

test('connection only checks existing CLI session and reports real failures', async () => {
  const { codexStatus } = await import('../src/api/modules/task-runner/infrastructure/codex.ts');
  const calls = [];
  const result = await codexStatus(process.cwd(), async (_command, args) => {
    calls.push(args);
    return { code: 0, output: args[0] === '--version' ? 'codex-test' : 'Logged in using ChatGPT' };
  });
  assert.equal(result.signedIn, true);
  assert.deepEqual(calls, [['--version'], ['--version'], ['login', 'status']]);
  const failed = await codexStatus(process.cwd(), async (_command, args) => ({ code: args[0] === 'login' ? 7 : 0, output: args[0] === 'login' ? 'Credential store access denied' : 'codex-test' }));
  assert.equal(failed.available, true);
  assert.equal(failed.signedIn, false);
  assert.match(failed.message, /exited 7: Credential store access denied/);
});

test('Windows discovers the installed CLI when IDE PATH cannot find codex', { skip: process.platform !== 'win32' }, async () => {
  const { resolveCodex } = await import('../src/api/modules/task-runner/infrastructure/codex.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'codeitz-cli-'));
  await mkdir(path.join(root, 'app/resources'), { recursive: true });
  await writeFile(path.join(root, 'app/resources/codex.exe'), 'fixture');
  try {
    const executable = await resolveCodex(root, async (command, args) => {
      if (command === 'codex') throw new Error('spawn codex ENOENT');
      assert.match(args.at(-1), /Get-AppxPackage -Name OpenAI.Codex/);
      return { code: 0, output: root };
    });
    assert.equal(executable, path.join(root, 'app/resources/codex.exe'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('SQLite imports JSON once, preserves legacy backups, and persists activity after restart', async () => {
  const { root, records } = await fixture();
  const { randomUUID } = await import('node:crypto');
  const { readTasks, appendEvent } = await import('../src/api/modules/task-runner/infrastructure/store.ts');
  const { DatabaseSync } = await import('node:sqlite');
  const id = randomUUID();
  await mkdir(records, { recursive: true });
  const legacy = { id, owner: 'apps/sample', goal: 'Legacy work', status: 'completed', createdAt: new Date().toISOString(), updatedAt: '', plan: 'Plan', result: 'Done', checks: [], changedFiles: [] };
  const file = path.join(records, `${id}.json`);
  await writeFile(file, JSON.stringify(legacy));
  try {
    assert.equal((await readTasks(records))[0].goal, 'Legacy work');
    appendEvent(records, id, 'codex', 'Token=secret-value Bearer private-token sk-private-key');
    await writeFile(file, JSON.stringify({ ...legacy, goal: 'Stale backup' }));
    const saved = (await readTasks(records))[0];
    assert.equal(saved.goal, 'Legacy work');
    assert.doesNotMatch(saved.events[0].message, /secret-value|private-token|sk-private-key/);
    assert.match(await readFile(file, 'utf8'), /Stale backup/);
    const db = new DatabaseSync(path.join(records, 'runner.sqlite'));
    assert.equal(db.prepare('SELECT count(*) AS total FROM tasks').get().total, 1);
    db.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('record audit and archive/drop preserve evidence, allow restore, and reject unfinished tasks', async () => {
  const { root, app, records } = await fixture();
  const runner = new TaskRunner(root, records, async ({ mode, onActivity }) => {
    onActivity?.('tool', 'Workspace inspection finished.');
    if (mode === 'code') await writeFile(path.join(app, 'src/api/modules/sample.js'), 'export const value = 1;');
    return mode === 'plan' ? 'Plan' : 'Done';
  });
  try {
    const task = await runner.create('apps/sample', 'Small work');
    await waitFor(runner, task.id, 'planned');
    await assert.rejects(runner.manage(task.id, 'archive'), /Only finished/);
    await assert.rejects(runner.manage(task.id, 'drop'), /Only finished/);
    await runner.step(task.id, 'code'); await waitFor(runner, task.id, 'coded');
    await runner.step(task.id, 'check'); await waitFor(runner, task.id, 'completed'); await runner.close();
    assert.equal((await runner.audit(task.id)).passed, true);
    await runner.manage(task.id, 'archive');
    assert.ok((await runner.list())[0].archivedAt);
    await runner.manage(task.id, 'drop');
    const dropped = (await runner.list())[0];
    assert.ok(dropped.droppedAt);
    assert.equal(dropped.codingResult, 'Done');
    assert.match(dropped.result, /Final checks: typecheck: passed/);
    await runner.manage(task.id, 'restore');
    const restored = (await runner.list())[0];
    assert.equal(restored.archivedAt, undefined);
    assert.equal(restored.droppedAt, undefined);
    assert.ok(restored.events.some(event => event.kind === 'audit' && event.message.includes('Record audit: passed')));
    assert.match(await readFile(path.join(app, 'docs/work-record.md'), 'utf8'), /Status: completed/);
  } finally { await runner.close(); await rm(root, { recursive: true, force: true }); }
});

test('SSE sends initial state and real worker activity and cleans up on disconnect', async () => {
  const { root, records } = await fixture();
  const runner = new TaskRunner(root, records, async ({ onActivity }) => {
    onActivity?.('codex', 'Inspecting app modules.');
    return 'A small implementation plan.';
  });
  const app = createHttpServer({ name: 'stream-test', logLevel: 'silent' });
  registerTaskRoutes(app, root, root, runner);
  const controller = new AbortController();
  let reader;
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/tasks/stream`, { signal: controller.signal });
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let output = decoder.decode((await reader.read()).value);
    assert.match(output, /"type":"snapshot"/);
    const task = await runner.create('apps/sample', 'Streaming plan');
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      while (!output.includes('Inspecting app modules.')) output += decoder.decode((await reader.read()).value);
    } finally { clearTimeout(timeout); }
    assert.match(output, /"type":"activity"/);
    await waitFor(runner, task.id, 'planned');
    assert.ok((await runner.list())[0].events.some(event => event.message === 'Inspecting app modules.'));
    await reader.cancel(); controller.abort();
    assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/manage`, headers: { origin: 'https://other.invalid' }, payload: { action: 'archive' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: `/api/tasks/${task.id}/audit`, headers: { origin: 'https://other.invalid' }, payload: {} })).statusCode, 403);
  } finally { controller.abort(); await reader?.cancel().catch(() => {}); await app.close(); await rm(root, { recursive: true, force: true }); }
});

async function completedFixture(records) {
  const { saveTask } = await import('../src/api/modules/task-runner/infrastructure/store.ts');
  const { randomUUID } = await import('node:crypto');
  const task = { id: randomUUID(), owner: 'apps/sample', goal: 'Original goal', status: 'completed', createdAt: new Date().toISOString(), updatedAt: '', plan: 'Original plan', result: 'Added requested work. Runner checks remain pending; none were run.', checks: [{ name: 'typecheck', passed: true, output: 'Passed' }], changedFiles: ['src/api/modules/sample.js'] };
  await saveTask(records, task); return task;
}

test('completed summaries reflect final checks and acceptance persists without starting Codex', async () => {
  const { root, records, app } = await fixture();
  const task = await completedFixture(records);
  let calls = 0;
  const runner = new TaskRunner(root, records, async () => { calls++; return 'No execution expected'; });
  try {
    const normalized = (await runner.list())[0];
    assert.doesNotMatch(normalized.result, /pending|none were run/i);
    assert.match(normalized.result, /typecheck: passed/);
    assert.match(normalized.codingResult, /checks remain pending/);
    await runner.list();
    const workBefore = await readFile(path.join(app, 'docs/work-record.md'), 'utf8');
    assert.equal(workBefore.split('Final checks:').length - 1, 1);
    const accepted = await runner.review(task.id, 'accepted');
    assert.equal(accepted.task.review.decision, 'accepted');
    assert.match(accepted.task.result, /Result accepted/);
    await runner.review(task.id, 'accepted');
    await assert.rejects(runner.review(task.id, 'changes_requested', 'More work'), /already been reviewed/);
    assert.equal(calls, 0);
    assert.equal((await runner.list()).length, 1);
    const restarted = new TaskRunner(root, records);
    assert.equal((await restarted.list())[0].review.decision, 'accepted');
    assert.match(await readFile(path.join(app, 'docs/work-record.md'), 'utf8'), /Review: accepted/);
    await restarted.close();
  } finally { await runner.close(); await rm(root, { recursive: true, force: true }); }
});

test('request changes creates one linked draft, then requires separate planning and coding', async () => {
  const { root, records } = await fixture();
  const parent = await completedFixture(records);
  const calls = [];
  const runner = new TaskRunner(root, records, async ({ mode, prompt }) => {
    calls.push(mode);
    assert.match(prompt, /Original task reference:/);
    assert.match(prompt, /Original goal/);
    assert.match(prompt, /Add keyboard checks/);
    return 'Plan the requested changes only.';
  });
  try {
    await assert.rejects(runner.review(parent.id, 'changes_requested', ' '), /Describe/);
    assert.equal((await runner.list()).length, 1);
    const review = await runner.review(parent.id, 'changes_requested', 'Add keyboard checks');
    const repeated = await runner.review(parent.id, 'changes_requested', 'Add keyboard checks');
    assert.equal(review.followUpTaskId, repeated.followUpTaskId);
    let tasks = await runner.list();
    assert.equal(tasks.length, 2);
    const child = tasks.find(task => task.id === review.followUpTaskId);
    assert.equal(child.status, 'draft'); assert.equal(child.parentTaskId, parent.id);
    assert.equal(child.owner, parent.owner); assert.deepEqual(calls, []);
    assert.equal(tasks.find(task => task.id === parent.id).review.followUpTaskId, child.id);
    await assert.rejects(runner.step(child.id, 'code'), /not ready/);
    await runner.step(child.id, 'plan'); await waitFor(runner, child.id, 'planned'); await runner.close();
    assert.deepEqual(calls, ['plan']);
    tasks = await runner.list();
    assert.equal(tasks.find(task => task.id === child.id).result, '');
    assert.ok(tasks.find(task => task.id === parent.id).events.some(event => event.message.includes(child.id)));
  } finally { await runner.close(); await rm(root, { recursive: true, force: true }); }
});

test('review rejects unfinished/failed tasks and cross-origin or arbitrary review payloads', async () => {
  const { root, records } = await fixture();
  const runner = new TaskRunner(root, records, async () => 'Plan');
  const server = createHttpServer({ name: 'review-test', logLevel: 'silent' });
  registerTaskRoutes(server, root, root, runner);
  try {
    const task = await runner.create('apps/sample', 'Small goal'); await waitFor(runner, task.id, 'planned'); await runner.close();
    await assert.rejects(runner.review(task.id, 'accepted'), /completed/);
    const completed = await completedFixture(records);
    const { saveTask } = await import('../src/api/modules/task-runner/infrastructure/store.ts');
    const { randomUUID } = await import('node:crypto');
    const failed = { ...completed, id: randomUUID(), status: 'failed', checks: [{ name: 'typecheck', passed: false, output: 'Failed' }] };
    await saveTask(records, failed);
    await assert.rejects(runner.review(failed.id, 'accepted'), /completed/);
    const url = `/api/tasks/${completed.id}/review`;
    assert.equal((await server.inject({ method: 'POST', url, headers: { origin: 'https://other.invalid' }, payload: { decision: 'accepted' } })).statusCode, 403);
    assert.equal((await server.inject({ method: 'POST', url, payload: { decision: 'changes_requested', feedback: 'Small change', command: 'anything' } })).statusCode, 400);
    assert.equal((await server.inject({ method: 'POST', url, payload: { decision: 'changes_requested', feedback: '' } })).statusCode, 409);
    const accepted = await server.inject({ method: 'POST', url, payload: { decision: 'accepted' } });
    assert.equal(accepted.statusCode, 200); assert.equal(accepted.json().task.review.decision, 'accepted');
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});
