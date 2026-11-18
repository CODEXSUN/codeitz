import type { Kysely } from "kysely";
import { randomInt } from "node:crypto";
import type { Database } from "../types.ts";
export async function seed(db: Kysely<Database>) {
  await db.transaction().execute(async (tx) => {
    if (
      !(await tx
        .selectFrom("task_priorities")
        .select("id")
        .where("code", "=", "low")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_priorities")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "low",
            name: "Low",
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
            .selectFrom("task_priorities")
            .select("id")
            .where("code", "=", "low")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_priorities")
        .select("id")
        .where("code", "=", "normal")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_priorities")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "normal",
            name: "Normal",
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
            .selectFrom("task_priorities")
            .select("id")
            .where("code", "=", "normal")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_priorities")
        .select("id")
        .where("code", "=", "high")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_priorities")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "high",
            name: "High",
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
            .selectFrom("task_priorities")
            .select("id")
            .where("code", "=", "high")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_priorities")
        .select("id")
        .where("code", "=", "urgent")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_priorities")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "urgent",
            name: "Urgent",
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
            .selectFrom("task_priorities")
            .select("id")
            .where("code", "=", "urgent")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
  });
  return "task-priority: required reference records retained/seeded; user edits preserved.";
}
