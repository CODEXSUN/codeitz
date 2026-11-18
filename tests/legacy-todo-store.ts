import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Todo, TodoInput, TodoSnapshot } from '../contracts/todo.ts';
import { TodoError } from '../src/api/modules/todos/service.ts';
export { TodoError } from '../src/api/modules/todos/service.ts';
export class TodoStore {
  private file: string;
  constructor(file: string) { this.file = file; }
  private assertLegacyWritable() { if (existsSync(path.join(path.dirname(this.file), 'postgresql-cutover.json'))) throw new TodoError('Todos moved to PostgreSQL. Restart Codeitz to use the migrated store.', 503); }
  private open() {
    this.assertLegacyWritable();
    mkdirSync(path.dirname(this.file), { recursive: true });
    const db = new DatabaseSync(this.file, { timeout: 5000 });
    db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, body TEXT NOT NULL, position INTEGER NOT NULL, deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS todo_categories (name TEXT PRIMARY KEY COLLATE NOCASE);
      INSERT OR IGNORE INTO todo_categories SELECT DISTINCT trim(json_extract(body,'$.category')) FROM todos WHERE trim(COALESCE(json_extract(body,'$.category'),'')) <> '';
      CREATE TABLE IF NOT EXISTS todo_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO todo_state VALUES(1,0);`);
    return db;
  }
  private snapshot(db: DatabaseSync): TodoSnapshot {
    const todos = db.prepare('SELECT body,position FROM todos WHERE deleted_at IS NULL ORDER BY position,id').all().map(row => ({ scheduledAt: '', remindedAt: '', ...JSON.parse(String(row.body)), position: Number(row.position) }));
    return { todos, categories: db.prepare('SELECT name FROM todo_categories ORDER BY name COLLATE NOCASE').all().map(row => String(row.name)), revision: Number(db.prepare('SELECT revision FROM todo_state WHERE id=1').get()!.revision) };
  }
  read() {
    const db = this.open();
    try { db.exec('BEGIN'); const result = this.snapshot(db); db.exec('COMMIT'); return result; }
    finally { db.close(); }
  }
  private change(revision: number, work: (db: DatabaseSync) => void) {
    const db = this.open();
    try {
      db.exec('BEGIN IMMEDIATE');
      this.assertLegacyWritable();
      if (Number(db.prepare('SELECT revision FROM todo_state WHERE id=1').get()!.revision) !== revision) throw new TodoError('Todos changed in another window. Latest records have been reloaded; review and retry.');
      work(db); db.exec('UPDATE todo_state SET revision=revision+1 WHERE id=1');
      const result = this.snapshot(db); db.exec('COMMIT'); return result;
    } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
    finally { db.close(); }
  }
  private category(db: DatabaseSync, name: string) {
    const trimmed = name.trim(); if (!trimmed) return '';
    db.prepare('INSERT OR IGNORE INTO todo_categories(name) VALUES(?)').run(trimmed);
    return String(db.prepare('SELECT name FROM todo_categories WHERE name=? COLLATE NOCASE').get(trimmed)!.name);
  }
  createCategory(revision: number, name: string) { return this.change(revision, db => { this.category(db, name); }); }
  changeCategory(revision: number, name: string, nextName?: string) {
    return this.change(revision, db => {
      const old = db.prepare('SELECT name FROM todo_categories WHERE name=? COLLATE NOCASE').get(name);
      if (!old) throw new TodoError('Category not found.', 404);
      const previous = String(old.name); const next = nextName?.trim() ?? '';
      if (nextName !== undefined && (!next || next.length > 80)) throw new TodoError('Enter a category name up to 80 characters.', 400);
      const duplicate = next ? db.prepare('SELECT name FROM todo_categories WHERE name=? COLLATE NOCASE').get(next) : undefined;
      if (duplicate && String(duplicate.name) !== previous) throw new TodoError('A category with this name already exists.');
      if (nextName === undefined) db.prepare('DELETE FROM todo_categories WHERE name=?').run(previous);
      else db.prepare('UPDATE todo_categories SET name=? WHERE name=?').run(next, previous);
      const rows = db.prepare("SELECT id,body FROM todos WHERE json_extract(body,'$.category')=? COLLATE NOCASE").all(previous);
      const update = db.prepare('UPDATE todos SET body=? WHERE id=?');
      for (const row of rows) update.run(JSON.stringify({ ...JSON.parse(String(row.body)), category: next, updatedAt: new Date().toISOString() }), String(row.id));
    });
  }
  deliverDue(now = new Date().toISOString()) {
    const db = this.open();
    try {
      db.exec('BEGIN IMMEDIATE');
      this.assertLegacyWritable();
      const due = db.prepare("SELECT id,body FROM todos WHERE deleted_at IS NULL AND json_extract(body,'$.status') <> 'done' AND COALESCE(json_extract(body,'$.scheduledAt'),'') <> '' AND json_extract(body,'$.scheduledAt') <= ? AND COALESCE(json_extract(body,'$.remindedAt'),'') = ''").all(now);
      const save = db.prepare('UPDATE todos SET body=? WHERE id=?');
      for (const row of due) { const body = JSON.parse(String(row.body)); save.run(JSON.stringify({ ...body, remindedAt: now, updatedAt: now }), String(row.id)); }
      if (due.length) db.exec('UPDATE todo_state SET revision=revision+1 WHERE id=1');
      db.exec('COMMIT'); return due.length;
    } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; } finally { db.close(); }
  }
  create(revision: number, input: TodoInput) {
    return this.change(revision, db => {
      const now = new Date().toISOString(); const id = randomUUID();
      const position = Number(db.prepare('SELECT COALESCE(MIN(position),0)-1 AS position FROM todos').get()!.position);
      db.prepare('INSERT INTO todos(id,body,position) VALUES(?,?,?)').run(id, JSON.stringify({ ...input, category: this.category(db, input.category), scheduledAt: input.scheduledAt ?? '', remindedAt: '', id, createdAt: now, updatedAt: now }), position);
    });
  }
  update(revision: number, id: string, changes: Partial<TodoInput>) {
    return this.change(revision, db => {
      const row = db.prepare('SELECT body FROM todos WHERE id=? AND deleted_at IS NULL').get(id);
      if (!row) throw new TodoError('Todo not found.', 404);
      const previous = JSON.parse(String(row.body));
      const body = { ...previous, ...changes, ...(changes.category !== undefined ? { category: this.category(db, changes.category) } : {}), ...(changes.scheduledAt !== undefined && changes.scheduledAt !== previous.scheduledAt ? { remindedAt: '' } : {}), updatedAt: new Date().toISOString() };
      db.prepare('UPDATE todos SET body=? WHERE id=?').run(JSON.stringify(body), id);
    });
  }
  remove(revision: number, id: string) {
    return this.change(revision, db => {
      const result = db.prepare('UPDATE todos SET deleted_at=? WHERE id=? AND deleted_at IS NULL').run(new Date().toISOString(), id);
      if (!result.changes) throw new TodoError('Todo not found.', 404);
    });
  }
  reorder(revision: number, orderedIds: string[]) {
    return this.change(revision, db => {
      const existing = this.snapshot(db).todos.map(todo => todo.id);
      if (orderedIds.length !== existing.length || new Set(orderedIds).size !== orderedIds.length || orderedIds.some(id => !existing.includes(id))) throw new TodoError('Order must contain every current todo exactly once.', 400);
      const update = db.prepare("UPDATE todos SET position=?,body=json_set(body,'$.updatedAt',?) WHERE id=?");
      const now = new Date().toISOString(); orderedIds.forEach((id, index) => update.run(index, now, id));
    });
  }
}
