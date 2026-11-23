import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import { migrations } from "../migrations.mjs";
import { Runtime } from "../runtime.mjs";
import { repositoryDigest } from "../repository-safety.mjs";

const docker = process.env.CODEITZ_TEST_DOCKER ?? path.join(process.env.LOCALAPPDATA ?? "", "Programs", "DockerDesktop", "resources", "bin", "docker.exe");
if (!path.isAbsolute(docker)) throw new Error("CODEITZ_TEST_DOCKER must be an absolute path");
const exec = promisify(execFile);
const runDocker = async (...args) => (await exec(docker, args, { timeout: 30000, windowsHide: true })).stdout.trim();
const migrationName = "20261123_agent_completion_assessment";

test("disposable PostgreSQL upgrade and completion runtime", { timeout: 120000 }, async () => {
  await fs.access(docker).catch(() => { throw new Error("Docker executable is unavailable at the required absolute path"); });
  const name = "codeitz-completion-" + randomUUID();
  const password = randomBytes(24).toString("hex");
  const root = await fs.mkdtemp(path.join(process.cwd(), "completion-db-test-"));
  let containerId = null;
  let pool;
  let migrationDb;
  try {
    containerId = await runDocker("run", "-d", "--rm", "--pull=never", "--name", name, "--label", "codeitz.fixture=" + name, "--tmpfs", "/var/lib/postgresql/data", "-p", "127.0.0.1::5432", "-e", "POSTGRES_PASSWORD=" + password, "postgres:17.12-alpine");
    assert.match(containerId, /^[a-f0-9]{64}$/);
    const portText = await runDocker("port", containerId, "5432/tcp");
    const port = Number(portText.match(/:(\d+)$/)?.[1]);
    assert.ok(port > 0);
    const config = { host: "127.0.0.1", port, user: "postgres", password, database: "postgres", connectionTimeoutMillis: 1000 };
    pool = new pg.Pool(config);
    let connected = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await pool.query("SELECT 1"); connected = true; break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
    }
    assert.ok(connected, "disposable PostgreSQL did not start");
    migrationDb = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool(config) }) });
    const before = Object.fromEntries(Object.entries(migrations).filter(([key]) => key !== migrationName));
    const migrate = async (items) => {
      const result = await new Migrator({ db: migrationDb, provider: { getMigrations: async () => items } }).migrateToLatest();
      if (result.error) throw result.error;
    };
    await migrate(before);
    const conversation = randomUUID();
    const message = randomUUID();
    const old = randomUUID();
    await pool.query("INSERT INTO agent_conversations(id,title) VALUES($1,$2)", [conversation, "Saved conversation"]);
    await pool.query("INSERT INTO agent_operations(id,conversation_id,request_key,kind,goal,workspace,digest,state,approved_at) VALUES($1,$2,'old','worker','Saved goal',$3,'old-digest','completed',now())", [old, conversation, root]);
    await pool.query("INSERT INTO agent_messages(id,conversation_id,operation_id,role,text) VALUES($1,$2,$3,'assistant','Saved message')", [message, conversation, old]);
    const saved = (await pool.query("SELECT id,goal,state,approved_at FROM agent_operations WHERE id=$1", [old])).rows[0];
    await migrate(migrations);
    const upgraded = (await pool.query("SELECT id,goal,state,approved_at,completion_assessment FROM agent_operations WHERE id=$1", [old])).rows[0];
    assert.deepEqual(upgraded, { ...saved, completion_assessment: null });
    assert.equal((await pool.query("SELECT title FROM agent_conversations WHERE id=$1", [conversation])).rows[0].title, "Saved conversation");
    assert.equal((await pool.query("SELECT text FROM agent_messages WHERE id=$1 AND operation_id=$2", [message, old])).rows[0].text, "Saved message");
    const runtime = new Runtime(pool, { close() {} }, root);
    const report = { version: 1, status: "ready", summary: "Done", completed: ["Added source"], missing: [], blockers: [], evidence: ["source.mjs"] };
    for (const status of ["missing", "partial", "ready"]) {
      const id = randomUUID();
      const workspace = path.join(root, id);
      const record = path.join(root, ".records", id);
      await fs.mkdir(workspace, { recursive: true });
      await fs.mkdir(record, { recursive: true });
      const baseline = { repository: root, dirtyFingerprint: "fixture", files: [] };
      const snapshot = { repository: root, baselineHash: repositoryDigest(baseline) };
      await fs.writeFile(path.join(record, "baseline.json"), JSON.stringify(baseline));
      await fs.writeFile(path.join(workspace, "source.mjs"), "export const value = 1;\n");
      if (status !== "missing") {
        await fs.writeFile(path.join(workspace, ".codeitz-worker-result.json"), JSON.stringify({ ...report, status: status === "partial" ? "partial" : "ready" }));
      }
      const operation = (await pool.query("INSERT INTO agent_operations(id,conversation_id,request_key,kind,goal,workspace,digest,state,repository_snapshot) VALUES($1,$2,$3,'worker','Fixture',$4,'fixture','running',$5) RETURNING *", [id, conversation, id, workspace, JSON.stringify(snapshot)])).rows[0];
      await runtime.finish(operation, { id: id, status: "completed", items: [] });
      const finished = (await pool.query("SELECT * FROM agent_operations WHERE id=$1", [id])).rows[0];
      assert.equal(finished.state, "completed");
      assert.equal(finished.completion_assessment.status, status === "ready" ? "reported-ready" : "needs-work", JSON.stringify(finished.completion_assessment));
      if (status === "ready") {
        await fs.writeFile(path.join(workspace, "source.mjs"), "export const value = 2;\n");
        await assert.rejects(runtime.apply(id, finished.change_manifest.digest), /changed after review/);
        const updatedManifest = await runtime.changes(id);
        await assert.rejects(runtime.apply(id, updatedManifest.digest), /Completion assessment needs work/);
      } else {
        await assert.rejects(runtime.apply(id, finished.change_manifest.digest), /Completion assessment needs work/);
      }
    }
  } finally {
    if (migrationDb) await migrationDb.destroy();
    if (pool) await pool.end();
    if (containerId) {
      const identity = JSON.parse(await runDocker("inspect", containerId));
      assert.equal(identity[0].Id, containerId);
      assert.equal(identity[0].Config.Labels["codeitz.fixture"], name);
      await runDocker("rm", "-f", containerId);
    }
    assert.equal(path.dirname(root), await fs.realpath(process.cwd()));
    assert.match(path.basename(root), /^completion-db-test-[A-Za-z0-9]+$/);
    assert.equal(await fs.realpath(root), root);
    await fs.rm(root, { recursive: true, force: true });
  }
});
