import type { Kysely } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { databaseSettings, openDatabase } from '../src/api/database.ts';
import { appRoot } from '../src/api/config.ts';

export function applicationMigrator(db: Kysely<any>, schema: string) {
  return new Migrator({ db, migrationTableSchema: schema, provider: { async getMigrations() {
    const migrations: Record<string, Migration> = {};
    async function scan(directory: string) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await scan(file);
        else if (path.basename(directory) === 'migrations' && entry.name.endsWith('.ts')) {
          const name = entry.name.slice(0, -3);
          if (migrations[name]) throw new Error('Duplicate migration name: ' + name);
          migrations[name] = await import(pathToFileURL(file).href);
        }
      }
    }
    await scan(path.join(appRoot, 'src/api/modules'));
    return migrations;
  } } });
}
export async function migrate(db: Kysely<any>, schema: string) {
  const result = await applicationMigrator(db, schema).migrateToLatest();
  for (const item of result.results ?? []) console.log(`${item.migrationName}: ${item.status}`);
  if (result.error) throw result.error;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDatabase();
  try {
    if (process.argv.includes('--status')) for (const item of await applicationMigrator(db, databaseSettings().schema).getMigrations()) console.log(`${item.name}: ${item.executedAt ? 'applied' : 'pending'}`);
    else await migrate(db, databaseSettings().schema);
  } catch (error) { console.error(error instanceof Error ? error.message : 'Migration failed.'); process.exitCode = 1; }
  finally { await db.destroy(); }
}
