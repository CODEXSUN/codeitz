import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import { migrations } from "../migrations.mjs";
import { createMemoryStore } from "../memory.mjs";
import { Runtime, approvalDigest } from "../runtime.mjs";

class FakeProvider {
  constructor() {
    this.ready = true;
    this.calls = 0;
  }
  async ensureSandbox() {}
  async turn() {
    this.calls++;
    throw new Error("Unexpected provider turn");
  }
  async close() {}
}

const input = (appId, conversationId, requestKey, overrides = {}) => ({
  appId,
  conversationId,
  expectedRevision: 0,
  requestKey,
  kind: "fact",
  title: "Fixture title",
  content: "Fixture content",
  status: "active",
  ...overrides,
});

const edit = (record, requestKey, overrides = {}) => input(
  record.appId,
  record.conversationId,
  requestKey,
  {
    id: record.id,
    expectedRevision: record.revision,
    kind: record.kind,
    title: record.title,
    content: record.content,
    status: record.status,
    ...overrides,
  },
);

async function createProposal(pool, runtime, root, appId, conversationId, memoryContext) {
  const id = randomUUID();
  const workspace = path.join(root, id);
  const snapshot = {
    repository: path.join(root, "fixture-repository"),
    head: "fixture-head",
    dirtyFingerprint: "fixture-dirty",
    baselineHash: "fixture-baseline",
    memoryContext,
  };
  const operation = {
    id,
    app_id: appId,
    conversation_id: conversationId,
    coworker_id: null,
    task_reference: null,
    repository_snapshot: snapshot,
    verification_profile: null,
    goal: "Fixture worker goal",
    workspace,
  };
  const digest = approvalDigest(operation.goal, workspace, runtime.binding(operation));
  await pool.query(
    `INSERT INTO agent_operations
       (id,conversation_id,request_key,kind,goal,workspace,digest,state,app_id,repository_snapshot)
     VALUES ($1,$2,$3,'worker',$4,$5,$6,'awaiting-approval',$7,$8)`,
    [id, conversationId, `proposal-${id}`, operation.goal, workspace, digest, appId, JSON.stringify(snapshot)],
  );
  return { ...operation, digest, kind: "worker" };
}

test("PostgreSQL memory ledger and runtime integration", async (t) => {
  const configPath = process.env.CODEITZ_DESKTOP_DATABASE;
  if (!configPath) throw new Error("Private isolated test DB config required");
  const config = JSON.parse((await fs.readFile(configPath, "utf8")).replace(/^\uFEFF/, ""));
  const database = `codeitz_memory_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(database, /^codeitz_memory_test_[a-f0-9]{32}$/);
  const admin = new pg.Pool(config);
  let created = false;
  let pool;
  let migrationDb;
  let runtime;
  let temporaryRoot;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    const databaseConfig = { ...config, database };
    pool = new pg.Pool(databaseConfig);
    migrationDb = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool(databaseConfig) }) });
    const migration = await new Migrator({
      db: migrationDb,
      provider: { getMigrations: async () => migrations },
    }).migrateToLatest();
    if (migration.error) throw migration.error;
    await migrationDb.destroy();
    migrationDb = null;

    temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeitz-memory-test-"));
    const root = await fs.realpath(temporaryRoot);
    const provider = new FakeProvider();
    runtime = new Runtime(pool, provider, root);
    const store = createMemoryStore(pool);
    const appA = randomUUID();
    const appB = randomUUID();
    const chatA = randomUUID();
    const sibling = randomUUID();
    const chatB = randomUUID();
    await pool.query(
      "INSERT INTO agent_apps(id,name,repository,head,dirty_fingerprint) VALUES($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)",
      [appA, "App A", path.join(root, "repository-a"), "head", "dirty", appB, "App B", path.join(root, "repository-b"), "head", "dirty"],
    );
    await pool.query(
      "INSERT INTO agent_conversations(id,title,app_id) VALUES($1,$2,$3),($4,$5,$6),($7,$8,$9)",
      [chatA, "Chat A", appA, sibling, "Sibling", appA, chatB, "Chat B", appB],
    );
    // The app supervisor is the oldest chat; historical siblings must be later.
    await pool.query("UPDATE agent_conversations SET created_at=created_at+interval '1 day' WHERE id=$1", [sibling]);
    let global;
    let local;
    let other;
    await t.test("scope isolation, revisions, idempotency and concurrency", async () => {
      const globalInput = input(appA, null, "global-create", { title: "Old needle" });
      global = await store.save(globalInput);
      local = await store.save(input(appA, chatA, "chat-a-create", { title: "Local" }));
      other = await store.save(input(appA, sibling, "sibling-create", { title: "Sibling" }));
      await store.save(input(appB, chatB, "foreign-create"));
      assert.deepEqual(await store.save(globalInput), global);
      await assert.rejects(store.save({ ...globalInput, content: "Changed" }), { status: 409 });
      assert.deepEqual((await store.list({ appId: appA })).entries.map((x) => x.id), [global.id]);
      const visible = (await store.list({ appId: appA, conversationId: chatA })).entries.map((x) => x.id);
      assert.deepEqual(new Set(visible), new Set([global.id, local.id]));
      assert.equal(visible.includes(other.id), false);
      const before = (await pool.query("SELECT count(*)::int AS count FROM agent_events WHERE type=$1", ["memory-record"])).rows[0].count;
      await assert.rejects(store.list({ appId: appA, conversationId: chatB }), { status: 404 });
      await assert.rejects(store.save(input(appA, chatB, "foreign-write")), { status: 404 });
      await assert.rejects(store.save(edit(other, "foreign-edit", { conversationId: chatA })), { status: 404 });
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM agent_events WHERE type=$1", ["memory-record"])).rows[0].count, before);
      global = await store.save(edit(global, "global-edit", { title: "New title" }));
      assert.equal((await store.list({ appId: appA, query: "Old needle" })).entries.length, 0);
      assert.equal((await store.list({ appId: appA, query: "New title" })).entries[0].revision, 2);
      const concurrent = input(appA, chatA, "concurrent-create", { title: "Concurrent" });
      const [first, second] = await Promise.all([store.save(concurrent), store.save(concurrent)]);
      assert.deepEqual(first, second);
      const rows = await pool.query("SELECT count(*)::int AS count FROM agent_events WHERE type=$1 AND data->>'requestKey'=$2", ["memory-record", concurrent.requestKey]);
      assert.equal(rows.rows[0].count, 1);
      const outcomes = await Promise.allSettled([
        store.save(edit(first, "concurrent-edit-one", { content: "First edit" })),
        store.save(edit(first, "concurrent-edit-two", { content: "Second edit" })),
      ]);
      assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
      const rejected = outcomes.find((item) => item.status === "rejected");
      assert.equal(rejected.reason.status, 409);
      local = await store.save(edit(local, "local-archive", { status: "archived" }));
      assert.equal((await store.list({ appId: appA, conversationId: chatA })).entries.some((x) => x.id === local.id), false);
      const archived = (await store.list({ appId: appA, conversationId: chatA, includeArchived: true })).entries.filter((x) => x.id === local.id);
      assert.equal(archived.length, 1);
      assert.equal(archived[0].status, "archived");
      local = await store.save(edit(local, "local-restore", { status: "active" }));
      assert.equal((await store.list({ appId: appA, conversationId: chatA })).entries.find((x) => x.id === local.id).revision, 3);
    });

    await t.test("bounded UTF-8 context is deterministic and survives reconnect", async () => {
      for (let index = 0; index < 10; index++) {
        await store.save(input(appA, chatA, `unicode-fixture-${index}`, { title: `Unicode ${index}`, content: "😀é".repeat(500) }));
      }
      const scope = { appId: appA, conversationId: chatA };
      const context = await store.context(scope);
      assert.deepEqual(await store.context(scope), context);
      assert.ok(context.entries.length > 0 && context.entries.length <= 8);
      assert.ok(Buffer.byteLength(JSON.stringify(context), "utf8") <= 16384);
      assert.ok(context.entries.every((entry) => !/\uFFFD/.test(entry.content)));
      const reconnect = new pg.Pool(databaseConfig);
      try {
        assert.deepEqual(await createMemoryStore(reconnect).context(scope), context);
      } finally {
        await reconnect.end();
      }
    });

    await t.test("approval rejects changed or invalid frozen memory; prompts use the right context", async () => {
      const scope = { appId: appA, conversationId: chatA };
      const frozen = await store.context(scope);
      const stale = await createProposal(pool, runtime, root, appA, chatA, frozen);
      const oldWorkerPrompt = await runtime.prompt(stale);
      await store.save(input(appA, chatA, "latest-memory", { title: "LATEST UNIQUE MEMORY", content: "Fresh advisory fixture" }));
      await assert.rejects(runtime.approve(stale.id, stale.digest), /Memory changed/);
      const state = (await pool.query("SELECT state,approved_at FROM agent_operations WHERE id=$1", [stale.id])).rows[0];
      assert.equal(state.state, "awaiting-approval");
      assert.equal(state.approved_at, null);
      assert.equal(provider.calls, 0);
      const workerPrompt = await runtime.prompt(stale);
      assert.equal(workerPrompt.prompt.includes("LATEST UNIQUE MEMORY"), false);
      assert.equal(workerPrompt.prompt, oldWorkerPrompt.prompt);
      const chatPrompt = await runtime.prompt({ goal: "Chat fixture", kind: "chat", app_id: appA, conversation_id: chatA });
      assert.ok(chatPrompt.prompt.includes("LATEST UNIQUE MEMORY"));
      const legacy = { ...stale, repository_snapshot: { ...stale.repository_snapshot } };
      delete legacy.repository_snapshot.memoryContext;
      assert.equal((await runtime.prompt(legacy)).prompt.includes("LATEST UNIQUE MEMORY"), false);
      const invalid = { ...frozen, digest: "0".repeat(64) };
      const corrupt = await createProposal(pool, runtime, root, appA, chatA, invalid);
      await assert.rejects(runtime.approve(corrupt.id, corrupt.digest), /memory context is invalid/i);
      await assert.rejects(runtime.prompt(corrupt), /memory context is invalid/i);
      const corruptState = (await pool.query("SELECT state,approved_at FROM agent_operations WHERE id=$1", [corrupt.id])).rows[0];
      assert.equal(corruptState.state, "awaiting-approval");
      assert.equal(corruptState.approved_at, null);
      assert.equal(provider.calls, 0);
      const snapshot = await runtime.state();
      assert.equal(snapshot.events.some((event) => event.type === "memory-record"), false);
      const persisted = await pool.query("SELECT count(*)::int AS count FROM agent_events WHERE type=$1", ["memory-record"]);
      assert.ok(persisted.rows[0].count > 0);
    });

    await t.test("historical bindings retain their original shape and null pool construction is lazy", () => {
      const isolated = new Runtime(null, new FakeProvider(), root);
      const historical = { app_id: appA, conversation_id: chatA, coworker_id: null, task_reference: null, verification_profile: null, repository_snapshot: { repository: "repository", head: "head", dirtyFingerprint: "dirty", baselineHash: "baseline" } };
      assert.deepEqual(isolated.binding(historical), { appId: appA, conversationId: chatA, coworkerId: null, taskReference: null, repository: "repository", head: "head", dirtyFingerprint: "dirty", baselineHash: "baseline" });
      assert.equal(approvalDigest("goal", root, isolated.binding(historical)), approvalDigest("goal", root, { appId: appA, conversationId: chatA, coworkerId: null, taskReference: null, repository: "repository", head: "head", dirtyFingerprint: "dirty", baselineHash: "baseline" }));
    });
  } finally {
    try {
      if (runtime) {
        await runtime.close();
        pool = null;
      }
      if (migrationDb) await migrationDb.destroy();
      if (pool) await pool.end();
      if (temporaryRoot) await fs.rm(temporaryRoot, { recursive: true, force: true });
    } finally {
      try {
        if (created) {
          if (!/^codeitz_memory_test_[a-f0-9]{32}$/.test(database)) throw new Error("Unexpected test database");
          await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
        }
      } finally {
        await admin.end();
      }
    }
  }
});
