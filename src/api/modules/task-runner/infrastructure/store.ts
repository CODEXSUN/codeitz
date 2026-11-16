import { readFile, readdir, lstat, realpath, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { CodingTask, TaskEvent } from '../../../../../contracts/task.ts';

function openStore(directory: string) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'runner.sqlite'), { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, time TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_task ON events(task_id, id);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  if (!db.prepare("SELECT value FROM metadata WHERE key='json-import'").get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const insert = db.prepare('INSERT OR IGNORE INTO tasks VALUES (?, ?, ?)');
      for (const file of readdirSync(directory).filter(file => /^[a-f0-9-]{36}\.json$/.test(file))) {
        const task = JSON.parse(readFileSync(path.join(directory, file), 'utf8')) as CodingTask;
        insert.run(task.id, task.createdAt, JSON.stringify(task));
      }
      db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('json-import', new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  return db;
}

export function safeActivity(message: string) {
  return message.replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]').slice(0, 4000);
}

export async function saveTask(directory: string, task: CodingTask) { await saveTasks(directory, [task]); }

export async function saveTasks(directory: string, tasks: CodingTask[]) {
  const db = openStore(directory);
  try {
    db.exec('BEGIN IMMEDIATE');
    const statement = db.prepare('INSERT INTO tasks VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body');
    for (const task of tasks) {
      task.updatedAt = new Date().toISOString();
      const { events: _events, ...body } = task;
      statement.run(task.id, task.createdAt, JSON.stringify(body));
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  finally { db.close(); }
}

export async function readTasks(directory: string): Promise<CodingTask[]> {
  const db = openStore(directory);
  try {
    return db.prepare('SELECT body FROM tasks ORDER BY created_at DESC').all().map(row => {
      const task = JSON.parse(String(row.body)) as CodingTask;
      task.events = db.prepare('SELECT id, task_id AS taskId, time, kind, message FROM (SELECT * FROM events WHERE task_id=? ORDER BY id DESC LIMIT 200) ORDER BY id').all(task.id) as TaskEvent[];
      return task;
    });
  } finally { db.close(); }
}

export function appendEvent(directory: string, taskId: string, kind: TaskEvent['kind'], message: string): TaskEvent {
  const db = openStore(directory);
  const time = new Date().toISOString(); message = safeActivity(message);
  try {
    const result = db.prepare('INSERT INTO events(task_id,time,kind,message) VALUES (?,?,?,?)').run(taskId, time, kind, message);
    return { id: Number(result.lastInsertRowid), taskId, time, kind, message };
  } finally { db.close(); }
}

export function allEvents(directory: string, taskId: string) {
  const db = openStore(directory);
  try { return db.prepare('SELECT id, task_id AS taskId, time, kind, message FROM events WHERE task_id=? ORDER BY id').all(taskId) as TaskEvent[]; }
  finally { db.close(); }
}

export async function optionalText(file: string) {
  try { return (await readFile(file, 'utf8')).slice(-30000); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'No work record exists yet.'; throw error; }
}

export async function snapshot(directory: string) {
  const hashes: Record<string, string> = {};
  async function walk(relative: string) {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      if (['node_modules', '.git', 'dist', '.codeitz', '.env', '.env.local'].includes(entry.name) || entry.name.startsWith('.env.')) continue;
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) hashes[name.replaceAll('\\', '/')] = createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex');
    }
  }
  await walk('');
  return hashes;
}

export async function recordWork(directory: string, task: CodingTask) {
  const docs = path.join(directory, 'docs');
  const info = await lstat(docs);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(docs) !== docs) throw new Error('Work record folder must be an app-owned directory.');
  const file = path.join(docs, 'work-record.md');
  try { const record = await lstat(file); if (!record.isFile() || record.isSymbolicLink()) throw new Error('Work record must be an app-owned file.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await appendFile(file, `\n## Codeitz task ${task.id}\n\n- Updated: ${task.updatedAt}\n- Goal: ${task.goal.replaceAll('\n', ' ')}\n- Status: ${task.status}\n- Changes: ${task.changedFiles.length ? task.changedFiles.join(', ') : 'None recorded'}\n- Checks: ${task.checks.map(check => `${check.name}: ${check.passed ? 'passed' : 'failed'}`).join('; ') || 'Not run'}\n- Review: ${task.review?.decision ?? 'Not reviewed'}${task.review?.feedback ? ` — ${task.review.feedback.replaceAll('\n', ' ')}` : ''}\n- Parent task: ${task.parentTaskId ?? 'None'}\n- Follow-up task: ${task.review?.followUpTaskId ?? 'None'}\n- Next: ${task.review?.decision === 'accepted' ? 'Result accepted. Review before committing or releasing.' : task.review?.decision === 'changes_requested' ? 'Open the linked follow-up and explicitly start its plan.' : task.status === 'planned' ? 'Review the plan, then explicitly start coding.' : task.status === 'coded' ? 'Run checks and review the changes.' : task.status === 'completed' ? 'Review the result before committing or releasing.' : 'Resolve the reported failure before continuing.'}\n`);
  const summary = task.status === 'planned' ? task.plan : task.error || task.result;
  if (summary) await appendFile(file, `\n${summary.slice(0, 6000)}\n`);
}
