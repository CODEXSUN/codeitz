import { randomInt } from "node:crypto";
import { sql, type Kysely, type Transaction, type Insertable } from "kysely";
import type { CodeitzDatabase } from "../../../database.ts";
export type TaskConnection =
  Kysely<CodeitzDatabase> | Transaction<CodeitzDatabase>;
export class TaskError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 409) {
    super(message);
    this.statusCode = statusCode;
  }
}
export const actor = "local-owner";
export const audit = {
  created_by: actor,
  updated_by: actor,
  deleted_at: null,
  deleted_by: null,
};
export async function allocate<T>(
  insert: (id: string) => Promise<T | undefined>,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await insert(
      Array.from(
        { length: 8 },
        () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)],
      ).join(""),
    );
    if (row) return row;
  }
  throw new TaskError("Could not allocate a public identifier. Retry.");
}
export class TaskRepository {
  private readonly ownsDatabase: boolean;
  readonly db: Kysely<CodeitzDatabase>;
  constructor(db: Kysely<CodeitzDatabase>, ownsDatabase = true) {
    this.db = db; this.ownsDatabase = ownsDatabase;
  }
  async close() {
    if (this.ownsDatabase) await this.db.destroy();
  }
  async all(db: TaskConnection = this.db) {
    return db
      .selectFrom("tasks")
      .selectAll()
      .where("deleted_at", "is", null)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .execute();
  }
  async find(id: string, db: TaskConnection = this.db, lock = false) {
    let query = db
      .selectFrom("tasks")
      .selectAll()
      .where("public_id", "=", id)
      .where("deleted_at", "is", null);
    if (lock) query = query.forUpdate();
    const row = await query.executeTakeFirst();
    if (!row) throw new TaskError("Task not found.", 404);
    return row;
  }
  async activity(
    db: TaskConnection,
    taskId: number,
    kind: string,
    details: string,
    requestId: string | null = null,
    hash = "",
  ) {
    return allocate((id) =>
      db
        .insertInto("task_activities")
        .values({
          ...audit,
          public_id: id,
          task_id: taskId,
          kind,
          details,
          request_id: requestId,
          request_hash: hash,
        })
        .onConflict((c) => c.column("public_id").doNothing())
        .returningAll()
        .executeTakeFirst(),
    );
  }
  async save(
    build: (
      tx: Transaction<CodeitzDatabase>,
    ) => Promise<Omit<Insertable<CodeitzDatabase["tasks"]>, "public_id">>,
    requestId: string,
    hash: string,
  ) {
    return this.db.transaction().execute(async (tx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId},0))`.execute(
        tx,
      );
      const previous = await tx
        .selectFrom("tasks")
        .selectAll()
        .where("request_id", "=", requestId)
        .executeTakeFirst();
      if (previous) {
        if (previous.request_hash !== hash)
          throw new TaskError(
            "Request already used for different task details.",
          );
        return previous.public_id;
      }
      const values = await build(tx);
      const row = await allocate((id) =>
        tx
          .insertInto("tasks")
          .values({ ...values, public_id: id })
          .onConflict((c) => c.column("public_id").doNothing())
          .returningAll()
          .executeTakeFirst(),
      );
      await this.activity(tx, row.id, "Created", "Task created.");
      return row.public_id;
    });
  }
  async withTask(
    id: string,
    revision: number,
    requestId: string,
    hash: string,
    work: (
      tx: Transaction<CodeitzDatabase>,
      task: Awaited<ReturnType<TaskRepository["find"]>>,
    ) => Promise<{ kind: string; details: string }>,
  ) {
    await this.db.transaction().execute(async (tx) => {
      const task = await this.find(id, tx, true);
      const previous = await tx
        .selectFrom("task_activities")
        .selectAll()
        .where("request_id", "=", requestId)
        .executeTakeFirst();
      if (previous) {
        if (previous.task_id !== task.id || previous.request_hash !== hash)
          throw new TaskError("Request already used for a different action.");
        return;
      }
      if (task.revision !== revision)
        throw new TaskError(
          "Task changed in another window. Refresh and review before retrying.",
        );
      const result = await work(tx, task);
      await tx
        .updateTable("tasks")
        .set({
          revision: task.revision + 1,
          updated_at: new Date(),
          updated_by: actor,
        })
        .where("id", "=", task.id)
        .execute();
      await this.activity(
        tx,
        task.id,
        result.kind,
        result.details,
        requestId,
        hash,
      );
    });
  }
  async children(taskId: number, db: TaskConnection = this.db) {
    const [actions, comments, jobs, charges, schedules, checkpoints, closures] =
      await Promise.all([
        db
          .selectFrom("task_activities")
          .selectAll()
          .where("task_id", "=", taskId)
          .orderBy("id", "desc")
          .execute(),
        db
          .selectFrom("task_comments")
          .selectAll()
          .where("task_id", "=", taskId)
          .orderBy("id", "desc")
          .execute(),
        db
          .selectFrom("task_jobs")
          .selectAll()
          .where("task_id", "=", taskId)
          .orderBy("id", "desc")
          .execute(),
        db
          .selectFrom("task_charges")
          .selectAll()
          .where("task_id", "=", taskId)
          .orderBy("id", "desc")
          .execute(),
        db
          .selectFrom("task_schedules")
          .selectAll()
          .where("task_id", "=", taskId)
          .orderBy("scheduled_at")
          .execute(),
        db
          .selectFrom("task_checkpoints")
          .selectAll()
          .where("task_id", "=", taskId)
          .orderBy("id", "desc")
          .execute(),
        db
          .selectFrom("task_closure_requests")
          .selectAll()
          .where("task_id", "=", taskId)
          .orderBy("id", "desc")
          .execute(),
      ]);
    return {
      actions,
      comments,
      jobs,
      charges,
      schedules,
      checkpoints,
      closures,
    };
  }
}
