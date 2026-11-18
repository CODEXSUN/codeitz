import { createHash } from "node:crypto";
import type {
  TaskInput,
  TaskAction,
  WorkTask,
  TaskDetail,
  TaskOptions,
  WorkflowRow,
} from "../../../../../contracts/work-task.ts";
import { listUser } from "../../master/user/index.ts";
import { listContact, captureContact } from "../../master/contact/index.ts";
import { listTaskList } from "../../master/task-list/index.ts";
import { listTaskPriority } from "../../master/task-priority/index.ts";
import { listTaskStatus } from "../../master/task-status/index.ts";
import {
  TaskRepository,
  TaskError,
  actor,
  audit,
  allocate,
  type TaskConnection,
} from "./repository.ts";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const iso = (value: Date | null | undefined) => value?.toISOString() ?? "";
export class TaskService {
  readonly repo: TaskRepository;
  constructor(repo: TaskRepository) {
    this.repo = repo;
  }
  async close() {
    await this.repo.close();
  }
  private async rawOptions(db: TaskConnection = this.repo.db, historical = false) {
    const [users, contacts, lists, priorities, statuses] = await Promise.all([
      listUser(db, historical),
      listContact(db, historical),
      listTaskList(db, historical),
      listTaskPriority(db, historical),
      listTaskStatus(db, historical),
    ]);
    return { users, contacts, lists, priorities, statuses };
  }
  async options(): Promise<TaskOptions> {
    const options = await this.rawOptions();
    const map = (
      rows: {
        public_id: string;
        name: string;
        code?: string;
        mobile?: string;
        role?: string;
        kind?: string;
      }[],
    ) =>
      rows.map((row) => ({
        id: row.public_id,
        name: row.name,
        ...("code" in row ? { code: row.code } : {}),
        ...("mobile" in row ? { mobile: row.mobile } : {}),
        ...("role" in row ? { role: row.role, kind: row.kind } : {}),
      }));
    return {
      users: map(options.users),
      contacts: map(options.contacts),
      lists: map(options.lists),
      priorities: map(options.priorities),
      statuses: map(options.statuses),
    };
  }
  private view(
    row: Awaited<ReturnType<TaskRepository["find"]>>,
    options: Awaited<ReturnType<TaskService["rawOptions"]>>,
    pending = false,
    running = false,
  ): WorkTask {
    const contact = options.contacts.find((item) => item.id === row.contact_id);
    const list = options.lists.find((item) => item.id === row.list_id);
    const user = options.users.find((item) => item.id === row.assigned_user_id);
    const priority = options.priorities.find(
      (item) => item.id === row.priority_id,
    );
    const status = options.statuses.find((item) => item.id === row.status_id);
    return {
      id: row.public_id,
      title: row.title,
      details: row.details,
      revision: row.revision,
      contactId: contact?.public_id ?? "",
      contactName: contact?.name ?? "",
      mobile: contact?.mobile ?? "",
      listId: list?.public_id ?? "",
      list: list?.name ?? "",
      assignedUserId: user?.public_id ?? "",
      assignedTo: user?.name ?? "",
      priorityId: priority?.public_id ?? "",
      priority: priority?.name ?? "",
      priorityCode: priority?.code ?? "",
      statusId: status?.public_id ?? "",
      status: status?.name ?? "",
      statusCode: status?.code ?? "",
      dueDate: row.due_date ?? "",
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      createdBy: row.created_by === actor ? "You" : row.created_by,
      closurePending: pending,
      runningJob: running,
    };
  }
  async list() {
    return this.repo.db
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (tx) => {
        const [rows, options, pending, running] = await Promise.all([
          this.repo.all(tx),
          this.rawOptions(tx, true),
          tx
            .selectFrom("task_closure_requests")
            .select("task_id")
            .where("state", "=", "pending")
            .execute(),
          tx
            .selectFrom("task_jobs")
            .select("task_id")
            .where("stopped_at", "is", null)
            .execute(),
        ]);
        return rows.map((row) =>
          this.view(
            row,
            options,
            pending.some((item) => item.task_id === row.id),
            running.some((item) => item.task_id === row.id),
          ),
        );
      });
  }
  async get(id: string): Promise<TaskDetail> {
    return this.repo.db
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (tx) => {
        const row = await this.repo.find(id, tx);
        const [children, options] = await Promise.all([
          this.repo.children(row.id, tx),
          this.rawOptions(tx, true),
        ]);
        const convert = (records: Record<string, any>[]): WorkflowRow[] =>
          records.map((item) => ({
            id: item.public_id,
            createdBy: item.created_by === actor ? "You" : item.created_by,
            createdAt: iso(item.created_at),
            ...Object.fromEntries(
              [
                "kind",
                "details",
                "body",
                "note",
                "amount",
                "currency",
                "description",
                "title",
                "state",
                "reason",
              ]
                .filter((key) => item[key] != null)
                .map((key) => [key, String(item[key])]),
            ),
            ...(item.parent_id
              ? {
                  parentId: children.comments.find(
                    (comment) => comment.id === item.parent_id,
                  )?.public_id,
                }
              : {}),
            ...(item.started_at
              ? {
                  startedAt: iso(item.started_at),
                  stoppedAt: iso(item.stopped_at),
                }
              : {}),
            ...(item.checked_in_at
              ? {
                  startedAt: iso(item.checked_in_at),
                  stoppedAt: iso(item.checked_out_at),
                }
              : {}),
            ...(item.scheduled_at
              ? {
                  scheduledAt: iso(item.scheduled_at),
                  remindedAt: iso(item.reminded_at),
                }
              : {}),
            ...(item.review_note
              ? {
                  reviewNote: item.review_note,
                  reviewedBy:
                    item.reviewed_by === actor ? "You" : item.reviewed_by,
                }
              : {}),
          }));
        return {
          task: this.view(
            row,
            options,
            children.closures.some((item) => item.state === "pending"),
            children.jobs.some((item) => !item.stopped_at),
          ),
          actions: convert(children.actions),
          comments: convert(children.comments),
          jobs: convert(children.jobs),
          charges: convert(children.charges.filter((item) => !item.deleted_at)),
          schedules: convert(children.schedules),
          checkpoints: convert(children.checkpoints),
          closures: convert(children.closures),
        };
      });
  }
  private async values(
    input: TaskInput,
    db: TaskConnection,
    allowClosed = false,
  ) {
    const options = await this.rawOptions(db);
    const resolve = (
      items: { id: number; public_id: string }[],
      id: string,
      label: string,
    ) => {
      if (!id) return null;
      const item = items.find((item) => item.public_id === id);
      if (!item) throw new TaskError(`Select an active ${label}.`, 400);
      return item.id;
    };
    const priority = resolve(options.priorities, input.priorityId, "priority");
    const status = options.statuses.find(
      (item) => item.public_id === input.statusId,
    );
    if (!priority || !status)
      throw new TaskError("Select a valid priority and status.", 400);
    if (status.code === "closed" && !allowClosed)
      throw new TaskError(
        "Close tasks through a reviewed closure request.",
        400,
      );
    let contact = resolve(options.contacts, input.contactId, "contact");
    if (!contact && (input.contactName || input.mobile))
      contact = (await captureContact(db, input.contactName, input.mobile))!.id;
    return {
      title: input.title,
      details: input.details,
      contact_id: contact,
      list_id: resolve(options.lists, input.listId, "list"),
      assigned_user_id: resolve(
        options.users,
        input.assignedUserId,
        "assignee",
      ),
      priority_id: priority,
      status_id: status.id,
      due_date: input.dueDate || null,
    };
  }
  async create(input: TaskInput, requestId: string) {
    const id = await this.repo.save(
      async (tx) => ({
        ...audit,
        ...(await this.values(input, tx)),
        request_id: requestId,
        request_hash: hash(input),
      }),
      requestId,
      hash(input),
    );
    return this.get(id);
  }
  async update(
    id: string,
    input: TaskInput,
    revision: number,
    requestId: string,
  ) {
    await this.repo.withTask(
      id,
      revision,
      requestId,
      hash({ action: "edit", input }),
      async (tx, task) => {
        const options = await this.rawOptions(tx);
        const oldStatus = options.statuses.find(
          (item) => item.id === task.status_id,
        );
        const values = await this.values(
          input,
          tx,
          oldStatus?.code === "closed",
        );
        if (
          oldStatus?.code !== "closed" &&
          options.statuses.find((item) => item.id === values.status_id)
            ?.code === "closed"
        )
          throw new TaskError("Closure approval required.");
        await tx
          .updateTable("tasks")
          .set(values)
          .where("id", "=", task.id)
          .execute();
        return { kind: "Updated", details: "Task properties updated." };
      },
    );
    return this.get(id);
  }
  async act(
    id: string,
    revision: number,
    requestId: string,
    input: TaskAction,
  ) {
    await this.repo.withTask(
      id,
      revision,
      requestId,
      hash(input),
      async (tx, task) => {
        const options = await this.rawOptions(tx);
        if (
          options.statuses.find((item) => item.id === task.status_id)?.code ===
          "closed"
        )
          throw new TaskError("Reopen the task before adding work.");
        const now = new Date();
        const base = { ...audit, task_id: task.id };
        if (input.action === "comment") {
          if (
            !input.body
              .replace(/<[^>]*>/g, " ")
              .replace(/&nbsp;/g, " ")
              .trim()
          )
            throw new TaskError("Enter a nonempty comment.", 400);
          const parent = input.parentId
            ? await tx
                .selectFrom("task_comments")
                .selectAll()
                .where("public_id", "=", input.parentId)
                .where("task_id", "=", task.id)
                .executeTakeFirst()
            : null;
          if (input.parentId && (!parent || parent.parent_id))
            throw new TaskError(
              "Select a top-level comment from this task.",
              400,
            );
          await allocate((public_id) =>
            tx
              .insertInto("task_comments")
              .values({
                ...base,
                public_id,
                body: input.body,
                parent_id: parent?.id ?? null,
              })
              .onConflict((c) => c.column("public_id").doNothing())
              .returning("id")
              .executeTakeFirst(),
          );
          return { kind: "Comment", details: input.body };
        }
        if (input.action === "start-job") {
          if (
            await tx
              .selectFrom("task_jobs")
              .select("id")
              .where("task_id", "=", task.id)
              .where("stopped_at", "is", null)
              .executeTakeFirst()
          )
            throw new TaskError("A job is already running.");
          await allocate((public_id) =>
            tx
              .insertInto("task_jobs")
              .values({
                ...base,
                public_id,
                note: input.note,
                stopped_at: null,
              })
              .onConflict((c) => c.column("public_id").doNothing())
              .returning("id")
              .executeTakeFirst(),
          );
          return {
            kind: "Job started",
            details: input.note || "Work timer started.",
          };
        }
        if (input.action === "stop-job") {
          const changed = await tx
            .updateTable("task_jobs")
            .set({ stopped_at: now, updated_at: now, updated_by: actor })
            .where("task_id", "=", task.id)
            .where("stopped_at", "is", null)
            .returning("id")
            .execute();
          if (!changed.length) throw new TaskError("No job is running.");
          return { kind: "Job stopped", details: "Work timer stopped." };
        }
        if (input.action === "check-in") {
          if (
            await tx
              .selectFrom("task_checkpoints")
              .select("id")
              .where("task_id", "=", task.id)
              .where("checked_out_at", "is", null)
              .executeTakeFirst()
          )
            throw new TaskError("Already checked in.");
          await allocate((public_id) =>
            tx
              .insertInto("task_checkpoints")
              .values({
                ...base,
                public_id,
                note: input.note,
                checked_out_at: null,
              })
              .onConflict((c) => c.column("public_id").doNothing())
              .returning("id")
              .executeTakeFirst(),
          );
          return {
            kind: "Checked in",
            details: input.note || "Check-in recorded.",
          };
        }
        if (input.action === "check-out") {
          const changed = await tx
            .updateTable("task_checkpoints")
            .set({ checked_out_at: now, updated_at: now, updated_by: actor })
            .where("task_id", "=", task.id)
            .where("checked_out_at", "is", null)
            .returning("id")
            .execute();
          if (!changed.length) throw new TaskError("No open check-in.");
          return { kind: "Checked out", details: "Check-out recorded." };
        }
        if (input.action === "charge") {
          await allocate((public_id) =>
            tx
              .insertInto("task_charges")
              .values({
                ...base,
                public_id,
                description: input.description,
                amount: input.amount,
                currency: input.currency,
              })
              .onConflict((c) => c.column("public_id").doNothing())
              .returning("id")
              .executeTakeFirst(),
          );
          return {
            kind: "Charge added",
            details: `${input.currency} ${input.amount} · ${input.description}`,
          };
        }
        if (input.action === "schedule") {
          if (new Date(input.scheduledAt) <= now)
            throw new TaskError("Choose a future schedule time.", 400);
          await allocate((public_id) =>
            tx
              .insertInto("task_schedules")
              .values({
                ...base,
                public_id,
                title: input.title,
                scheduled_at: new Date(input.scheduledAt),
                state: "pending",
                reminded_at: null,
              })
              .onConflict((c) => c.column("public_id").doNothing())
              .returning("id")
              .executeTakeFirst(),
          );
          return {
            kind: "Scheduled",
            details: `${input.title} · ${input.scheduledAt}`,
          };
        }
        if (input.action === "schedule-state") {
          const row = await tx
            .updateTable("task_schedules")
            .set({ state: input.state, updated_at: now, updated_by: actor })
            .where("public_id", "=", input.recordId)
            .where("task_id", "=", task.id)
            .where("state", "=", "pending")
            .returning("id")
            .executeTakeFirst();
          if (!row) throw new TaskError("Pending schedule not found.", 404);
          return { kind: "Schedule updated", details: input.state };
        }
        if (input.action === "request-closure") {
          if (
            await tx
              .selectFrom("task_closure_requests")
              .select("id")
              .where("task_id", "=", task.id)
              .where("state", "=", "pending")
              .executeTakeFirst()
          )
            throw new TaskError("A closure request is already pending.");
          await allocate((public_id) =>
            tx
              .insertInto("task_closure_requests")
              .values({
                ...base,
                public_id,
                reason: input.reason,
                state: "pending",
                review_note: null,
                reviewed_by: null,
                reviewed_at: null,
              })
              .onConflict((c) => c.column("public_id").doNothing())
              .returning("id")
              .executeTakeFirst(),
          );
          return { kind: "Closure requested", details: input.reason };
        }
        const closure = await tx
          .selectFrom("task_closure_requests")
          .selectAll()
          .where("task_id", "=", task.id)
          .where("public_id", "=", input.recordId)
          .where("state", "=", "pending")
          .executeTakeFirst();
        if (!closure)
          throw new TaskError("Pending closure request not found.", 404);
        if (input.decision === "approved") {
          if (
            (await tx
              .selectFrom("task_jobs")
              .select("id")
              .where("task_id", "=", task.id)
              .where("stopped_at", "is", null)
              .executeTakeFirst()) ||
            (await tx
              .selectFrom("task_checkpoints")
              .select("id")
              .where("task_id", "=", task.id)
              .where("checked_out_at", "is", null)
              .executeTakeFirst())
          )
            throw new TaskError(
              "Stop the running job and check out before approving closure.",
            );
          const closed = options.statuses.find(
            (item) => item.code === "closed",
          );
          if (!closed)
            throw new TaskError("Closed status seed is missing.", 503);
          await tx
            .updateTable("tasks")
            .set({ status_id: closed.id })
            .where("id", "=", task.id)
            .execute();
          await tx
            .updateTable("task_schedules")
            .set({ state: "cancelled", updated_at: now, updated_by: actor })
            .where("task_id", "=", task.id)
            .where("state", "=", "pending")
            .execute();
        }
        await tx
          .updateTable("task_closure_requests")
          .set({
            state: input.decision,
            review_note: input.note,
            reviewed_by: actor,
            reviewed_at: now,
            updated_at: now,
            updated_by: actor,
          })
          .where("id", "=", closure.id)
          .execute();
        return { kind: "Closure " + input.decision, details: input.note };
      },
    );
    return this.get(id);
  }
  async deliverSchedules(now = new Date()) {
    const due = await this.repo.db
      .selectFrom("task_schedules")
      .select(["public_id", "task_id"])
      .where("state", "=", "pending")
      .where("scheduled_at", "<=", now)
      .where("reminded_at", "is", null)
      .execute();
    let delivered = 0;
    for (const item of due) {
      delivered += await this.repo.db.transaction().execute(async (tx) => {
        const task = await tx
          .selectFrom("tasks")
          .selectAll()
          .where("id", "=", item.task_id)
          .forUpdate()
          .executeTakeFirstOrThrow();
        const rows = await tx
          .updateTable("task_schedules")
          .set({
            reminded_at: now,
            updated_at: now,
            updated_by: "system:task-scheduler",
          })
          .where("public_id", "=", item.public_id)
          .where("state", "=", "pending")
          .where("reminded_at", "is", null)
          .returningAll()
          .execute();
        if (rows.length) {
          await this.repo.activity(tx, task.id, "Reminder due", rows[0].title);
          await tx
            .updateTable("tasks")
            .set({
              revision: task.revision + 1,
              updated_at: now,
              updated_by: "system:task-scheduler",
            })
            .where("id", "=", task.id)
            .execute();
        }
        return rows.length;
      });
    }
    return delivered;
  }
}
