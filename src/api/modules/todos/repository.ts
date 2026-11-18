import { randomInt } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Todo, TodoInput, TodoSnapshot } from '../../../../contracts/todo.ts';
import type { TodoDatabase } from './database/types.ts';
import { TodoError, type TodoRepository } from './service.ts';

export const localActor = 'local-owner';
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function publicId() { return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
type Database = Kysely<TodoDatabase> | Transaction<TodoDatabase>;
const iso = (value: Date | null) => value ? value.toISOString() : '';
export class PostgresTodoRepository implements TodoRepository {
  readonly db: Kysely<TodoDatabase>;
  private makePublicId: () => string;
  constructor(db: Kysely<TodoDatabase>, makePublicId = publicId) { this.db = db; this.makePublicId = makePublicId; }
  async close() { await this.db.destroy(); }
  private async snapshot(db: Database): Promise<TodoSnapshot> {
    const rows = await db.selectFrom('todos').leftJoin('todo_categories', 'todo_categories.id', 'todos.category_id')
      .selectAll('todos').select('todo_categories.name as category_name').where('todos.deleted_at', 'is', null).orderBy('todos.position').orderBy('todos.id').execute();
    const todos: Todo[] = rows.map(row => ({ id: row.legacy_id ?? row.public_id, title: row.title,
      priority: row.priority as Todo['priority'], category: row.category_name ?? '', dueDate: row.due_date ?? '',
      scheduledAt: iso(row.scheduled_at), remindedAt: iso(row.reminded_at), status: row.status as Todo['status'],
      projectId: row.project_id, visibility: row.visibility as Todo['visibility'], position: row.position,
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }));
    const categories = await db.selectFrom('todo_categories').select('name').where('deleted_at', 'is', null).orderBy(sql`lower(name)`).execute();
    const state = await db.selectFrom('todo_state').select('revision').where('id', '=', 1).executeTakeFirst();
    if (!state) throw new TodoError('Todo database bootstrap is missing. Run db:seed.', 503);
    return { todos, categories: categories.map(row => row.name), revision: state.revision };
  }
  async read() { return this.db.transaction().setIsolationLevel('repeatable read').execute(tx => this.snapshot(tx)); }
  private async change(revision: number, work: (tx: Transaction<TodoDatabase>) => Promise<void>) {
    return this.db.transaction().execute(async tx => {
      const state = await tx.selectFrom('todo_state').selectAll().where('id', '=', 1).forUpdate().executeTakeFirst();
      if (!state) throw new TodoError('Todo database bootstrap is missing. Run db:seed.', 503);
      if (state.revision !== revision) throw new TodoError('Todos changed in another window. Latest records have been reloaded; review and retry.');
      await work(tx);
      await tx.updateTable('todo_state').set({ revision: revision + 1 }).where('id', '=', 1).execute();
      return this.snapshot(tx);
    });
  }
  private async category(tx: Database, name: string) {
    const trimmed = name.trim(); if (!trimmed) return null;
    const old = await tx.selectFrom('todo_categories').select('id').where(sql<string>`lower(name)`, '=', trimmed.toLowerCase()).where('deleted_at', 'is', null).executeTakeFirst();
    if (old) return old.id;
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await tx.insertInto('todo_categories').values({ public_id: this.makePublicId(), name: trimmed, created_by: localActor, updated_by: localActor, deleted_at: null, deleted_by: null })
        .onConflict(conflict => conflict.column('public_id').doNothing()).returning('id').executeTakeFirst();
      if (row) return row.id;
    }
    throw new TodoError('Could not allocate a category identifier. Retry.');
  }
  async createCategory(revision: number, name: string) { return this.change(revision, async tx => { await this.category(tx, name); }); }
  async changeCategory(revision: number, name: string, nextName?: string) {
    return this.change(revision, async tx => {
      const row = await tx.selectFrom('todo_categories').selectAll().where(sql<string>`lower(name)`, '=', name.toLowerCase()).where('deleted_at', 'is', null).executeTakeFirst();
      if (!row) throw new TodoError('Category not found.', 404);
      const now = new Date();
      if (nextName !== undefined) {
        const trimmed = nextName.trim(); if (!trimmed || trimmed.length > 80) throw new TodoError('Enter a category name up to 80 characters.', 400);
        const duplicate = await tx.selectFrom('todo_categories').select('id').where(sql<string>`lower(name)`, '=', trimmed.toLowerCase()).where('deleted_at', 'is', null).where('id', '!=', row.id).executeTakeFirst();
        if (duplicate) throw new TodoError('A category with this name already exists.');
        await tx.updateTable('todo_categories').set({ name: trimmed, updated_at: now, updated_by: localActor }).where('id', '=', row.id).execute();
        await tx.updateTable('todos').set({ updated_at: now, updated_by: localActor }).where('category_id', '=', row.id).execute();
      } else {
        await tx.updateTable('todos').set({ category_id: null, updated_at: now, updated_by: localActor }).where('category_id', '=', row.id).execute();
        await tx.updateTable('todo_categories').set({ active: false, deleted_at: now, deleted_by: localActor, updated_at: now, updated_by: localActor }).where('id', '=', row.id).execute();
      }
    });
  }
  private async find(tx: Database, id: string) {
    const row = await tx.selectFrom('todos').selectAll().where(eb => eb.or([eb('public_id', '=', id), eb('legacy_id', '=', id)])).where('deleted_at', 'is', null).executeTakeFirst();
    if (!row) throw new TodoError('Todo not found.', 404);
    return row;
  }
  async create(revision: number, input: TodoInput) {
    return this.change(revision, async tx => {
      const category = await this.category(tx, input.category);
      const first = await tx.selectFrom('todos').select(sql<number>`coalesce(min(position),0)-1`.as('position')).executeTakeFirstOrThrow();
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await tx.insertInto('todos').values({ public_id: this.makePublicId(), legacy_id: null, title: input.title, priority: input.priority,
          category_id: category, due_date: input.dueDate || null, scheduled_at: input.scheduledAt ? new Date(input.scheduledAt) : null,
          reminded_at: null, status: input.status, project_id: input.projectId, visibility: input.visibility, position: first.position,
          created_by: localActor, updated_by: localActor, deleted_at: null, deleted_by: null })
          .onConflict(conflict => conflict.column('public_id').doNothing()).returning('id').executeTakeFirst();
        if (row) return;
      }
      throw new TodoError('Could not allocate a todo identifier. Retry.');
    });
  }
  async update(revision: number, id: string, changes: Partial<TodoInput>) {
    return this.change(revision, async tx => {
      const old = await this.find(tx, id);
      const changed: Record<string, unknown> = { updated_at: new Date(), updated_by: localActor };
      for (const [key, column] of Object.entries({ title: 'title', priority: 'priority', status: 'status', projectId: 'project_id', visibility: 'visibility' })) {
        if (key in changes) changed[column] = changes[key as keyof TodoInput];
      }
      if (changes.category !== undefined) changed.category_id = await this.category(tx, changes.category);
      if (changes.dueDate !== undefined) changed.due_date = changes.dueDate || null;
      if (changes.scheduledAt !== undefined) {
        changed.scheduled_at = changes.scheduledAt ? new Date(changes.scheduledAt) : null;
        if (changes.scheduledAt !== iso(old.scheduled_at)) changed.reminded_at = null;
      }
      await tx.updateTable('todos').set(changed).where('id', '=', old.id).execute();
    });
  }
  async remove(revision: number, id: string) {
    return this.change(revision, async tx => {
      const old = await this.find(tx, id); const now = new Date();
      await tx.updateTable('todos').set({ deleted_at: now, deleted_by: localActor, updated_at: now, updated_by: localActor }).where('id', '=', old.id).execute();
    });
  }
  async reorder(revision: number, ids: string[]) {
    return this.change(revision, async tx => {
      const existing = (await this.snapshot(tx)).todos.map(todo => todo.id);
      if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some(id => !existing.includes(id))) throw new TodoError('Order must contain every current todo exactly once.', 400);
      for (const [position, id] of ids.entries()) {
        const row = await this.find(tx, id);
        await tx.updateTable('todos').set({ position, updated_at: new Date(), updated_by: localActor }).where('id', '=', row.id).execute();
      }
    });
  }
  async deliverDue(now = new Date().toISOString()) {
    return this.db.transaction().execute(async tx => {
      await tx.selectFrom('todo_state').select('id').where('id', '=', 1).forUpdate().executeTakeFirstOrThrow();
      const rows = await tx.updateTable('todos').set({ reminded_at: new Date(now), updated_at: new Date(now), updated_by: 'system:todo-scheduler' })
        .where('deleted_at', 'is', null).where('status', '!=', 'done').where('scheduled_at', '<=', new Date(now)).where('reminded_at', 'is', null).returning('id').execute();
      if (rows.length) await tx.updateTable('todo_state').set({ revision: sql`revision + 1` }).where('id', '=', 1).execute();
      return rows.length;
    });
  }
}
