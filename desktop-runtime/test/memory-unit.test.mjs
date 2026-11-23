import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore, memoryDigest, validMemoryContext } from "../memory.mjs";

const appId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const conversationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("memory digests survive JSONB object-key reordering", () => {
  const entry = { id: appId, content: "Saved fact", revision: 1, appId, conversationId: null };
  const reordered = Object.fromEntries(Object.entries(entry).reverse());
  assert.equal(memoryDigest([entry]), memoryDigest([reordered]));
  assert.ok(validMemoryContext({ digest: memoryDigest([entry]), entries: [reordered], version: 1 }));
});

test("construction is lazy and invalid input is rejected before database access", async () => {
  const store = createMemoryStore(null);
  await assert.rejects(store.list({ appId: "bad" }), { status: 400 });
  await assert.rejects(store.save({ appId, expectedRevision: 0 }), { status: 400 });
});

test("context is scoped, bounded and detects altered content", async () => {
  const queries = [];
  const pool = { async query(sql, args) {
    queries.push({ sql, args });
    if (sql.includes("SELECT id FROM")) return { rows: [{ id: appId }] };
    return { rows: Array.from({ length: 10 }, (_, i) => ({ data: { id: String(i), appId, conversationId, kind: "fact", title: "title", content: "x".repeat(2000), status: "active", revision: 1, createdAt: "now", updatedAt: "now" } })) };
  } };
  const result = await createMemoryStore(pool).context({ appId, conversationId });
  assert.ok(result.entries.length <= 8);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 16384);
  assert.ok(validMemoryContext(result));
  assert.equal(result.digest, memoryDigest(result.entries));
  result.entries[0].content = "changed";
  assert.equal(validMemoryContext(result), false);
  assert.equal(queries.at(-1).args[1], conversationId);
});

test("rejects malformed Unicode and out-of-range query limits", async () => {
  const store = createMemoryStore(null);
  await assert.rejects(store.list({ appId, limit: 51 }), { status: 400 });
  await assert.rejects(store.save({ appId, expectedRevision: 0, requestKey: "12345678", kind: "fact", title: "ok", content: "\ud800", status: "active" }), { status: 400 });
});

test("idempotent replay returns the original record and a changed request conflicts", async () => {
  let stored;
  let inserts = 0;
  const client = {
    async query(sql, args = []) {
      if (sql.startsWith("SELECT id FROM agent_apps")) return { rows: [{ id: appId }] };
      if (sql.startsWith("SELECT data FROM agent_events") && sql.includes("requestKey")) return { rows: stored ? [{ data: stored }] : [] };
      if (sql.startsWith("INSERT INTO agent_events")) { stored = JSON.parse(args[1]); inserts++; }
      return { rows: [] };
    },
    release() {},
  };
  const store = createMemoryStore({ async connect() { return client; } });
  const input = { appId, expectedRevision: 0, requestKey: "request-123", kind: "fact", title: "Title", content: "Content", status: "active" };
  const first = await store.save(input);
  assert.deepEqual(await store.save(input), first);
  await assert.rejects(store.save({ ...input, content: "Different" }), { status: 409 });
  assert.equal(inserts, 1);
  assert.equal(first.revision, 1);
});
