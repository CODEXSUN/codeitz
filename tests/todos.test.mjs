import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHttpServer } from '@workspace/framework';
import { registerTodoRoutes } from '../src/api/modules/todos/routes.ts';
import { TodoStore } from './legacy-todo-store.ts';
import { registerApiDocumentation } from '../src/api/openapi.ts';
import { parseLocation } from '../contracts/navigation.ts';
const input = { title: 'Original todo', priority: 'medium', category: '', dueDate: '', status: 'open', projectId: '', visibility: 'private' };
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'codeitz-todos-'));
  await mkdir(path.join(root, 'apps/crm'), { recursive: true }); await mkdir(path.join(root, 'devkit/codeitz'), { recursive: true });
  const file = path.join(root, 'todos.sqlite'); const store = new TodoStore(file);
  const app = createHttpServer({ name: 'todo-test', logLevel: 'silent' });
  registerApiDocumentation(app); registerTodoRoutes(app, root, root, store);
  return { root, file, store, app, close: async () => { await app.close(); await rm(root, { recursive: true, force: true }); } };
}
test('todos persist metadata, ordering and deletion across store and server restarts', async () => {
  const f = await fixture();
  try {
    const list = (await f.app.inject('/api/v1/todos')).json(); assert.equal(list.revision, 0); assert.deepEqual(list.todos, []);
    assert.ok(list.projects.some(item => item.id === 'apps/crm' && item.icon === 'CR'));
    const created = await f.app.inject({ method: 'POST', url: '/api/v1/todos', payload: { revision: 0, input: { title: 'First' } } });
    assert.equal(created.statusCode, 201); const first = created.json().todos[0]; assert.equal(first.visibility, 'private'); assert.equal(first.priority, 'medium');
    let result = (await f.app.inject({ method: 'POST', url: '/api/v1/todos', payload: { revision: 1, input: { title: 'Second', projectId: 'apps/crm' } } })).json();
    const second = result.todos[0];
    const changes = { title: 'Inline edited', priority: 'urgent', category: 'Maintenance', dueDate: '2026-12-05', status: 'in-progress', projectId: 'apps/crm', visibility: 'public' };
    const changed = await f.app.inject({ method: 'PATCH', url: `/api/v1/todos/${first.id}`, payload: { revision: 2, changes } }); assert.equal(changed.statusCode, 200);
    result = (await f.app.inject({ method: 'POST', url: '/api/v1/todos/reorder', payload: { revision: 3, orderedIds: [first.id, second.id] } })).json();
    assert.deepEqual(result.todos.map(item => item.id), [first.id, second.id]);
    const restarted = new TodoStore(f.file).read(); assert.equal(restarted.revision, 4);
    assert.deepEqual(Object.fromEntries(Object.keys(changes).map(key => [key, restarted.todos[0][key]])), changes);
    assert.ok(changed.json().categories.includes('Maintenance'));
    const db = new DatabaseSync(f.file); try { assert.match(String(db.prepare('SELECT body FROM todos WHERE id=?').get(first.id).body), /Inline edited/); } finally { db.close(); }
    await f.app.close();
    const next = createHttpServer({ name: 'restarted', logLevel: 'silent' }); registerTodoRoutes(next, f.root, f.root, new TodoStore(f.file));
    try {
      assert.deepEqual((await next.inject('/api/v1/todos')).json().todos, restarted.todos);
      const removed = await next.inject({ method: 'DELETE', url: `/api/v1/todos/${first.id}`, payload: { revision: 4 } }); assert.equal(removed.statusCode, 200);
      assert.deepEqual(new TodoStore(f.file).read().todos.map(item => item.id), [second.id]);
      const deletedDb = new DatabaseSync(f.file); try { assert.ok(deletedDb.prepare('SELECT deleted_at FROM todos WHERE id=?').get(first.id).deleted_at); } finally { deletedDb.close(); }
    } finally { await next.close(); }
  } finally { await f.close(); }
});
test('stale writers, invalid input, incomplete orders and remote writes cannot overwrite saved todos', async () => {
  const f = await fixture();
  try {
    const one = f.store.create(0, input); const id = one.todos[0].id;
    for (const patch of [{ title: '' }, { priority: 'critical' }, { dueDate: '2026-02-30' }, { dueDate: 'not-date' }, { extra: 'unexpected' }, { projectId: '../outside' }]) {
      const response = await f.app.inject({ method: 'PATCH', url: `/api/v1/todos/${id}`, payload: { revision: 1, changes: patch } }); assert.equal(response.statusCode, 400);
    }
    assert.throws(() => new TodoStore(f.file).update(0, id, { title: 'stale' }), /another window/);
    assert.throws(() => f.store.reorder(1, []), /every current/); assert.equal(f.store.read().revision, 1);
    assert.throws(() => f.store.reorder(1, [id, id]), /every current/);
    assert.equal((await f.app.inject({ method: 'PATCH', url: `/api/v1/todos/${id}`, payload: { revision: 0, changes: { title: 'stale' } } })).statusCode, 409);
    for (const method of ['PATCH', 'DELETE']) assert.equal((await f.app.inject({ method, url: `/api/v1/todos/${id}`, headers: { origin: 'https://other.invalid' }, payload: { revision: 1, changes: { title: 'remote' } } })).statusCode, 403);
    assert.equal((await f.app.inject({ url: '/api/v1/todos', remoteAddress: '10.0.0.1' })).statusCode, 403);
    const completed = f.store.update(1, id, { status: 'done' }); assert.equal(new TodoStore(f.file).read().todos[0].status, 'done');
    assert.throws(() => f.store.update(1, id, { status: 'open' }), /another window/); assert.equal(f.store.read().revision, completed.revision);
  } finally { await f.close(); }
});
test('todo browser filters normalize and retain shareable state without draft content', () => {
  assert.equal(parseLocation('/todos?visibility=public&project=apps%2Fcrm&title=secret').canonical, '/todos?visibility=public&project=apps%2Fcrm');
  assert.equal(parseLocation('/todos?visibility=wrong&project=../outside').canonical, '/todos');
  assert.equal(parseLocation('/todos').page, 'todos');
});


test('standalone categories persist without a todo, deduplicate by case and survive restart', async () => {
  const f = await fixture();
  try {
    const created = await f.app.inject({ method: 'POST', url: '/api/v1/todos/categories', payload: { revision: 0, name: ' Maintenance ' } });
    assert.equal(created.statusCode, 201); assert.deepEqual(created.json().categories, ['Maintenance']); assert.deepEqual(created.json().todos, []);
    const duplicate = await f.app.inject({ method: 'POST', url: '/api/v1/todos/categories', payload: { revision: 1, name: 'maintenance' } });
    assert.equal(duplicate.statusCode, 201); assert.deepEqual(new TodoStore(f.file).read().categories, ['Maintenance']);
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/v1/todos/categories', payload: { revision: 2, name: ' ' } })).statusCode, 400);
    assert.equal((await f.app.inject({ method: 'POST', url: '/api/v1/todos/categories', headers: { origin: 'https://other.invalid' }, payload: { revision: 2, name: 'remote' } })).statusCode, 403);
    const saved = f.store.create(2, { ...input, category: 'maintenance' }); assert.equal(saved.todos[0].category, 'Maintenance');
    f.store.remove(saved.revision, saved.todos[0].id); assert.deepEqual(new TodoStore(f.file).read().categories, ['Maintenance']);
  } finally { await f.close(); }
});

test('scheduler persists due reminders once, catches missed reminders on startup and supports rescheduling', async () => {
  const f = await fixture();
  try {
    const past = new Date(Date.now() - 60000).toISOString();
    const created = f.store.create(0, { ...input, scheduledAt: past }); const id = created.todos[0].id;
    await f.app.ready(); // Startup must catch schedules that became due while stopped.
    const delivered = new TodoStore(f.file).read(); assert.ok(delivered.todos[0].remindedAt); assert.equal(delivered.revision, 2);
    assert.equal(f.store.deliverDue(), 0); assert.equal(f.store.read().revision, 2);
    const future = new Date(Date.now() + 86400000).toISOString();
    const rescheduled = f.store.update(2, id, { scheduledAt: future }); assert.equal(rescheduled.todos[0].remindedAt, '');
    assert.equal(f.store.deliverDue(), 0);
    assert.equal(new TodoStore(f.file).deliverDue(new Date(Date.now()+172800000).toISOString()), 1);
    const again = f.store.read(); assert.ok(again.todos[0].remindedAt);
    const cleared = f.store.update(again.revision, id, { scheduledAt: '' }); assert.equal(cleared.todos[0].remindedAt, '');
    assert.equal(f.store.deliverDue(new Date(Date.now()+259200000).toISOString()), 0);
    const done = f.store.update(cleared.revision, id, { status: 'done', scheduledAt: past }); assert.equal(f.store.deliverDue(), 0); assert.equal(f.store.read().revision, done.revision);
  } finally { await f.close(); }
});

test('schedule API validates zoned dates and persists exact time across store restart', async () => {
  const f = await fixture();
  try {
    const initial = (await f.app.inject({ method: 'POST', url: '/api/v1/todos', payload: { revision: 0, input: { title: 'Timed todo' } } })).json(); const id = initial.todos[0].id;
    for (const scheduledAt of ['2026-02-30T10:00:00.000Z', '2026-12-05T10:30', 'not-date']) {
      assert.equal((await f.app.inject({ method: 'PATCH', url: `/api/v1/todos/${id}`, payload: { revision: 1, changes: { scheduledAt } } })).statusCode, 400);
    }
    const time = new Date(Date.now()+86400000).toISOString();
    const saved = await f.app.inject({ method: 'PATCH', url: `/api/v1/todos/${id}`, payload: { revision: 1, changes: { scheduledAt: time } } });
    assert.equal(saved.statusCode, 200); assert.equal(new TodoStore(f.file).read().todos[0].scheduledAt, time);
  } finally { await f.close(); }
});

test('category rename and deletion preserve todos, reject stale/duplicate changes and survive reopen', async () => {
  const f = await fixture();
  try {
    let snapshot = f.store.create(0, { ...input, category: 'Work' });
    const id = snapshot.todos[0].id;
    snapshot = f.store.createCategory(snapshot.revision, 'Personal');
    const renamed = await f.app.inject({ method: 'PATCH', url: '/api/v1/todos/categories', payload: { revision: snapshot.revision, name: 'Work', nextName: 'Office' } });
    assert.equal(renamed.statusCode, 200); snapshot = renamed.json();
    assert.equal(snapshot.todos[0].category, 'Office');
    assert.equal((await f.app.inject({ method: 'DELETE', url: '/api/v1/todos/categories', payload: { revision: 0, name: 'Office' } })).statusCode, 409);
    assert.equal((await f.app.inject({ method: 'PATCH', url: '/api/v1/todos/categories', payload: { revision: snapshot.revision, name: 'Office', nextName: 'personal' } })).statusCode, 409);
    snapshot = f.store.remove(snapshot.revision, id);
    const removed = await f.app.inject({ method: 'DELETE', url: '/api/v1/todos/categories', payload: { revision: snapshot.revision, name: 'Office' } });
    assert.equal(removed.statusCode, 200);
    const reopened = new TodoStore(f.file).read();
    assert.deepEqual(reopened.categories, ['Personal']);
    assert.equal(reopened.todos.length, 0);
    const db = new DatabaseSync(f.file);
    try { const row = db.prepare('SELECT body,deleted_at FROM todos WHERE id=?').get(id); assert.ok(row.deleted_at); assert.equal(JSON.parse(row.body).category, ''); } finally { db.close(); }
    assert.equal(parseLocation('/todos/categories?project=apps%2Fcrm').canonical, '/todos/categories');
  } finally { await f.close(); }
});
