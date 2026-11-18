import type {SyncDatabase} from './modules/sync/database/types.ts';
import type { RunnerDatabase } from './modules/task-runner/database/types.ts';
import type { ChatDatabase } from './modules/agent-chat/database/types.ts';
import type { ProjectDatabase } from './modules/projects/database/types.ts';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import { readFileSync } from 'node:fs';
import { loadCodeitzConfig } from './config.ts';
import type { TodoDatabase } from './modules/todos/database/types.ts';

import type { Database as UserDatabase } from './modules/master/user/database/types.ts';
import type { Database as ContactDatabase } from './modules/master/contact/database/types.ts';
import type { Database as TaskListDatabase } from './modules/master/task-list/database/types.ts';
import type { Database as TaskPriorityDatabase } from './modules/master/task-priority/database/types.ts';
import type { Database as TaskStatusDatabase } from './modules/master/task-status/database/types.ts';
import type { TaskDatabase } from './modules/business/task/database/types.ts';
export type CodeitzDatabase = SyncDatabase & RunnerDatabase & ChatDatabase & ProjectDatabase & TodoDatabase & UserDatabase & ContactDatabase & TaskListDatabase & TaskPriorityDatabase & TaskStatusDatabase & TaskDatabase;

export function databaseSettings() {
  const values = loadCodeitzConfig().values;
  const schema = values.CODEITZ_PG_SCHEMA ?? 'public';
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('Invalid PostgreSQL schema.');
  const host = values.PGHOST ?? '127.0.0.1';
  const mode = values.PGSSLMODE ?? 'verify-full';
  if (!['disable', 'verify-full'].includes(mode)) throw new Error('Use PGSSLMODE=disable locally or verify-full with trusted TLS.');
  const dockerPrivate=values.CODEITZ_PG_TRANSPORT==='docker-network'&&host==='postgres';
  if (mode === 'disable' && !dockerPrivate && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Remote PostgreSQL requires verified TLS.');
  return { schema, connection: {
    host, port: Number(values.PGPORT ?? 5432), database: values.PGDATABASE ?? 'codeitz', user: values.PGUSER,
    password: values.PGPASSWORD, max: 5, connectionTimeoutMillis: 5000,
    ssl: mode === 'disable' ? false as const : { rejectUnauthorized: true, ...(values.PGSSLROOTCERT ? { ca: readFileSync(values.PGSSLROOTCERT, 'utf8') } : {}) },
  } };
}
export function openDatabase() {
  const { schema, connection } = databaseSettings();
  return new Kysely<CodeitzDatabase>({ dialect: new PostgresDialect({ pool: new Pool({ ...connection, types: { getTypeParser: (oid, format) => oid === 1082 ? (value: string) => value : types.getTypeParser(oid, format) } }) }) }).withSchema(schema);
}
