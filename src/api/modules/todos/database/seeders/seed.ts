import type { Kysely } from 'kysely';
import type { TodoDatabase } from '../types.ts';
export async function seed(db: Kysely<TodoDatabase>) {
  await db.insertInto('todo_state').values({ id: 1, revision: 0 }).onConflict(conflict => conflict.column('id').doNothing()).execute();
  return 'Todos and categories: no business defaults or demo records; technical revision bootstrap only (existing values retained).';
}
