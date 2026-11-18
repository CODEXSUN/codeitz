import type { Kysely, Transaction } from "kysely";
import type { Database } from "./database/types.ts";
export async function listTaskPriority(db: Kysely<Database> | Transaction<Database>, historical = false) {
  let query = db.selectFrom('task_priorities').selectAll();
  if (!historical) query = query.where('active', '=', true).where('deleted_at', 'is', null);
  return query.orderBy('id').execute();
}
