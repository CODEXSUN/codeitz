import { sql, type Kysely, type Transaction } from "kysely";
import { randomInt, randomUUID } from "node:crypto";
import type { Database } from "./database/types.ts";
export async function listTaskList(db: Kysely<Database> | Transaction<Database>, historical = false) {
  let query = db.selectFrom('task_lists').selectAll();
  if (!historical) query = query.where('active', '=', true).where('deleted_at', 'is', null);
  return query.orderBy('id').execute();
}
export async function createTaskList(db: Kysely<Database>, name: string) {
  const existing = () =>
    db
      .selectFrom("task_lists")
      .selectAll()
      .where(sql<string>`lower(name)`, "=", name.toLowerCase())
      .where("deleted_at", "is", null)
      .executeTakeFirst();
  const previous = await existing();
  if (previous) return previous;
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db
      .insertInto("task_lists")
      .values({
        public_id: Array.from(
          { length: 8 },
          () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
        ).join(""),
        code: "c-" + randomUUID().replaceAll("-", ""),
        name,
        created_by: "local-owner",
        updated_by: "local-owner",
        deleted_at: null,
        deleted_by: null,
      })
      .onConflict((c) => c.doNothing())
      .returningAll()
      .executeTakeFirst();
    if (row) return row;
    const duplicate = await existing();
    if (duplicate) return duplicate;
  }
  throw new Error("List creation could not allocate a unique identity.");
}
