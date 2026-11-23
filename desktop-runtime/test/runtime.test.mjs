import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import { migrations } from "../migrations.mjs";
import { Runtime } from "../runtime.mjs";
import { ChatAttachments } from "../chat-attachments.mjs";
import { createAttachmentStore } from "../attachments.mjs";

let testConfig;
let testAdmin;
const testDatabase = "codeitz_agent_test_" + randomUUID().replaceAll("-", "");
before(async () => {
  const privatePath = process.env.CODEITZ_DESKTOP_DATABASE;
  if (!privatePath) throw new Error("Private isolated test DB config required");
  const config = JSON.parse(
    (await fs.readFile(privatePath, "utf8")).replace(/^\uFEFF/, ""),
  );
  testAdmin = new pg.Pool(config);
  await testAdmin.query(`CREATE DATABASE ${testDatabase}`);
  testConfig = { ...config, database: testDatabase };
});
after(async () => {
  if (testAdmin) {
    if (!/^codeitz_agent_test_[a-f0-9]{32}$/.test(testDatabase))
      throw new Error("Unexpected test database");
    await testAdmin.query(`DROP DATABASE ${testDatabase} WITH (FORCE)`);
    await testAdmin.end();
  }
});

class FakeProvider {
  constructor() {
    this.child = { killed: false };
    this.ready = true;
    this.calls = 0;
    this.saved = new Map();
    this.failure = false;
    this.hold = null;
    this.workspaces = new Map();
  }
  async start() {}
  async thread({ threadId, workspace }) {
    const id = threadId ?? randomUUID();
    this.workspaces.set(id, workspace);
    return {
      thread: { id, sessionId: randomUUID() },
    };
  }
  async turn(threadId, text, started, onEvent, options) {
    this.calls++;
    this.lastInput = { text, options };
    const id = randomUUID();
    await started(id);
    if (this.hold) await this.hold;
    if (this.failure) throw new Error("Injected provider disconnect");
    await this.onTurn?.({ workspace: this.workspaces.get(threadId), text });
    const turn = {
      id,
      status: "completed",
      items: [{ type: "agentMessage", text: "Verified " + text }],
    };
    this.saved.set(threadId, { thread: { turns: [turn] } });
    return turn;
  }
  async read(id) {
    return (
      this.saved.get(id) ?? { thread: { status: { type: "idle" }, turns: [] } }
    );
  }
  close() {
    this.child.killed = true;
    this.ready = false;
  }
}
async function fixture(fn) {
  const config = testConfig;
  const schema = "agent_test_" + randomUUID().replaceAll("-", "");
  const admin = new pg.Pool(config);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeitz-agent-test-"));
  const pool = new pg.Pool({ ...config, options: `-c search_path=${schema}` });
  const migrationDb = new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ ...config, options: `-c search_path=${schema}` }),
    }),
  });
  const result = await new Migrator({
    db: migrationDb,
    provider: { getMigrations: async () => migrations },
    migrationTableSchema: schema,
  }).migrateToLatest();
  if (result.error) throw result.error;
  await migrationDb.destroy();
  const provider = new FakeProvider();
  const runtime = new Runtime(pool, provider, root);
  try {
    await runtime.initialize();
    await fn({ runtime, pool, provider, root, config, schema });
  } finally {
    await runtime.close();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    await fs.rm(root, { recursive: true, force: true });
  }
}
async function idle(runtime) {
  await Promise.all([...runtime.pending]);
}

test("scoped activity cursor replays bounded redacted deltas without provider dispatch", () =>
  fixture(async ({ runtime, provider }) => {
    const conversation = await runtime.conversation("Activity fixture");
    const first = await runtime.prepare({
      conversationId: conversation.id,
      goal: "Read fixture",
      requestKey: "activity-fixture-first",
    });
    const second = await runtime.prepare({
      conversationId: conversation.id,
      goal: "Other fixture",
      requestKey: "activity-fixture-second",
    });
    await runtime.activity(first.id, "agent-text", {
      delta: "Visible response token=private-value",
    });
    await runtime.activity(second.id, "agent-text", {
      delta: "Other operation",
    });
    await runtime.activity(first.id, "tool-status", {
      message: "Running scoped command",
      command: "MUST NOT APPEAR",
    });
    const page = await runtime.activityPage(first.id, "0", 1);
    assert.equal(page.items.length, 1);
    assert.equal(page.hasMore, true);
    assert.match(page.items[0].data.message, /\[redacted\]/);
    const rest = await runtime.activityPage(first.id, page.cursor, 100);
    assert.equal(rest.items.length, 1);
    assert.equal(rest.items[0].data.message, "Running scoped command");
    assert.equal(JSON.stringify(rest).includes("MUST NOT APPEAR"), false);
    assert.equal(provider.calls, 0);
    await assert.rejects(runtime.activityPage(first.id, "-1"), /cursor/);
  }));

test("verification persists scoped approval, deduplicates execution, gates output and retries only explicitly", () =>
  fixture(async ({ runtime, pool }) => {
    const profile = {
      id: "desktop-runtime",
      hash: "a".repeat(64),
      name: "Fixture checks",
      checks: [{ id: "fixture", name: "Fixture test" }],
      images: { node: "fixture-node", postgres: "fixture-postgres" },
    };
    let calls = 0;
    let release;
    runtime.verification.runner = {
      profile: () => profile,
      canVerify: () => true,
      run: async ({ operationId, workspace, manifestDigest, profileHash }) => {
        calls++;
        await new Promise((resolve) => (release = resolve));
        const runId = randomUUID();
        return {
          runId,
          recoveryReference: runId,
          operationId,
          workspace,
          manifestDigest,
          profileHash,
          profileId: profile.id,
          images: profile.images,
          cleanup: "verified",
          passed: true,
          checks: [
            {
              id: "fixture",
              name: "Fixture test",
              status: "passed",
              exitCode: 0,
            },
          ],
        };
      },
    };
    const conversation = await runtime.conversation("Verification fixture");
    const task = await runtime.prepare({
      conversationId: conversation.id,
      goal: "Fixture work",
      requestKey: "verification-fixture",
    });
    await pool.query(
      "UPDATE agent_operations SET state='completed',verification_profile=$2 WHERE id=$1",
      [task.id, JSON.stringify(profile)],
    );
    let digest = "b".repeat(64);
    runtime.changes = async () => ({ digest });
    const approval = await runtime.verification.prepare(task.id);
    assert.equal(calls, 0);
    await assert.rejects(
      runtime.verification.approve(task.id, "c".repeat(64)),
      /approval/,
    );
    await runtime.verification.approve(task.id, approval.digest);
    await runtime.verification.approve(task.id, approval.digest);
    while (!release) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(calls, 1);
    release();
    await idle(runtime);
    const saved = (await runtime.verification.list())[0];
    assert.equal(saved.state, "passed");
    const operation = (
      await pool.query("SELECT * FROM agent_operations WHERE id=$1", [task.id])
    ).rows[0];
    await runtime.verification.requirePassed(operation, { digest });
    digest = "d".repeat(64);
    await assert.rejects(
      runtime.verification.requirePassed(operation, { digest }),
      /exact output/,
    );
    const retry = await runtime.verification.prepare(task.id);
    assert.notEqual(retry.digest, approval.digest);
    assert.equal(calls, 1);
    await pool.query(
      "UPDATE agent_verifications SET state='running' WHERE id=$1",
      [retry.id],
    );
    await runtime.verification.recover();
    assert.equal((await runtime.verification.list())[0].state, "interrupted");
    const fresh = await runtime.verification.prepare(task.id);
    assert.notEqual(fresh.digest, retry.digest);
    assert.equal(calls, 1);
  }));

test("approval digest, rejection, concurrent claims, completion and record persistence", () =>
  fixture(async ({ runtime, provider, pool }) => {
    const c = await runtime.conversation("Owned test");
    const a = await runtime.prepare({
      conversationId: c.id,
      goal: "Create own proof file",
      requestKey: "approval-test-1",
    });
    const b = await runtime.prepare({
      conversationId: c.id,
      goal: "Another own task",
      requestKey: "approval-test-2",
    });
    await assert.rejects(runtime.approve(a.id, "wrong"), /changed/);
    assert.equal(provider.calls, 0);
    const repeated = await runtime.prepare({
      conversationId: c.id,
      goal: a.goal,
      requestKey: "approval-test-1",
    });
    assert.equal(repeated.id, a.id);
    await assert.rejects(
      runtime.prepare({
        conversationId: c.id,
        goal: "changed",
        requestKey: "approval-test-1",
      }),
      /conflict/,
    );
    let release;
    provider.hold = new Promise((r) => (release = r));
    const results = await Promise.allSettled([
      runtime.approve(a.id, a.digest),
      runtime.approve(b.id, b.digest),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    release();
    await idle(runtime);
    assert.equal(provider.calls, 1);
    assert.equal(
      (
        await pool.query("SELECT state FROM agent_operations WHERE id=$1", [
          a.id,
        ])
      ).rows[0].state,
      "completed",
    );
    await runtime.reject(b.id, b.digest);
    assert.equal(provider.calls, 1);
    assert.equal((await runtime.state()).messages.length, 2);
  }));

test("chat resumes same provider thread and duplicate key never repeats", () =>
  fixture(async ({ runtime, provider, pool }) => {
    const c = await runtime.conversation("Persistent chat");
    await runtime.chat(c.id, "Remember alpha", "chat-key-0001");
    await idle(runtime);
    const first = (
      await pool.query(
        "SELECT provider_thread_id FROM agent_conversations WHERE id=$1",
        [c.id],
      )
    ).rows[0].provider_thread_id;
    await runtime.chat(c.id, "Recall alpha", "chat-key-0002");
    await idle(runtime);
    assert.equal(
      (
        await pool.query(
          "SELECT provider_thread_id FROM agent_conversations WHERE id=$1",
          [c.id],
        )
      ).rows[0].provider_thread_id,
      first,
    );
    await runtime.chat(c.id, "Recall alpha", "chat-key-0002");
    assert.equal(provider.calls, 2);
  }));

test("unknown provider failure is retained and never dispatched on recovery", () =>
  fixture(async ({ runtime, provider, pool }) => {
    const c = await runtime.conversation("Interrupted");
    const worker = await runtime.prepare({
      conversationId: c.id,
      goal: "Own uncertain task",
      requestKey: "uncertain-0001",
    });
    provider.failure = true;
    await runtime.approve(worker.id, worker.digest);
    await idle(runtime);
    assert.equal(provider.calls, 1);
    await pool.query(
      "UPDATE agent_operations SET state='running' WHERE id=$1",
      [worker.id],
    );
    await runtime.recover();
    assert.equal(provider.calls, 1);
    assert.equal((await runtime.state()).workers[0].state, "interrupted");
    provider.failure = false;
    await runtime.chat(
      c.id,
      "Read-only supervisor may discuss the uncertain worker",
      "uncertain-chat-1",
    );
    await idle(runtime);
    assert.equal(provider.calls, 2);
    const blocked = await runtime.prepare({
      conversationId: c.id,
      goal: "Same uncertain worker lane",
      requestKey: "uncertain-worker-2",
    });
    await assert.rejects(
      runtime.approve(blocked.id, blocked.digest),
      /uncertain/,
    );
    assert.equal(provider.calls, 2);
  }));

test("completed provider turn reconciles exact history without execution", () =>
  fixture(async ({ runtime, pool, provider }) => {
    const c = await runtime.conversation("Recovery");
    const op = await runtime.chat(c.id, "Own read-only chat", "recover-key-1");
    await idle(runtime);
    for (const uncertainState of ["running", "interrupted"]) {
      await pool.query("UPDATE agent_operations SET state=$2 WHERE id=$1", [
        op.id,
        uncertainState,
      ]);
      await runtime.recover();
    }
    assert.equal(provider.calls, 1);
    assert.equal((await runtime.state()).operations[0].state, "completed");
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM agent_messages WHERE role='assistant'",
        )
      ).rows[0].n,
      1,
    );
  }));

test("symlink workspace replacement fails closed", () =>
  fixture(async ({ runtime, root, provider }) => {
    const c = await runtime.conversation("Scope");
    const worker = await runtime.prepare({
      conversationId: c.id,
      goal: "Own scope test",
      requestKey: "scope-key-0001",
    });
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "codeitz-outside-"),
    );
    try {
      await fs.symlink(outside, worker.workspace, "junction");
      await assert.rejects(
        runtime.approve(worker.id, worker.digest),
        /scope changed/,
      );
      assert.equal(provider.calls, 0);
    } finally {
      await fs.unlink(worker.workspace);
      await fs.rm(outside, { recursive: true, force: true });
    }
  }));

test("reviewed interruption requires explicit acknowledgement, rejects active provider and never replays", () =>
  fixture(async ({ runtime, provider, pool }) => {
    const c = await runtime.conversation("Reviewed recovery");
    const worker = await runtime.prepare({
      conversationId: c.id,
      goal: "Own interrupted proof",
      requestKey: "review-worker-1",
    });
    provider.failure = true;
    await runtime.approve(worker.id, worker.digest);
    await idle(runtime);
    const before = (
      await pool.query("SELECT * FROM agent_operations WHERE id=$1", [
        worker.id,
      ])
    ).rows[0];
    await assert.rejects(
      runtime.resolve(worker.id, { digest: worker.digest }),
      /acknowledgement/,
    );
    await assert.rejects(
      runtime.resolve(worker.id, {
        digest: "wrong",
        acknowledgement: "reviewed-no-replay",
      }),
      /changed/,
    );
    provider.saved.set(before.provider_thread_id, {
      thread: { status: { type: "active" }, turns: [] },
    });
    await assert.rejects(
      runtime.resolve(worker.id, {
        digest: worker.digest,
        acknowledgement: "reviewed-no-replay",
      }),
      /still active/,
    );
    provider.saved.set(before.provider_thread_id, {
      thread: { status: { type: "idle" }, turns: [] },
    });
    const reviewed = await runtime.resolve(worker.id, {
      digest: worker.digest,
      acknowledgement: "reviewed-no-replay",
    });
    assert.equal(reviewed.state, "reviewed");
    assert.equal(reviewed.provider_thread_id, before.provider_thread_id);
    assert.equal(reviewed.provider_turn_id, before.provider_turn_id);
    assert.equal(reviewed.result, before.result);
    assert.equal(provider.calls, 1);
    await runtime.resolve(worker.id, {
      digest: worker.digest,
      acknowledgement: "reviewed-no-replay",
    });
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM agent_events WHERE operation_id=$1 AND type='interruption-reviewed'",
          [worker.id],
        )
      ).rows[0].n,
      1,
    );
    provider.failure = false;
    await runtime.chat(
      c.id,
      "A separately requested new read-only turn",
      "review-new-chat-1",
    );
    await idle(runtime);
    assert.equal(provider.calls, 2);
  }));

test("real Git baseline plus PostgreSQL task-linked approval, isolated coworker threads and reviewed apply", () =>
  fixture(async ({ runtime, provider, root, pool }) => {
    const repository = path.join(root, "selected-repository");
    await promisify(execFile)(
      "git",
      [
        "-c",
        "core.hooksPath=" + path.join(root, "no-hooks"),
        "clone",
        "--shared",
        "--no-checkout",
        "D:/workspace/codebiz/devkit/codeitz",
        repository,
      ],
      { windowsHide: true, timeout: 30000 },
    );
    await fs.writeFile(
      path.join(repository, "seed.txt"),
      "existing dirty source\n",
    );
    runtime.allowedRepositoryRoots = [root];
    runtime.source = {
      snapshot: async () => ({
        connection: { connected: true },
        projects: [{ owner: "devkit/codeitz" }],
        todoTasks: [
          { id: "todo-1", title: "Existing Todo", owner: null, revision: 1 },
        ],
        runnerTasks: [
          { id: "foreign-runner", owner: "apps/other", title: "Foreign" },
        ],
        businessTasks: [],
      }),
      close: async () => {},
    };
    const legacy = await runtime.conversation("Legacy remains unassigned");
    const app = await runtime.registerApp({
      name: "Selected Codeitz",
      repositoryPath: repository,
      sourceProjectOwner: "devkit/codeitz",
    });
    const chatA = await runtime.conversation("Supervisor A", app.id);
    assert.equal((await runtime.conversation("Supervisor B", app.id)).id, chatA.id);
    const chatB = { id: randomUUID() };
    await pool.query("INSERT INTO agent_conversations(id,title,app_id,created_at) VALUES($1,'Historical supervisor',$2,now()+interval '1 day')", [chatB.id, app.id]);
    const writer = await runtime.coworker(chatA.id, "Writer");
    const reviewer = await runtime.coworker(chatA.id, "Reviewer");
    const foreign = { id: randomUUID() };
    await pool.query("INSERT INTO agent_coworkers(id,conversation_id,name) VALUES($1,$2,'Historical coworker')", [foreign.id, chatB.id]);
    await assert.rejects(runtime.coworker(chatB.id, "Other chat"), /read-only history/);
    await assert.rejects(
      runtime.prepare({
        conversationId: chatA.id,
        coworkerId: foreign.id,
        goal: "Wrong chat",
        requestKey: "foreign-chat-1",
      }),
      /coworker/,
    );
    await assert.rejects(
      runtime.prepare({
        conversationId: chatA.id,
        coworkerId: writer.id,
        goal: "Wrong owner",
        requestKey: "foreign-owner-1",
        taskReference: {
          authority: "codeitz-runner-task",
          id: "foreign-runner",
        },
      }),
      /different project/,
    );
    const task = await runtime.prepare({
      conversationId: chatA.id,
      coworkerId: writer.id,
      goal: "Write a documentation guide",
      requestKey: "real-baseline-1",
      taskReference: { authority: "codeitz-todo", id: "todo-1" },
    });
    provider.onTurn = async ({ workspace }) => {
      await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
      await fs.writeFile(
        path.join(workspace, "docs", "guide.md"),
        "# Reviewed guide\n",
      );
      await fs.writeFile(path.join(workspace, '.codeitz-worker-result.json'), JSON.stringify({
        version: 1, status: 'ready', summary: 'Fixture guide is ready for review.',
        completed: ['Wrote the guide'], missing: [], blockers: [], evidence: ['docs/guide.md'],
      }));
    };
    await runtime.approve(task.id, task.digest);
    await idle(runtime);
    const completed = (
      await pool.query("SELECT * FROM agent_operations WHERE id=$1", [task.id])
    ).rows[0];
    assert.equal(completed.state, "completed");
    assert.equal(completed.task_reference.owner, null);
    assert.equal(
      await fs.readFile(path.join(repository, "seed.txt"), "utf8"),
      "existing dirty source\n",
    );
    await assert.rejects(fs.access(path.join(repository, "docs", "guide.md")));
    const changes = await runtime.changes(task.id);
    assert.equal(changes.files.length, 1);
    assert.equal(changes.blocked.length, 0);
    await assert.rejects(
      runtime.apply(task.id, "wrong-diff-digest"),
      /changed/,
    );
    const receipt = await runtime.apply(task.id, changes.digest);
    assert.equal(receipt.applied, true);
    assert.equal(
      await fs.readFile(path.join(repository, "docs", "guide.md"), "utf8"),
      "# Reviewed guide\n",
    );
    assert.equal(
      await fs.readFile(path.join(repository, "seed.txt"), "utf8"),
      "existing dirty source\n",
    );
    const next = await runtime.prepare({
      conversationId: chatA.id,
      coworkerId: reviewer.id,
      goal: "Prepare a recovery documentation note",
      requestKey: "reviewer-task-1",
    });
    provider.onTurn = async ({ workspace }) => {
      await fs.writeFile(
        path.join(workspace, "docs", "recovery.md"),
        "# Retained recovery note\n",
      );
      await fs.writeFile(path.join(workspace, '.codeitz-worker-result.json'), JSON.stringify({
        version: 1, status: 'ready', summary: 'Fixture recovery note is ready for review.',
        completed: ['Wrote the recovery note'], missing: [], blockers: [], evidence: ['docs/recovery.md'],
      }));
    };
    await runtime.approve(next.id, next.digest);
    await idle(runtime);
    const nextChanges = await runtime.changes(next.id);
    const query = pool.query.bind(pool);
    let failFinal = true;
    pool.query = async (...args) => {
      if (
        failFinal &&
        typeof args[0] === "string" &&
        args[0].includes("applied_at=CASE")
      ) {
        failFinal = false;
        throw new Error("Injected post-effect persistence failure");
      }
      return query(...args);
    };
    await assert.rejects(
      runtime.apply(next.id, nextChanges.digest),
      /requires review/,
    );
    assert.equal(
      await fs.readFile(path.join(repository, "docs", "recovery.md"), "utf8"),
      "# Retained recovery note\n",
    );
    const uncertain = (
      await query("SELECT apply_receipt FROM agent_operations WHERE id=$1", [
        next.id,
      ])
    ).rows[0].apply_receipt;
    assert.equal(uncertain.state, "review-required");
    await assert.rejects(
      runtime.apply(next.id, nextChanges.digest),
      /previous apply attempt/,
    );
    pool.query = query;
    await runtime.recoverApplies();
    const recovered = (
      await pool.query(
        "SELECT apply_receipt,applied_at FROM agent_operations WHERE id=$1",
        [next.id],
      )
    ).rows[0];
    assert.equal(recovered.apply_receipt.state, "applied");
    assert.equal(recovered.apply_receipt.recoveredReadOnly, true);
    assert.ok(recovered.applied_at);
    assert.equal(provider.calls, 2);
    const workers = (await runtime.state()).coworkers;
    assert.notEqual(
      workers.find((x) => x.id === writer.id).provider_thread_id,
      workers.find((x) => x.id === reviewer.id).provider_thread_id,
    );
    assert.equal(
      (
        await pool.query("SELECT app_id FROM agent_conversations WHERE id=$1", [
          legacy.id,
        ])
      ).rows[0].app_id,
      null,
    );
  }));

test("durable scoped attachments bind immutable bytes before one read-only provider turn and survive store-flag recovery", () =>
  fixture(async ({ runtime, provider, pool, root }) => {
    const records = new Map();
    let stageCalls = 0;
    let failMark = false;
    const store = {
      async stage({ id, conversationId, name, mime, bytes }) {
        const previous = records.get(id);
        if (previous) return previous;
        stageCalls++;
        const record = {
          id,
          conversationId,
          name,
          mime,
          bytes,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          text:
            mime === "text/plain"
              ? bytes.toString("utf8")
              : "Synthetic local OCR 4829",
          sent: false,
          width: mime === "text/plain" ? undefined : 1,
          height: mime === "text/plain" ? undefined : 1,
        };
        records.set(id, record);
        return record;
      },
      async get(conversationId, id) {
        const value = records.get(id);
        if (!value || value.conversationId !== conversationId)
          throw Object.assign(new Error("Missing owned attachment"), {
            code: "ENOENT",
          });
        return value;
      },
      async resolveImagePath(conversationId, id) {
        await this.get(conversationId, id);
        const file = path.join(root, "attachment-" + id + ".png");
        await fs.writeFile(file, records.get(id).bytes);
        return file;
      },
      async markSent(conversationId, id) {
        if (failMark) {
          failMark = false;
          throw new Error("Injected store flag failure");
        }
        (await this.get(conversationId, id)).sent = true;
      },
      async remove(conversationId, id) {
        const value = await this.get(conversationId, id);
        if (value.sent) throw new Error("Sent");
        records.delete(id);
      },
    };
    const attachments = new ChatAttachments(pool, store);
    runtime.attachments = attachments;
    const c = await runtime.conversation("Attachment supervisor");
    const foreign = await runtime.conversation("Other conversation");
    const bytes = Buffer.from("User-selected text, not permissions.");
    const payload = {
      requestKey: "upload-text-1",
      name: "note.txt",
      mime: "text/plain",
      base64: bytes.toString("base64"),
    };
    const text = await attachments.stage(c.id, payload);
    assert.equal((await attachments.stage(c.id, payload)).id, text.id);
    assert.equal(stageCalls, 1);
    await assert.rejects(
      attachments.stage(c.id, {
        ...payload,
        base64: Buffer.from("changed").toString("base64"),
      }),
      /content changed/,
    );
    await assert.rejects(
      attachments.stage(c.id, {
        ...payload,
        requestKey: "path-inject-1",
        path: "C:/private.env",
      }),
      /paths/,
    );
    await assert.rejects(
      attachments.stage(c.id, {
        ...payload,
        requestKey: "private-file-1",
        name: ".env",
      }),
      /private/,
    );
    const image = await attachments.stage(c.id, {
      requestKey: "upload-image-1",
      name: "screen.png",
      mime: "image/png",
      base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
    });
    await assert.rejects(
      runtime.chat(foreign.id, "Foreign file", "foreign-file-1", [text.id]),
      /conversation/,
    );
    await assert.rejects(
      runtime.chat(c.id, "Duplicate file", "duplicate-file-1", [
        text.id,
        text.id,
      ]),
      /unique/,
    );
    await assert.rejects(
      runtime.prepare({
        conversationId: c.id,
        goal: "Do not give worker images",
        requestKey: "worker-file-1",
        attachmentIds: [image.id],
      }),
      /Worker attachments/,
    );
    const large = await attachments.stage(c.id, {
      requestKey: "upload-large-1",
      name: "large.txt",
      mime: "text/plain",
      base64: Buffer.from("a".repeat(129 * 1024)).toString("base64"),
    });
    await assert.rejects(
      runtime.chat(c.id, "Full text bound", "large-context-1", [large.id]),
      /128 KiB/,
    );
    assert.equal((await attachments.preview(c.id, large.id)).size, 129 * 1024);
    await attachments.remove(c.id, large.id);
    provider.onTurn = async () => {
      const links = await pool.query("SELECT * FROM agent_message_attachments");
      assert.ok(links.rowCount >= 2);
      assert.equal(provider.lastInput.options.worker, false);
      assert.equal(provider.lastInput.options.images[0].type, "localImage");
      assert.match(provider.lastInput.text, /untrusted data/);
    };
    const op = await runtime.chat(
      c.id,
      "Read the selected files",
      "send-files-1",
      [text.id, image.id],
    );
    await idle(runtime);
    assert.equal(provider.calls, 1);
    assert.equal(records.get(text.id).sent, true);
    const saved = (
      await pool.query(
        "SELECT attachment_refs FROM agent_operations WHERE id=$1",
        [op.id],
      )
    ).rows[0].attachment_refs;
    assert.equal(saved[0].sha256, text.sha256);
    await assert.rejects(attachments.remove(c.id, text.id), /history/);
    await runtime.chat(c.id, "Read the selected files", "send-files-1", [
      text.id,
      image.id,
    ]);
    assert.equal(provider.calls, 1);
    const state = await runtime.state();
    assert.equal(
      state.messages.find((x) => x.operation_id === op.id && x.role === "user")
        .attachments.length,
      2,
    );
    assert.equal(
      state.messages.find(
        (x) => x.operation_id === op.id && x.role === "assistant",
      ).attachments.length,
      0,
    );
    provider.onTurn = null;
    failMark = true;
    await assert.rejects(
      runtime.chat(c.id, "Recover a pending Send", "send-recovery-1", [
        text.id,
      ]),
      /store flag failure/,
    );
    assert.equal(provider.calls, 1);
    await attachments.recover();
    await runtime.chat(c.id, "Recover a pending Send", "send-recovery-1", [
      text.id,
    ]);
    await idle(runtime);
    assert.equal(provider.calls, 2);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM agent_message_attachments WHERE attachment_id=$1",
          [text.id],
        )
      ).rows[0].n,
      2,
    );
  }));

test("real native OCR and PostgreSQL upload intent recover verified originals without model or source writes", () =>
  fixture(async ({ runtime, provider, pool, root }) => {
    const store = await createAttachmentStore({
      root: path.join(root, "private-attachment-store"),
    });
    const service = new ChatAttachments(pool, store);
    runtime.attachments = service;
    const conversation = await runtime.conversation("Synthetic OCR proof");
    const bytes = await fs.readFile(
      new URL("./ocr-fixture.png", import.meta.url),
    );
    const payload = {
      requestKey: "native-image-upload-1",
      name: "ocr-proof.png",
      mime: "image/png",
      base64: bytes.toString("base64"),
    };
    const image = await service.stage(conversation.id, payload);
    assert.match(image.text, /CODEITZ TEST 4829/i);
    assert.equal(image.width, 800);
    assert.equal(image.height, 160);
    assert.equal((await service.stage(conversation.id, payload)).id, image.id);
    assert.deepEqual(
      Buffer.from(
        (await service.preview(conversation.id, image.id)).base64,
        "base64",
      ),
      bytes,
    );
    provider.onTurn = async () => {
      const path = provider.lastInput.options.images[0].path;
      assert.match(path, /\.png$/);
      assert.deepEqual(await fs.readFile(path), bytes);
      assert.match(provider.lastInput.text, /CODEITZ TEST 4829/i);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM agent_message_attachments",
          )
        ).rows[0].n,
        1,
      );
    };
    await runtime.chat(
      conversation.id,
      "Read my selected screenshot",
      "native-image-send-1",
      [image.id],
    );
    await idle(runtime);
    assert.equal(provider.calls, 1);
    await assert.rejects(service.remove(conversation.id, image.id), /history/);
    const query = pool.query.bind(pool);
    let inject = true;
    pool.query = async (...args) => {
      if (
        inject &&
        typeof args[0] === "string" &&
        args[0].includes("state='ready',extracted_text")
      ) {
        inject = false;
        throw new Error("Injected upload finalization loss");
      }
      return query(...args);
    };
    await assert.rejects(
      service.stage(conversation.id, {
        requestKey: "recover-native-upload-1",
        name: "persist.txt",
        mime: "text/plain",
        base64: Buffer.from("Persistent selected text").toString("base64"),
      }),
      /finalization/,
    );
    pool.query = query;
    const reserved = (
      await pool.query(
        "SELECT id,state FROM agent_attachments WHERE request_key=$1",
        ["recover-native-upload-1"],
      )
    ).rows[0];
    assert.equal(reserved.state, "failed");
    await service.recover();
    const restored = (
      await pool.query("SELECT * FROM agent_attachments WHERE id=$1", [
        reserved.id,
      ])
    ).rows[0];
    assert.equal(restored.state, "ready");
    assert.equal(restored.extracted_text, "Persistent selected text");
    assert.equal(provider.calls, 1);
  }));

test("explicit draft removal discards only DB-owned matching incomplete bytes and preserves mismatches", () =>
  fixture(async ({ runtime, pool, root }) => {
    const attachmentRoot = path.join(root, "private-removal-store");
    const store = await createAttachmentStore({ root: attachmentRoot });
    const service = new ChatAttachments(pool, store);
    runtime.attachments = service;
    const c = await runtime.conversation("Incomplete draft removal");
    async function remnant(requestKey, expected, actual) {
      const id = randomUUID();
      const bytes = Buffer.from(expected);
      await pool.query(
        "INSERT INTO agent_attachments(id,conversation_id,request_key,name,mime,size,sha256,state) VALUES($1,$2,$3,'pending.txt','text/plain',$4,$5,'failed')",
        [
          id,
          c.id,
          requestKey,
          bytes.length,
          createHash("sha256").update(bytes).digest("hex"),
        ],
      );
      await fs.mkdir(path.join(attachmentRoot, c.id), { recursive: true });
      const file = path.join(attachmentRoot, c.id, id + ".tmp.bin");
      await fs.writeFile(file, actual);
      return { id, file };
    }
    const owned = await remnant(
      "remove-owned-1",
      "known selected bytes",
      "known selected bytes",
    );
    assert.equal(
      (await service.remove(c.id.toUpperCase(), owned.id.toUpperCase()))
        .removed,
      true,
    );
    await assert.rejects(fs.access(owned.file));
    assert.equal(
      (
        await pool.query("SELECT state FROM agent_attachments WHERE id=$1", [
          owned.id,
        ])
      ).rows[0].state,
      "removed",
    );
    const changed = await remnant(
      "remove-changed-1",
      "known selected bytes",
      "different bytes",
    );
    await assert.rejects(service.remove(c.id, changed.id), /digest mismatch/);
    assert.equal(await fs.readFile(changed.file, "utf8"), "different bytes");
    assert.equal(
      (
        await pool.query("SELECT state FROM agent_attachments WHERE id=$1", [
          changed.id,
        ])
      ).rows[0].state,
      "failed",
    );
  }));
