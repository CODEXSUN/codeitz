import { z } from "zod";
import {
  taskInput,
  actionInput,
  workId,
  createWorkTaskInput as createInput,
  updateWorkTaskInput as updateInput,
  createTaskListInput as listInput,
} from "../../../../../contracts/work-task.ts";
const option = z.object({
  id: workId,
  name: z.string(),
  code: z.string().optional(),
  mobile: z.string().optional(),
  role: z.string().optional(),
  kind: z.string().optional(),
});
const options = z.toJSONSchema(
  z.object({
    contacts: z.array(option),
    lists: z.array(option),
    users: z.array(option),
    priorities: z.array(option),
    statuses: z.array(option),
  }),
);
const task = taskInput.extend({
  id: workId,
  revision: z.number().int(),
  list: z.string(),
  assignedTo: z.string(),
  priority: z.string(),
  priorityCode: z.string(),
  status: z.string(),
  statusCode: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
  closurePending: z.boolean(),
  runningJob: z.boolean(),
});
const row = z.object({
  id: workId,
  createdBy: z.string(),
  createdAt: z.string(),
  kind: z.string().optional(),
  details: z.string().optional(),
  body: z.string().optional(),
  parentId: workId.optional(),
  startedAt: z.string().optional(),
  stoppedAt: z.string().optional(),
  note: z.string().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  description: z.string().optional(),
  title: z.string().optional(),
  scheduledAt: z.string().optional(),
  remindedAt: z.string().optional(),
  state: z.string().optional(),
  reason: z.string().optional(),
  reviewNote: z.string().optional(),
  reviewedBy: z.string().optional(),
});
const detail = z.toJSONSchema(
  z.object({
    task,
    actions: z.array(row),
    comments: z.array(row),
    jobs: z.array(row),
    charges: z.array(row),
    schedules: z.array(row),
    checkpoints: z.array(row),
    closures: z.array(row),
  }),
);
export const workTaskOperations = {
  "GET /api/v1/work-tasks/options": {
    operationId: "getWorkTaskOptions",
    summary:
      "Read task-owned master references and human/agent assignee records",
    response: options,
  },
  "POST /api/v1/work-tasks/lists": {
    operationId: "createWorkTaskList",
    summary: "Create a task list through its owning master module",
    status: "201",
    body: z.toJSONSchema(listInput),
    response: z.toJSONSchema(option),
  },
  "GET /api/v1/work-tasks": {
    operationId: "listWorkTasks",
    parameters: [
      {
        name: "from",
        in: "query",
        required: false,
        schema: { type: "string", format: "date" },
      },
      {
        name: "to",
        in: "query",
        required: false,
        schema: { type: "string", format: "date" },
      },
    ],
    summary:
      "Read work tasks; optional from/to date bounds filter creation date (UTC)",
    response: z.toJSONSchema(z.object({ tasks: z.array(task) })),
  },
  "POST /api/v1/work-tasks": {
    operationId: "createWorkTask",
    summary:
      "Create a task with optional captured contact, stable public references and retry-safe request ID",
    status: "201",
    body: z.toJSONSchema(createInput),
    response: detail,
  },
  "GET /api/v1/work-tasks/{id}": {
    operationId: "getWorkTask",
    summary:
      "Read task and its actions, comments, check-ins, jobs, charges, schedules and closure history",
    response: detail,
  },
  "PATCH /api/v1/work-tasks/{id}": {
    operationId: "updateWorkTask",
    summary:
      "Revision-checked property update; closure approval required for Closed status",
    body: z.toJSONSchema(updateInput),
    response: detail,
  },
  "POST /api/v1/work-tasks/{id}/actions": {
    operationId: "actOnWorkTask",
    summary:
      "Perform a revision-checked, retry-safe task action as the local owner; assignment never runs Codex",
    body: z.toJSONSchema(actionInput),
    response: detail,
  },
};
