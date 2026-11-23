import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createDesktopLink } from "../desktop-link.mjs";

const app = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const chat = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const coworker = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const op = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const state = { apps: [{ id: app }], conversations: [{ id: chat, app_id: app }], coworkers: [{ id: coworker, conversation_id: chat }], operations: [{ id: op, conversation_id: chat }], provider: { available: true }, secret: "never-output" };
const config = { token: "x".repeat(32) };
const ok = (value) => ({ ok: true, status: 200, json: async () => value });

function mock(handler = () => ok(state), timeoutMs = 1000) {
  const calls = [];
  const link = createDesktopLink({ config, timeoutMs, fetch: async (url, options) => { calls.push({ url, ...options }); return handler(url, options); } });
  return { link, calls };
}

async function withFile(content, run) {
  const directory = await fs.mkdtemp(path.join(process.cwd(), "link-test-"));
  const file = path.join(directory, "input.txt");
  try { await fs.writeFile(file, content); await run(file); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}

test("unknown actions and flags fail before transport", async () => {
  const { link, calls } = mock();
  for (const action of ["approve", "apply", "delete", "shell", "deploy"]) await assert.rejects(link.execute([action]), /Unknown command/);
  await assert.rejects(link.execute(["status", "--app", app]), /Invalid flag/);
  assert.equal(calls.length, 0);
});

test("redirects and broker errors never expose response bodies", async () => {
  for (const response of [{ ok: false, status: 302, redirected: false }, { ok: false, status: 400, json: async () => ({ message: "secret" }) }]) {
    const { link } = mock(() => response);
    await assert.rejects(link.execute(["status"]), (error) => !error.message.includes("secret"));
  }
});

test("scope checks prevent writes and activity reads", async () => {
  await withFile("goal", async (file) => {
    const { link, calls } = mock();
    await assert.rejects(link.execute(["prepare-worker", "--app", app, "--chat", chat, "--coworker", app, "--file", file, "--request-key", "request-1"]), /Coworker scope/);
    await assert.rejects(link.execute(["activity", "--app", app, "--chat", chat, "--operation", app]), /Operation scope/);
    assert.ok(calls.every((call) => call.method === "GET"));
  });
});

test("only allowed mutation routes are called and operation output is redacted", async () => {
  await withFile("private goal", async (file) => {
    const { link, calls } = mock((url) => url.endsWith("/state") ? ok(state) : ok({ id: op, kind: "worker", state: "awaiting-approval", goal: "private goal", result: "secret" }));
    const result = await link.execute(["prepare-worker", "--app", app, "--chat", chat, "--coworker", coworker, "--file", file, "--request-key", "request-1"]);
    assert.deepEqual(result, { id: op, kind: "worker", state: "awaiting-approval" });
    assert.equal(calls[1].url, "http://127.0.0.1:43405/api/runtime/workers");
    assert.equal(JSON.parse(calls[1].body).requestKey, "request-1");
    await link.execute(["plan", "--app", app, "--chat", chat, "--file", file, "--request-key", "request-2"]);
    assert.equal(calls[3].url, `http://127.0.0.1:43405/api/runtime/conversations/${chat}/messages`);
    assert.ok(calls.every((call) => call.redirect === "manual"));
  });
});

test("activity and status omit sensitive fields", async () => {
  const { link } = mock((url) => url.includes("/activity?") ? ok({ items: [{ id: 3, data: "secret", type: "private" }], cursor: "3", hasMore: false }) : ok(state));
  assert.deepEqual(await link.execute(["status"]), { transport: "local", provider: "codex", available: true });
  assert.deepEqual(await link.execute(["activity", "--app", app, "--chat", chat, "--operation", op]), { items: [{ id: "3" }], cursor: "3", hasMore: false });
});

test("timeout does not retry", async () => {
  const { link, calls } = mock(() => new Promise(() => {}), 10);
  await assert.rejects(link.execute(["status"]), /timed out/);
  assert.equal(calls.length, 1);
  await withFile("goal", async (file) => {
    const pending = mock((url) => url.endsWith("/state") ? ok(state) : new Promise(() => {}), 10);
    await assert.rejects(pending.link.execute(["plan", "--app", app, "--chat", chat, "--file", file, "--request-key", "request-1"]), /timed out/);
    assert.equal(pending.calls.filter((call) => call.method === "POST").length, 1);
    assert.equal(JSON.parse(pending.calls[1].body).requestKey, "request-1");
  });
});

test("memory routes use explicit scope and reject overrides", async () => {
  const record = { id: op, appId: app, conversationId: chat, kind: "fact", title: "Title", content: "Memory", status: "active", revision: 1, extra: "secret" };
  const { link, calls } = mock((url) => url.endsWith("/state") ? ok(state) : url.endsWith("/list") ? ok({ entries: [record], limit: 50, hasMore: false }) : ok(record));
  const list = await link.execute(["memory-list", "--app", app, "--chat", chat, "--query", "term", "--include-archived"]);
  assert.equal(list.entries[0].content, "Memory");
  assert.equal(list.entries[0].extra, undefined);
  assert.deepEqual(JSON.parse(calls[1].body), { appId: app, conversationId: chat, query: "term", includeArchived: true });
  const input = { expectedRevision: 0, requestKey: "request-1", kind: "fact", title: "Title", content: "Memory", status: "active" };
  await withFile(JSON.stringify(input), async (file) => {
    await link.execute(["memory-save", "--app", app, "--file", file]);
    assert.deepEqual(JSON.parse(calls.at(-1).body), { ...input, appId: app, conversationId: null });
  });
  const count = calls.length;
  await withFile(JSON.stringify({ ...input, appId: app }), async (file) => {
    await assert.rejects(link.execute(["memory-save", "--app", app, "--file", file]), /Invalid memory file/);
  });
  assert.equal(calls.length, count);
});
