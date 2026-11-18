import type { Kysely, Transaction } from "kysely";
import type { Database } from "./database/types.ts";
export async function listContact(db: Kysely<Database> | Transaction<Database>, historical = false) {
  let query = db.selectFrom('contacts').selectAll();
  if (!historical) query = query.where('active', '=', true).where('deleted_at', 'is', null);
  return query.orderBy('id').execute();
}

import { randomInt } from "node:crypto";
export async function captureContact(
  db: Kysely<Database> | Transaction<Database>,
  name: string,
  mobile: string,
) {
  if (!name.trim() && !mobile.trim()) return null;
  if (mobile) {
    const existing = await db
      .selectFrom("contacts")
      .selectAll()
      .where("mobile", "=", mobile)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (existing) return existing;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db
      .insertInto("contacts")
      .values({
        public_id: Array.from(
          { length: 8 },
          () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
        ).join(""),
        name: name.trim() || mobile,
        mobile,
        created_by: "local-owner",
        updated_by: "local-owner",
        deleted_at: null,
        deleted_by: null,
      })
      .onConflict((c) => c.doNothing())
      .returningAll()
      .executeTakeFirst();
    if (row) return row;
    if (mobile) {
      const existing = await db
        .selectFrom("contacts")
        .selectAll()
        .where("mobile", "=", mobile)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (existing) return existing;
    }
  }
  throw new Error("Contact creation could not allocate a unique identity.");
}
