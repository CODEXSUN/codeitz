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

test("app actor pool concurrency, restart and history preservation", { timeout: 120000 }, async () => {
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
    const result = await new Migrator({ db: migrationDb, provider: { getMigrations: async () => migrations } }).migrateToLatest();
    if (result.error) throw result.error;
    const runtime = new Runtime(pool, { close() {} }, root);
    const app = randomUUID(), other = randomUUID();
    for (const [id,name] of [[app,'Platform'],[other,'CRM']]) await pool.query('INSERT INTO agent_apps(id,name,repository,head,dirty_fingerprint) VALUES($1,$2,$3,$4,$5)',[id,name,root+'/'+name,'fixture','fixture']);
    const opened = await Promise.all(Array.from({length:8},()=>runtime.conversation('New supervisor',app)));
    assert.equal(new Set(opened.map(item=>item.id)).size,1);
    const supervisor=opened[0];assert.equal(supervisor.title,'supervisor');
    const first=await Promise.all(Array.from({length:6},()=>runtime.coworker(supervisor.id,'Worker one')));
    assert.equal(new Set(first.map(item=>item.id)).size,1);
    const additional=await Promise.allSettled(['Worker two','Worker three','Worker four'].map(name=>runtime.coworker(supervisor.id,name)));
    assert.equal(additional.filter(item=>item.status==='fulfilled').length,1);
    assert.equal((await runtime.appActorPool(app)).activeCoworkerIds.length,2);
    const secondSupervisor=await runtime.conversation('CRM',other);
    assert.notEqual(secondSupervisor.id,supervisor.id);
    assert.ok(await runtime.coworker(secondSupervisor.id,'Worker one'));
    const oldChat=randomUUID(),extra=randomUUID(),oldWorker=randomUUID(),message=randomUUID(),operation=randomUUID();
    await pool.query("INSERT INTO agent_conversations(id,title,app_id,created_at,provider_thread_id) VALUES($1,'Existing historical chat',$2,now()+interval '1 day','saved-old-supervisor')",[oldChat,app]);
    await pool.query("INSERT INTO agent_coworkers(id,conversation_id,name,created_at,provider_thread_id) VALUES($1,$2,'Existing third',now()+interval '1 day','saved-third'),($3,$4,'Historical coworker',now(),'saved-history')",[extra,supervisor.id,oldWorker,oldChat]);
    await pool.query("INSERT INTO agent_operations(id,conversation_id,request_key,kind,goal,workspace,digest,state,app_id,coworker_id) VALUES($1,$2,'old','worker','Historical proposal',$3,'review-digest','awaiting-approval',$4,$5)",[operation,oldChat,root,app,oldWorker]);
    await pool.query("INSERT INTO agent_messages(id,conversation_id,operation_id,role,text) VALUES($1,$2,$3,'assistant','Preserved history')",[message,oldChat,operation]);
    const saved={};
    for(const table of ['agent_conversations','agent_coworkers','agent_messages','agent_operations'])saved[table]=(await pool.query('SELECT * FROM '+table+' ORDER BY id')).rows;
    const privileges=(await pool.query("SELECT * FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY 1,2,3,4,5,6,7,8")).rows;
    assert.equal((await runtime.conversation('Another chat',app)).id,supervisor.id);
    const selection=await runtime.appActorPool(app);
    assert.deepEqual(selection.historyConversationIds,[oldChat]);
    assert.ok(selection.historyCoworkerIds.includes(extra));assert.ok(selection.historyCoworkerIds.includes(oldWorker));
    await assert.rejects(runtime.coworker(oldChat,'New'),/history/);
    await assert.rejects(runtime.prepare({conversationId:oldChat,coworkerId:oldWorker,goal:'Do not run',requestKey:'new-task'}),/history/);
    await assert.rejects(runtime.prepare({conversationId:supervisor.id,coworkerId:extra,goal:'Do not run',requestKey:'extra-task'}),/Reuse/);
    await assert.rejects(runtime.approve(operation,'review-digest'),/history/);
    const restarted=new Runtime(pool,{close(){}},root);
    assert.equal((await restarted.conversation('New',app)).id,supervisor.id);
    assert.equal((await restarted.coworker(supervisor.id,'WORKER ONE')).id,first[0].id);
    for(const table of Object.keys(saved))assert.deepEqual((await pool.query('SELECT * FROM '+table+' ORDER BY id')).rows,saved[table]);
    assert.deepEqual((await pool.query("SELECT * FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY 1,2,3,4,5,6,7,8")).rows,privileges);
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
