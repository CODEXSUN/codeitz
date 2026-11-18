import { z } from "zod";
export const workId = z.string().regex(/^[a-z0-9]{8}$/);
export const workDate = z
  .string()
  .refine(
    (value) =>
      !value ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Choose a valid date.",
  );
export const taskInput = z
  .object({
    title: z.string().trim().min(1).max(255),
    details: z.string().max(20000),
    contactId: z.union([workId, z.literal("")]),
    contactName: z.string().trim().max(150),
    mobile: z
      .string()
      .trim()
      .max(30)
      .regex(/^[+0-9 ()-]*$/),
    listId: z.union([workId, z.literal("")]),
    assignedUserId: z.union([workId, z.literal("")]),
    priorityId: workId,
    statusId: workId,
    dueDate: workDate,
  })
  .strict();
export type TaskInput = z.infer<typeof taskInput>;
export const actionFields = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("comment"),
    body: z.string().trim().min(1).max(10000),
    parentId: workId.optional(),
  }),
  z.strictObject({
    action: z.literal("start-job"),
    note: z.string().trim().max(2000).default(""),
  }),
  z.strictObject({ action: z.literal("stop-job") }),
  z.strictObject({
    action: z.literal("check-in"),
    note: z.string().trim().max(2000).default(""),
  }),
  z.strictObject({ action: z.literal("check-out") }),
  z.strictObject({
    action: z.literal("charge"),
    description: z.string().trim().min(1).max(255),
    amount: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  z.strictObject({
    action: z.literal("schedule"),
    title: z.string().trim().min(1).max(255),
    scheduledAt: z.iso.datetime(),
  }),
  z.strictObject({
    action: z.literal("schedule-state"),
    recordId: workId,
    state: z.enum(["completed", "cancelled"]),
  }),
  z.strictObject({
    action: z.literal("request-closure"),
    reason: z.string().trim().min(1).max(4000),
  }),
  z.strictObject({
    action: z.literal("review-closure"),
    recordId: workId,
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().min(1).max(4000),
  }),
]);
export const actionInput = z
  .object({
    revision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    input: actionFields,
  })
  .strict();
export type TaskAction = z.infer<typeof actionFields>;
export type Option = {
  id: string;
  name: string;
  code?: string;
  mobile?: string;
  role?: string;
  kind?: string;
};
export type TaskOptions = {
  contacts: Option[];
  lists: Option[];
  priorities: Option[];
  statuses: Option[];
  users: Option[];
};
export type WorkTask = TaskInput & {
  id: string;
  revision: number;
  list: string;
  assignedTo: string;
  priority: string;
  priorityCode: string;
  status: string;
  statusCode: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  closurePending: boolean;
  runningJob: boolean;
};
export type WorkflowRow = {
  id: string;
  kind?: string;
  details?: string;
  body?: string;
  parentId?: string;
  startedAt?: string;
  stoppedAt?: string;
  note?: string;
  amount?: string;
  currency?: string;
  description?: string;
  title?: string;
  scheduledAt?: string;
  remindedAt?: string;
  state?: string;
  reason?: string;
  reviewNote?: string;
  reviewedBy?: string;
  createdBy: string;
  createdAt: string;
};
export type TaskDetail = {
  task: WorkTask;
  actions: WorkflowRow[];
  comments: WorkflowRow[];
  jobs: WorkflowRow[];
  charges: WorkflowRow[];
  schedules: WorkflowRow[];
  checkpoints: WorkflowRow[];
  closures: WorkflowRow[];
};

export const createWorkTaskInput = z
  .object({ input: taskInput, requestId: z.string().uuid() })
  .strict();
export const updateWorkTaskInput = z
  .object({
    input: taskInput,
    revision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
  })
  .strict();
export const createTaskListInput = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
