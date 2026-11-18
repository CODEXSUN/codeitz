import type { Kysely } from "kysely";
import { randomInt } from "node:crypto";
import type { Database } from "../types.ts";
export async function seed(db: Kysely<Database>) {
  await db.transaction().execute(async (tx) => {
    if (
      !(await tx
        .selectFrom("task_lists")
        .select("id")
        .where("code", "=", "personal")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_lists")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "personal",
            name: "Personal",
            created_by: "system:seed",
            updated_by: "system:seed",
            deleted_at: null,
            deleted_by: null,
          })
          .onConflict((c) => c.doNothing())
          .returning("id")
          .executeTakeFirst();
        if (
          saved ||
          (await tx
            .selectFrom("task_lists")
            .select("id")
            .where("code", "=", "personal")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_lists")
        .select("id")
        .where("code", "=", "development")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_lists")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "development",
            name: "Development",
            created_by: "system:seed",
            updated_by: "system:seed",
            deleted_at: null,
            deleted_by: null,
          })
          .onConflict((c) => c.doNothing())
          .returning("id")
          .executeTakeFirst();
        if (
          saved ||
          (await tx
            .selectFrom("task_lists")
            .select("id")
            .where("code", "=", "development")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
  });
  return "task-list: required reference records retained/seeded; user edits preserved.";
}
