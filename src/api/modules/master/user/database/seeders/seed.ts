import type { Kysely } from "kysely";
import { randomInt } from "node:crypto";
import type { Database } from "../types.ts";
export async function seed(db: Kysely<Database>) {
  await db.transaction().execute(async (tx) => {
    if (
      !(await tx
        .selectFrom("users")
        .select("id")
        .where("code", "=", "you")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("users")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "you",
            name: "You",
            role: "Owner",
            kind: "human",
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
            .selectFrom("users")
            .select("id")
            .where("code", "=", "you")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("users")
        .select("id")
        .where("code", "=", "maya")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("users")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "maya",
            name: "Maya",
            role: "Supervisor",
            kind: "agent",
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
            .selectFrom("users")
            .select("id")
            .where("code", "=", "maya")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("users")
        .select("id")
        .where("code", "=", "arun")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("users")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "arun",
            name: "Arun",
            role: "Project lead",
            kind: "agent",
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
            .selectFrom("users")
            .select("id")
            .where("code", "=", "arun")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("users")
        .select("id")
        .where("code", "=", "dev")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("users")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "dev",
            name: "Dev",
            role: "Coding worker",
            kind: "agent",
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
            .selectFrom("users")
            .select("id")
            .where("code", "=", "dev")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("users")
        .select("id")
        .where("code", "=", "tara")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("users")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "tara",
            name: "Tara",
            role: "Verification worker",
            kind: "agent",
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
            .selectFrom("users")
            .select("id")
            .where("code", "=", "tara")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
  });
  return "user: required reference records retained/seeded; user edits preserved.";
}
