import {openDatabase} from '../src/api/database.ts';
import {migrate} from '../scripts/database.ts';
import {randomBytes} from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TodoStore } from './legacy-todo-store.ts';
import { createServer } from '../src/api/server.ts';
export async function createTestServer(options = {}) {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'codeitz-server-runtime-'));
  const base=openDatabase(),schema='runtime_test_'+randomBytes(8).toString('hex'),db=base.withSchema(schema);
  await base.schema.createSchema(schema).execute();
  await migrate(db,schema);
  const app = createServer({ ...options, database:options.database??db, projectDatabase:options.projectDatabase??db, runtimeRoot, runtimeDatabase:db, workTaskScheduling: false, syncScheduling:false, todoRepository: new TodoStore(path.join(runtimeRoot, 'todos.sqlite')) });
  app.addHook('onClose', async () => { await base.schema.dropSchema(schema).ifExists().cascade().execute(); await base.destroy(); if (path.dirname(runtimeRoot) !== tmpdir() || !path.basename(runtimeRoot).startsWith('codeitz-server-runtime-')) throw new Error('Invalid test cleanup path.'); rmSync(runtimeRoot, { recursive:true, force:true }); });
  return app;
}
