import { access, readFile } from 'node:fs/promises';
import { openDatabase } from '../src/api/database.ts';
import { requirePreflight } from '@workspace/framework';
import { loadCodeitzConfig } from '../src/api/config.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function preflight() {
  const config = loadCodeitzConfig();
  await requirePreflight({
    name: 'Codeitz', root: config.appRoot, host: config.host, port: config.port,
    requiredPaths: [
      { path: 'dist/web/index.html', kind: 'file', label: 'Frontend build' },
      { path: 'src/api/server.ts', kind: 'file', label: 'Server entry' },
      { path: 'node_modules/@workspace/ui/dist/src/index.js', kind: 'file', label: 'Shared UI build' },
      { path: path.join(config.auditRoot, 'mcp-governance/docs/governance.md'), kind: 'file', label: 'Workspace governance' },
    ],
  });
  const db = openDatabase();
  try {
    await db.selectFrom('sync_connections').select(['allow_send','remote_environment']).limit(1).execute();
    await db.selectFrom('sync_deliveries').select('approved_to_send').limit(1).execute();
    await db.selectFrom('sync_identity').select('origin').executeTakeFirstOrThrow();
    await db.selectFrom('sync_policies').select('save_mode').where('table_name','=','project_modules').executeTakeFirstOrThrow();
    await db.selectFrom('projects').select(['id','order_no','active']).limit(1).execute();
    await db.selectFrom('coding_tasks').select('id').limit(1).execute();
    await db.selectFrom('agent_chat_state').select('id').where('id','=',1).executeTakeFirstOrThrow();
    await db.selectFrom('todo_state').select('revision').where('id', '=', 1).executeTakeFirstOrThrow();
    await db.selectFrom('todos').select('public_id').limit(1).execute();
    await db.selectFrom('todo_categories').select('public_id').limit(1).execute();
    await db.selectFrom('tasks').select('public_id').limit(1).execute();
    await db.selectFrom('users').select('id').where('code','=','you').executeTakeFirstOrThrow();
    await db.selectFrom('task_priorities').select('id').where('code','=','normal').executeTakeFirstOrThrow();
    await db.selectFrom('task_statuses').select('id').where('code','=','closed').executeTakeFirstOrThrow();
  } catch { throw new Error('Codeitz PostgreSQL preflight failed. Check PG settings, db:migrate and db:seed.'); }
  finally { await db.destroy(); }
  return config;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await preflight(); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Preflight failed.'); process.exitCode = 1; }
}
