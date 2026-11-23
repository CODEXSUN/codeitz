import test from "node:test";
import assert from "node:assert/strict";

import { ExecutionCapacity } from "../execution-capacity.mjs";
import { CodexClient } from "../codex-client.mjs";

test("three scoped model admissions do not queue, overbook or free a reused slot", () => {
  const capacity = new ExecutionCapacity();
  const a = capacity.reserve({ id: "a", key: "coworker:a", kind: "worker" });
  capacity.reserve({ id: "b", key: "coworker:b", kind: "worker" });
  assert.throws(
    () =>
      capacity.reserve({ id: "duplicate", key: "coworker:a", kind: "worker" }),
    /already has an active turn/,
  );
  capacity.reserve({ id: "supervisor", key: "chat:supervisor", kind: "chat" });
  assert.deepEqual(
    {
      active: capacity.snapshot().active,
      workers: capacity.snapshot().activeWorkers,
      chats: capacity.snapshot().activeChats,
    },
    { active: 3, workers: 2, chats: 1 },
  );
  assert.throws(
    () => capacity.reserve({ id: "fourth", key: "coworker:c", kind: "worker" }),
    /slots are occupied/,
  );
  capacity.markUnknown("a");
  assert.equal(capacity.snapshot().uncertain, 1);
  assert.equal(capacity.snapshot().available, 0);
  capacity.release("a");
  const next = capacity.reserve({
    id: "next",
    key: "coworker:c",
    kind: "worker",
  });
  assert.equal(next.slot, a.slot);
  capacity.release("a");
  assert.equal(capacity.snapshot().active, 3);
  assert.ok(capacity.get("next"));
  assert.throws(() => capacity.beginMaintenance(), /Wait/);
  for (const id of ["next", "b", "supervisor"]) capacity.release(id);
  capacity.beginReview("result");
  assert.throws(() => capacity.beginMaintenance(), /Wait/);
  capacity.endReview("result");
  capacity.beginMaintenance();
  assert.throws(
    () =>
      capacity.reserve({ id: "blocked", key: "coworker:d", kind: "worker" }),
    /maintenance/,
  );
  capacity.endMaintenance();
  assert.throws(() => new ExecutionCapacity(4), /between one and three/);
});

test("multiplexed protocol turns filter by thread and turn, including stale events before the response", async () => {
  const client = new CodexClient("not-started", "not-used");
  client.ready = true;
  const starts = new Map();
  const interrupts = [];
  client.request = async (method, params) => {
    if (method === "turn/interrupt") {
      interrupts.push(params);
      return {};
    }
    if (method !== "turn/start") throw new Error("Unexpected protocol request");
    return new Promise((resolve) => starts.set(params.threadId, resolve));
  };
  const eventsA = [];
  const eventsB = [];
  const a = client.turn(
    "thread-a",
    "A",
    async () => {},
    (event) => eventsA.push(event),
    { workspace: "C:/owned/a", worker: true },
  );
  const b = client.turn(
    "thread-b",
    "B",
    async () => {},
    (event) => eventsB.push(event),
    { workspace: "C:/owned/b", worker: true },
  );
  await assert.rejects(
    client.turn(
      "thread-a",
      "Do not steer",
      async () => {},
      () => {},
      {},
    ),
    /already has an active/,
  );
  client.emit("notification", {
    method: "item/started",
    params: {
      threadId: "thread-a",
      turnId: "old-turn",
      item: { id: "old", type: "commandExecution" },
    },
  });
  client.emit("notification", {
    method: "item/started",
    params: {
      threadId: "thread-a",
      turnId: "turn-a",
      item: { id: "a", type: "fileChange" },
    },
  });
  starts.get("thread-a")({ turn: { id: "turn-a", status: "inProgress" } });
  starts.get("thread-b")({ turn: { id: "turn-b", status: "inProgress" } });
  await new Promise((resolve) => setImmediate(resolve));
  client.emit("notification", {
    method: "item/completed",
    params: {
      threadId: "thread-b",
      turnId: "turn-a",
      item: { id: "wrong-turn", type: "fileChange" },
    },
  });
  await client.interrupt("thread-a", "turn-a");
  assert.deepEqual(interrupts, [{ threadId: "thread-a", turnId: "turn-a" }]);
  client.emit("notification", {
    method: "turn/completed",
    params: {
      threadId: "thread-a",
      turn: { id: "turn-a", status: "interrupted", items: [] },
    },
  });
  assert.equal((await a).status, "interrupted");
  assert.equal(client.activeThreadTurns.has("thread-b"), true);
  client.emit("notification", {
    method: "turn/completed",
    params: {
      threadId: "thread-b",
      turn: { id: "turn-b", status: "completed", items: [] },
    },
  });
  assert.equal((await b).status, "completed");
  assert.ok(eventsA.some((event) => event.params.item?.id === "a"));
  assert.equal(
    eventsA.some((event) => event.params.item?.id === "old"),
    false,
  );
  assert.equal(
    eventsB.some((event) => event.params.item?.id === "wrong-turn"),
    false,
  );
  assert.equal(client.activeThreadTurns.size, 0);
});
