import type { Kysely } from "kysely";
import { randomInt } from "node:crypto";
import type { Database } from "../types.ts";
export async function seed(db: Kysely<Database>) {
  await db.transaction().execute(async (tx) => {
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "new")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "new",
            name: "New",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "new")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "open")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "open",
            name: "Open",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "open")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "won")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "won",
            name: "Won",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "won")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "lost")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "lost",
            name: "Lost",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "lost")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "hold-for-approval")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "hold-for-approval",
            name: "Hold for Approval",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "hold-for-approval")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "long-hold")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "long-hold",
            name: "Long Hold",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "long-hold")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "hold-for-spares")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "hold-for-spares",
            name: "Hold for Spares",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "hold-for-spares")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "closed")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "closed",
            name: "Closed",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "closed")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "hold-for-job-out")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "hold-for-job-out",
            name: "Hold for Job-Out",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "hold-for-job-out")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "escalation")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "escalation",
            name: "Escalation",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "escalation")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
    if (
      !(await tx
        .selectFrom("task_statuses")
        .select("id")
        .where("code", "=", "reopen")
        .executeTakeFirst())
    ) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const saved = await tx
          .insertInto("task_statuses")
          .values({
            public_id: Array.from(
              { length: 8 },
              () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
            ).join(""),
            code: "reopen",
            name: "Re-open",
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
            .selectFrom("task_statuses")
            .select("id")
            .where("code", "=", "reopen")
            .executeTakeFirst())
        )
          break;
        if (attempt === 4) throw new Error("Public ID allocation exhausted.");
      }
    }
  });
  return "task-status: required reference records retained/seeded; user edits preserved.";
}
