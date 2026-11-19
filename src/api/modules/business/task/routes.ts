import {
  requireLocalRequest,
  type createHttpServer,
} from "@workspace/framework";
import { z } from "zod";
import {
  taskInput,
  actionInput,
  workId,
  workDate,
  createWorkTaskInput as createInput,
  updateWorkTaskInput as updateInput,
  createTaskListInput as listInput,
} from "../../../../../contracts/work-task.ts";
import { openDatabase } from "../../../database.ts";
import { TaskRepository, TaskError } from "./repository.ts";
import { TaskService } from "./service.ts";
import { createTaskList } from "../../master/task-list/index.ts";
export function registerWorkTaskRoutes(
  app: ReturnType<typeof createHttpServer>,
  service = new TaskService(new TaskRepository(openDatabase())),
  scheduling = true,
) {
  const options = { preHandler: requireLocalRequest };
  const fail = (error: unknown, reply: any) => {
    if (error instanceof TaskError)
      return reply.code(error.statusCode).send({ message: error.message });
    throw error;
  };
  const id = (request: any) => {
    const parsed = workId.safeParse(request.params.id);
    if (!parsed.success) throw new TaskError("Invalid task reference.", 400);
    return parsed.data;
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<unknown> | undefined;
  let closing = false;
  app.addHook("onReady", async () => {
    if (!scheduling) return;
    await service.options();
    await service.deliverSchedules();
    timer = setInterval(() => {
      if (running || closing) return;
      running = Promise.resolve().then(() => service.deliverSchedules())
        .catch(error => { app.log.error({ err: error }, "Task schedule scan failed"); })
        .finally(() => { running = undefined; });
    }, 15000);
    timer.unref();
  });
  app.addHook("onClose", async () => {
    closing = true;
    clearInterval(timer);
    await running;
    await service.close();
  });
  app.get("/api/v1/work-tasks/options", options, async () => service.options());
  app.post("/api/v1/work-tasks/lists", options, async (request, reply) => {
    const body = listInput.safeParse(request.body);
    if (!body.success)
      return reply
        .code(400)
        .send({ message: "Enter a list name up to 100 characters." });
    const row = await createTaskList(service.repo.db, body.data.name);
    return reply
      .code(201)
      .send({ id: row.public_id, name: row.name, code: row.code });
  });
  app.get("/api/v1/work-tasks", options, async (request, reply) => {
    const query = z
      .object({ from: workDate.optional(), to: workDate.optional() })
      .strict()
      .safeParse(request.query);
    if (!query.success)
      return reply
        .code(400)
        .send({ message: "Choose valid date range values." });
    if (query.data.from && query.data.to && query.data.from > query.data.to)
      return reply
        .code(400)
        .send({ message: "Start date must be before end date." });
    reply.header("Cache-Control", "no-store");
    const tasks = await service.list();
    return {
      tasks: tasks.filter(
        (task) =>
          (!query.data.from ||
            task.createdAt.slice(0, 10) >= query.data.from) &&
          (!query.data.to || task.createdAt.slice(0, 10) <= query.data.to),
      ),
    };
  });
  app.post("/api/v1/work-tasks", options, async (request, reply) => {
    const body = createInput.safeParse(request.body);
    if (!body.success)
      return reply
        .code(400)
        .send({ message: "Enter a task title and valid properties." });
    try {
      return reply
        .code(201)
        .send(await service.create(body.data.input, body.data.requestId));
    } catch (error) {
      return fail(error, reply);
    }
  });
  app.get("/api/v1/work-tasks/:id", options, async (request, reply) => {
    try {
      reply.header("Cache-Control", "no-store");
      return await service.get(id(request));
    } catch (error) {
      return fail(error, reply);
    }
  });
  app.patch("/api/v1/work-tasks/:id", options, async (request, reply) => {
    const body = updateInput.safeParse(request.body);
    if (!body.success)
      return reply
        .code(400)
        .send({ message: "Enter valid properties and the saved revision." });
    try {
      return await service.update(
        id(request),
        body.data.input,
        body.data.revision,
        body.data.requestId,
      );
    } catch (error) {
      return fail(error, reply);
    }
  });
  app.post(
    "/api/v1/work-tasks/:id/actions",
    options,
    async (request, reply) => {
      const body = actionInput.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({
          message: "Enter valid action details and the saved revision.",
        });
      try {
        return await service.act(
          id(request),
          body.data.revision,
          body.data.requestId,
          body.data.input,
        );
      } catch (error) {
        return fail(error, reply);
      }
    },
  );
}
