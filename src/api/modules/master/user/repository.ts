import type { Kysely, Transaction } from "kysely";
import type { Database } from "./database/types.ts";
export async function listUser(db: Kysely<Database> | Transaction<Database>, historical = false) {
  let query = db.selectFrom('users').selectAll();
  if (!historical) query = query.where('active', '=', true).where('deleted_at', 'is', null);
  return query.orderBy('id').execute();
}
