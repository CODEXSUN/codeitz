import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { TodoDatabase } from './types.ts';
import { publicId } from '../repository.ts';
import { todoFields } from '../../../../../contracts/todo.ts';

export function sqliteSnapshot(file: string) {
  const source = new DatabaseSync(file, { readOnly: true });
  try {
    source.exec('BEGIN');
    const rows = source.prepare('SELECT id,body,position,deleted_at FROM todos ORDER BY id').all();
    const categories = source.prepare('SELECT name FROM todo_categories ORDER BY name').all().map(row => String(row.name));
    const revision = Number(source.prepare('SELECT revision FROM todo_state WHERE id=1').get()!.revision);
    source.exec('COMMIT');
    return { rows: rows.map(row => ({ id: String(row.id), body: JSON.parse(String(row.body)), position: Number(row.position), deleted_at: row.deleted_at ? String(row.deleted_at) : null })), categories, revision };
  } finally { source.close(); }
}
export type SqliteSnapshot = ReturnType<typeof sqliteSnapshot>;
const normalized = (snapshot: SqliteSnapshot) => snapshot.rows.map(row => ({ ...row.body, scheduledAt: row.body.scheduledAt ?? '', remindedAt: row.body.remindedAt ?? '', position: row.position, deleted_at: row.deleted_at })).sort((a,b) => a.id.localeCompare(b.id));

export async function importSqlite(db: Kysely<TodoDatabase>, snapshot: SqliteSnapshot) {
  const checksum = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return db.transaction().execute(async tx => {
    await tx.selectFrom('todo_state').selectAll().where('id', '=', 1).forUpdate().executeTakeFirstOrThrow();
    const previous = await tx.selectFrom('todo_imports').selectAll().where('source', '=', 'sqlite-todos-v1').executeTakeFirst();
    if (previous) {
      if (previous.checksum !== checksum) throw new Error('SQLite changed after its recorded import. Refusing to overwrite PostgreSQL.');
      return { alreadyImported: true, checksum, rows: snapshot.rows.length, categories: snapshot.categories.length, revision: snapshot.revision };
    }
    if (Number((await tx.selectFrom('todos').select(sql<number>`count(*)::int`.as('count')).executeTakeFirstOrThrow()).count) || Number((await tx.selectFrom('todo_categories').select(sql<number>`count(*)::int`.as('count')).executeTakeFirstOrThrow()).count)) throw new Error('Todo destination is not empty. Refusing to overwrite records.');
    const categories = new Map<string, number>();
    for (const name of snapshot.categories) {
      if (!name.trim() || name.length > 80) throw new Error('Invalid source category.');
      let savedId: number | undefined;
      for (let attempt=0; attempt<5; attempt++) {
        const row = await tx.insertInto('todo_categories').values({ public_id: publicId(), name, created_by: 'system:sqlite-import', updated_by: 'system:sqlite-import', deleted_at: null, deleted_by: null }).onConflict(conflict => conflict.column('public_id').doNothing()).returning('id').executeTakeFirst();
        if (row) { savedId = row.id; break; }
      }
      if (savedId === undefined) throw new Error('Import could not allocate a category identifier.');
      categories.set(name.toLowerCase(), savedId);
    }
    for (const row of snapshot.rows) {
      const original = row.body;
      if (original.id !== row.id || !/^[0-9a-f-]{36}$/i.test(row.id)) throw new Error('Invalid or mismatched legacy todo ID.');
      const fields = todoFields.parse(Object.fromEntries(['title','priority','category','dueDate','scheduledAt','status','projectId','visibility'].filter(key => original[key] !== undefined).map(key => [key, original[key]])));
      const category = fields.category ? categories.get(fields.category.toLowerCase()) : null;
      if (fields.category && category === undefined) throw new Error('Missing source category reference.');
      let inserted = false;
      for (let attempt=0; attempt<5; attempt++) {
      const saved = await tx.insertInto('todos').values({ public_id: publicId(), legacy_id: row.id, title: fields.title, priority: fields.priority, category_id: category ?? null,
        due_date: fields.dueDate || null, scheduled_at: fields.scheduledAt ? new Date(fields.scheduledAt) : null, reminded_at: original.remindedAt ? new Date(original.remindedAt) : null,
        status: fields.status, project_id: fields.projectId, visibility: fields.visibility, position: row.position,
        created_at: new Date(original.createdAt), updated_at: new Date(original.updatedAt), created_by: 'system:sqlite-import', updated_by: 'system:sqlite-import',
        deleted_at: row.deleted_at ? new Date(row.deleted_at) : null, deleted_by: row.deleted_at ? 'system:sqlite-import' : null }).onConflict(conflict => conflict.column('public_id').doNothing()).returning('id').executeTakeFirst();
      if (saved) { inserted = true; break; }
      }
      if (!inserted) throw new Error('Import could not allocate a todo identifier.');
    }
    await tx.updateTable('todo_state').set({ revision: snapshot.revision }).where('id', '=', 1).execute();
    const persisted = await tx.selectFrom('todos').leftJoin('todo_categories', 'todo_categories.id', 'todos.category_id').selectAll('todos').select('todo_categories.name as category_name').execute();
    const actual = persisted.map(row => ({ id: row.legacy_id, title: row.title, priority: row.priority, category: row.category_name ?? '', dueDate: row.due_date ?? '', scheduledAt: row.scheduled_at?.toISOString() ?? '', remindedAt: row.reminded_at?.toISOString() ?? '', status: row.status, projectId: row.project_id, visibility: row.visibility, position: row.position, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), deleted_at: row.deleted_at?.toISOString() ?? null })).sort((a,b) => a.id!.localeCompare(b.id!));
    const expected = normalized(snapshot);
    for (let index=0; index<expected.length; index++) {
      for (const key of Object.keys(expected[index])) if (JSON.stringify(expected[index][key]) !== JSON.stringify(actual[index][key as keyof typeof actual[number]])) throw new Error('Migration verification failed for field: ' + key);
    }
    if (actual.length !== expected.length) throw new Error('Migration count mismatch.');
    const categoryNames = (await tx.selectFrom('todo_categories').select('name').execute()).map(row=>row.name).sort();
    if (JSON.stringify(categoryNames) !== JSON.stringify([...snapshot.categories].sort())) throw new Error('Migration category mismatch.');
    await tx.insertInto('todo_imports').values({ source: 'sqlite-todos-v1', checksum, details: JSON.stringify({ rows: actual.length, categories: categoryNames.length, revision: snapshot.revision }) }).execute();
    return { alreadyImported: false, checksum, rows: actual.length, categories: categoryNames.length, revision: snapshot.revision };
  });
}
