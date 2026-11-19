import { access, readFile } from 'node:fs/promises';
import { openDatabase } from '../src/api/database.ts';
import { requirePreflight, waitForReadiness, type StartupReadinessOptions } from '@workspace/framework';
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
  const db = openDatabase({queryTimeoutMs: 5000});
  try { await checkDatabase(db); }
  finally { await db.destroy(); }
  return config;
}

// Retry only temporary connectivity/recovery failures; configuration/schema errors fail closed.
export function temporaryPostgresFailure(error: unknown): boolean {
  const code = (error as {code?: string})?.code;
  return typeof code === 'string' && ['57P03','08000','08001','08003','08006','53300','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','EAI_AGAIN'].includes(code);
}
export async function checkDatabase(db: ReturnType<typeof openDatabase>, policy: Omit<StartupReadinessOptions, 'retryOnError'> = {}) {
  try {
    return await waitForReadiness(async signal => {
      if (signal.aborted) return false;
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
      return true;
    }, {timeoutMs: 60000, retryOnError: temporaryPostgresFailure, ...policy});
  } catch (cause) { throw new Error('Codeitz PostgreSQL preflight failed. Check PG settings, db:migrate and db:seed.', {cause}); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await preflight(); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Preflight failed.'); process.exitCode = 1; }
}
