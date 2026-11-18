import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appRoot } from '../src/api/config.ts';
import { openDatabase } from '../src/api/database.ts';
import { sqliteSnapshot, importSqlite } from '../src/api/modules/todos/database/import-sqlite.ts';

const file = path.join(appRoot, '.codeitz/todos/todos.sqlite');
const destination = path.join(appRoot, '.codeitz/migrations');
const db = openDatabase();
if (!existsSync(file)) { await db.destroy(); throw new Error('Existing SQLite todo source not found. Import refused.'); }
const source = new DatabaseSync(file, { timeout: 10000 });
try {
  // Freeze legacy writes during snapshot, backup and import. Never modify source rows.
  source.exec('BEGIN IMMEDIATE');
  await mkdir(destination, { recursive: true });
  const backupFile = path.join(destination, `todos-before-postgresql-${Date.now()}.sqlite`);
  const reader = new DatabaseSync(file, { readOnly: true });
  try { await backup(reader, backupFile); } finally { reader.close(); }
  const snapshot = sqliteSnapshot(file);
  if (JSON.stringify(snapshot) !== JSON.stringify(sqliteSnapshot(backupFile))) throw new Error('Source backup verification failed.');
  const result = await importSqlite(db, snapshot);
  await writeFile(path.join(destination, 'todos-postgresql-report.json'), JSON.stringify({ ...result, backupFile, verifiedAt: new Date().toISOString() }, null, 2));
  await writeFile(path.join(appRoot, '.codeitz/todos/postgresql-cutover.json'), JSON.stringify({ database: 'PostgreSQL', checksum: result.checksum, cutoverAt: new Date().toISOString() }));
  console.log(JSON.stringify({ ...result, backupFile, verification: result.alreadyImported ? 'Source checksum matches the previously verified import; current PostgreSQL edits retained.' : 'All source fields, IDs, deleted records, categories and revision matched.' }, null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : 'Todo import failed.'); process.exitCode = 1; }
finally { if (source.isTransaction) source.exec('ROLLBACK'); source.close(); await db.destroy(); }
