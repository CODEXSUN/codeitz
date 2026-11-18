import { readFile, readdir, lstat, realpath, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { RunnerDatabase } from '../database/types.ts';
import path from 'node:path';
import type { CodingTask, TaskEvent } from '../../../../../contracts/task.ts';

export function safeActivity(message: string) {
  return message.replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]').slice(0, 4000);
}

export async function saveTask(db:Kysely<RunnerDatabase>,task:CodingTask){await saveTasks(db,[task]);}
export async function saveTasks(db:Kysely<RunnerDatabase>,tasks:CodingTask[]){
 await db.transaction().execute(async tx=>{for(const task of tasks){task.updatedAt=new Date().toISOString();const {events,...body}=task;await tx.insertInto('coding_tasks').values({id:task.id,created_at:task.createdAt,body:JSON.stringify(body)}).onConflict(c=>c.column('id').doUpdateSet({body:JSON.stringify(body)})).execute();}});
}
export async function readTasks(db:Kysely<RunnerDatabase>):Promise<CodingTask[]>{
 return db.transaction().setIsolationLevel('repeatable read').execute(async tx=>{
  const tasks=(await tx.selectFrom('coding_tasks').select('body').orderBy('created_at','desc').execute()).map(row=>JSON.parse(row.body) as CodingTask);
  for(const task of tasks)task.events=(await tx.selectFrom('coding_task_events').select(['id','task_id as taskId','time','kind','message']).where('task_id','=',task.id).orderBy('id','desc').limit(200).execute()).reverse() as TaskEvent[];
  return tasks;
 });
}
export async function appendEvent(db:Kysely<RunnerDatabase>,taskId:string,kind:TaskEvent['kind'],message:string):Promise<TaskEvent>{
 const time=new Date().toISOString();message=safeActivity(message);const row=await db.insertInto('coding_task_events').values({task_id:taskId,time,kind,message}).returning('id').executeTakeFirstOrThrow();return {id:row.id,taskId,time,kind,message};
}
export async function allEvents(db:Kysely<RunnerDatabase>,taskId:string){return await db.selectFrom('coding_task_events').select(['id','task_id as taskId','time','kind','message']).where('task_id','=',taskId).orderBy('id').execute() as TaskEvent[];}

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
