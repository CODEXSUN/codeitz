import test from "node:test";
import assert from "node:assert/strict";
import { CodexClient } from "../codex-client.mjs";

test("a reused thread binds each task turn to its own workspace", async () => {
  const client = new CodexClient("unused", "unused");
  const calls = [];
  client.request = async (method, params) => {
    calls.push({ method, params });
    if (method === "thread/read") return { thread: { id: "coworker", status: { type: "idle" } } };
    if (method === "thread/unsubscribe") return { status: "unsubscribed" };
    if (method === "turn/start") return { turn: { id: "turn", status: "completed" } };
    return { thread: { id: "coworker" }, cwd: params.cwd.replaceAll("/", "\\").toUpperCase() };
  };
  for (const workspace of ["C:/owned/task-a", "C:/owned/task-b"]) {
    await client.thread({ threadId: "coworker", workspace, worker: true });
    await client.turn("coworker", "task", async () => {}, null, { workspace, worker: true });
  }
  const turns = calls.filter((call) => call.method === "turn/start");
  assert.deepEqual(turns.map((call) => call.params.cwd), ["C:/owned/task-a", "C:/owned/task-b"]);
  for (const [index, turn] of turns.entries()) {
    assert.deepEqual(turn.params.sandboxPolicy.writableRoots, [turn.params.cwd]);
    assert.equal(turn.params.sandboxPolicy.networkAccess, false);
    assert.equal(turn.params.approvalPolicy, "on-request");
    assert.equal(calls.filter(call => call.method === "thread/resume")[index].params.cwd, turn.params.cwd);
  }
  assert.deepEqual(calls.slice(0, 4).map(call => call.method), ["thread/read", "thread/unsubscribe", "thread/resume", "turn/start"]);
});

test("missing or mismatched response workspace stops before turn dispatch", async () => {
  for (const cwd of [undefined, "relative", "/owned/other", "/owned/task-extra"]) {
    const client = new CodexClient("unused", "unused");
    const calls = [];
    client.request = async (method) => {
      calls.push(method);
      return { thread: { id: "coworker" }, cwd };
    };
    await assert.rejects(async () => {
      await client.thread({ workspace: "/owned/task" });
      await client.turn("coworker", "task", async () => {}, null, { workspace: "/owned/task" });
    }, /workspace/);
    assert.deepEqual(calls, ["thread/start"]);
  }
});

test("readonly turns keep their scope and require an absolute workspace", async () => {
  const client = new CodexClient("unused", "unused");
  const calls = [];
  client.request = async (method, params) => {
    calls.push({ method, params });
    if (method === "thread/read") return { thread: { id: "thread", status: { type: "idle" } } };
    if (method === "thread/unsubscribe") return { status: "notLoaded" };
    if (method === "turn/start") return { turn: { id: "turn", status: "completed" } };
    return { thread: { id: "thread" }, cwd: "/owned/a/../task/" };
  };
  await client.thread({ threadId: "thread", workspace: "/owned/task" });
  await client.turn("thread", "read", async () => {}, null, { workspace: "/owned/task" });
  assert.equal(calls[2].params.sandbox, "read-only");
  assert.equal(calls[3].params.cwd, "/owned/task");
  assert.deepEqual(calls[3].params.sandboxPolicy, { type: "readOnly", networkAccess: false });
  await assert.rejects(client.thread({ workspace: "relative" }), /absolute path/);
  await assert.rejects(client.turn("thread", "bad", async () => {}, null, { workspace: "relative" }), /absolute path/);
  assert.equal(calls.length, 4);
});

test("active or uncertain threads are never detached or rebound", async () => {
  for (const state of ["active", "systemError", "uncertain"]) {
    const client = new CodexClient("unused", "unused");
    const calls = [];
    if (state === "uncertain") client.activeThreadTurns.set("worker", { uncertain: true });
    client.request = async (method) => { calls.push(method); return { thread: { status: { type: state } } }; };
    await assert.rejects(client.thread({ threadId: "worker", workspace: "/owned/task" }), /active|idle|uncertain/);
    assert.deepEqual(calls, state === "uncertain" ? [] : ["thread/read"]);
  }
});

test("failed detach and mismatched resumed cwd stop before any model turn", async () => {
  for (const detach of [undefined, "unsubscribed"]) {
    const client = new CodexClient("unused", "unused"), calls = [];
    client.request = async (method) => {
      calls.push(method);
      if (method === "thread/read") return { thread: { status: { type: "idle" } } };
      if (method === "thread/unsubscribe") return { status: detach };
      return { cwd: "/owned/old", thread: { id: "worker" } };
    };
    await assert.rejects(client.thread({ threadId: "worker", workspace: "/owned/new" }), /released|workspace/);
    assert.equal(calls.includes("turn/start"), false);
  }
});
