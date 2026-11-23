// Isolated acceptance fixture. The provider below is deterministic, not Codex.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { Migrator } from 'kysely/migration';
import { migrations } from '../migrations.mjs';
import { Runtime } from '../runtime.mjs';
import { POSTGRES_IMAGE } from '../verification-profile.mjs';
import { acceptanceReceipt } from '../full-app-receipt.mjs';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
const docker = process.env.CODEITZ_TEST_DOCKER ?? path.join(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe');
const image = POSTGRES_IMAGE;
const repository = process.env.CODEITZ_ACCEPTANCE_REPOSITORY ?? root;
const playwright = process.env.CODEITZ_PLAYWRIGHT_MODULE ?? path.join(root, '.codeitz/browser-tools/node_modules/playwright-core/index.mjs');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const fixtureId = randomUUID();
const fixtureParent = path.join(root, '.local/full-app-fixtures');
const fixture = path.join(fixtureParent, fixtureId);
const container = 'codeitz-full-app-' + fixtureId;
const password = randomBytes(24).toString('hex');
const stages = Object.fromEntries(['build', 'database', 'runtime', 'browser', 'approval', 'workspace', 'progress', 'review', 'recovery', 'preservation'].map(id => [id, 'skipped']));
const receipt = { version: 1, coverage: 'none', provider: 'deterministic fixture; no live model', stages, cleanup: 'pending', operationId: null, manifestDigest: null, profile: null };
let runtime, pool, server, browser, containerId, fixtureCreated = false;
let failed = false;
let currentStage = 'build';

async function command(file, args, timeout = 30000, cwd = root) {
  return exec(file, args, { cwd, timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
}

class FixtureProvider {
  constructor() {
    this.ready = true;
    this.child = { killed: false };
    this.calls = 0;
    this.workspaces = new Map();
    this.saved = new Map();
    this.partial = false;
  }
  async start() { this.ready = true; this.child.killed = false; }
  async thread({ threadId, workspace }) {
    const id = threadId ?? randomUUID();
    this.workspaces.set(id, workspace);
    return { thread: { id, sessionId: randomUUID() } };
  }
  async turn(threadId, text, started, onEvent, options) {
    this.calls++;
    const id = randomUUID();
    await started(id);
    onEvent({ method: 'item/agentMessage/delta', params: { delta: 'Fixture progress from isolated provider.' } });
    if (options.worker) {
      const workspace = this.workspaces.get(threadId);
      await fs.writeFile(path.join(workspace, 'codeitz-full-app-fixture.mjs'), 'export const acceptanceFixture = true;\n');
      await fs.writeFile(path.join(workspace, '.codeitz-worker-result.json'), JSON.stringify({ version: 1, status: this.partial ? 'partial' : 'ready', summary: this.partial ? 'Fixture still needs implementation.' : 'Fixture output ready for review.', completed: ['Created fixture marker'], missing: this.partial ? ['Required implementation is unfinished.'] : [], blockers: [], evidence: ['codeitz-full-app-fixture.mjs'] }));
    }
    const turn = { id, status: 'completed', items: [{ type: 'agentMessage', text: options.worker ? 'Fixture worker completed.' : 'Saved supervisor fixture response.' }] };
    this.saved.set(threadId, { thread: { turns: [turn] } });
    return turn;
  }
  async read(id) { return this.saved.get(id) ?? { thread: { status: { type: 'idle' }, turns: [] } }; }
  async close() { this.ready = false; this.child.killed = true; }
}

async function waitFor(fn, timeout = 90000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { return await fn(); } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw last ?? new Error('Timed out');
}

async function route(method, requestPath, body) {
  const url = new URL(requestPath, 'http://127.0.0.1');
  if (method === 'GET' && url.pathname === '/api/runtime/state') return runtime.state();
  let m = url.pathname.match(/^\/api\/runtime\/operations\/([\da-f-]{36})\/activity$/i);
  if (method === 'GET' && m) return runtime.activityPage(m[1], url.searchParams.get('after') ?? '0', Number(url.searchParams.get('limit') ?? 100));
  if (method !== 'POST') throw new Error('Unsupported fixture route');
  if (url.pathname === '/api/runtime/conversations') return runtime.conversation(body.title, body.appId ?? null);
  if (url.pathname === '/api/runtime/workers') return runtime.prepare(body);
  m = url.pathname.match(/^\/api\/runtime\/conversations\/([\da-f-]{36})\/(coworkers|messages)$/i);
  if (m) return m[2] === 'coworkers' ? runtime.coworker(m[1], body.name) : runtime.chat(m[1], body.text, body.requestKey, body.attachmentIds ?? []);
  m = url.pathname.match(/^\/api\/runtime\/workers\/([\da-f-]{36})\/(approve|changes)$/i);
  if (m) return m[2] === 'approve' ? runtime.approve(m[1], body.digest) : runtime.changes(m[1]);
  throw new Error('Unsupported fixture route: ' + url.pathname);
}

try {
  assert.ok(path.isAbsolute(docker));
  await fs.access(docker);
  await fs.mkdir(fixtureParent, {recursive:true});
  await fs.mkdir(fixture, { recursive: false });
  fixtureCreated = true;
  try {
    await command(process.execPath, [path.join(root, 'desktop/node_modules/typescript/bin/tsc'), '--noEmit'], 60000, path.join(root, 'desktop'));
    await command(process.execPath, [path.join(root, 'desktop/node_modules/vite/bin/vite.js'), 'build', '--configLoader', 'runner'], 60000, path.join(root, 'desktop'));
    stages.build = 'passed';
  } catch (error) { stages.build = 'failed'; throw error; }
  currentStage = 'database';
  await command(docker, ['image', 'inspect', image]); // Never pull an image.
  containerId = (await command(docker, ['run', '-d', '--rm', '--pull', 'never', '--name', container, '--label', 'codeitz.full-app-fixture=' + fixtureId, '--tmpfs', '/var/lib/postgresql/data', '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=' + password, image], 30000)).stdout.trim();
  assert.match(containerId,/^[a-f0-9]{64}$/);
  const portText = (await command(docker, ['port', container, '5432/tcp'])).stdout.trim();
  const match = portText.match(/^127\.0\.0\.1:(\d+)$/);
  assert.ok(match, 'PostgreSQL must be bound to loopback');
  const config = { host: '127.0.0.1', port: Number(match[1]), user: 'postgres', password, database: 'postgres', connectionTimeoutMillis: 1000 };
  pool = new pg.Pool(config);
  await waitFor(async () => { await pool.query('SELECT 1'); });
  const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool(config) }) });
  try {
    const result = await new Migrator({ db, provider: { getMigrations: async () => migrations } }).migrateToLatest();
    if (result.error) throw result.error;
  } finally { await db.destroy(); }
  stages.database = 'passed';
  currentStage = 'runtime';
  const provider = new FixtureProvider();
  const options = { appWorkspaceRoot: path.join(fixture, 'workspaces'), allowedRepositoryRoots: [path.dirname(repository)] };
  runtime = new Runtime(pool, provider, path.join(fixture, 'state'), options);
  await runtime.initialize();
  const app = await runtime.registerApp({ name: 'Full app fixture', repositoryPath: repository });
  const before = await runtime.inspectApp(app.id);
  const conversation = await runtime.conversation('Full app supervisor', app.id);
  const coworker = await runtime.coworker(conversation.id, 'Fixture worker');
  await runtime.chat(conversation.id, 'Persisted supervisor fixture message', 'full-app-chat-fixture');
  await Promise.all([...runtime.pending]);
  assert.equal((await runtime.conversation('Duplicate supervisor',app.id)).id,conversation.id);
  const secondCoworker=await runtime.coworker(conversation.id,'Second reusable worker');
  await assert.rejects(runtime.coworker(conversation.id,'Third worker'),/Reuse/);
  const historicalId=randomUUID();
  await pool.query("INSERT INTO agent_conversations(id,title,app_id,created_at) VALUES($1,'Historical supervisor',$2,now()+interval '1 day')",[historicalId,app.id]);
  await pool.query("INSERT INTO agent_messages(id,conversation_id,role,text) VALUES($1,$2,'assistant','Saved historical message')",[randomUUID(),historicalId]);
  const task = await runtime.prepare({ conversationId: conversation.id, coworkerId: coworker.id, goal: 'Create isolated acceptance marker', requestKey: 'full-app-worker-fixture' });
  const beforeCalls = provider.calls;
  receipt.operationId = task.id;
  const protectedBefore = await pool.query('SELECT * FROM agent_apps ORDER BY id');
  const messagesBefore = await pool.query('SELECT * FROM agent_messages WHERE conversation_id=$1 ORDER BY id', [conversation.id]);
  const permissionsBefore = await pool.query("SELECT table_name, privilege_type, grantee FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY 1,2,3");
  stages.runtime = 'passed';
  currentStage = 'browser';
  const dist = path.join(root, 'desktop/dist');
  server = createServer(async (req, res) => {
    try {
      if (req.method === 'POST' && req.url === '/fixture-invoke') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const { method, path: requestPath, body } = JSON.parse(Buffer.concat(chunks).toString());
        const value = await route(method, requestPath, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(value));
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      const file = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(dist + path.sep)) throw new Error('Invalid path');
      const bytes = await fs.readFile(file);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(bytes);
    } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: error.message })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { chromium } = await import(pathToFileURL(playwright).href);
  browser = await chromium.launch({ executablePath: edge, headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'ensure_runtime') return;
      if (command !== 'runtime_request') throw new Error('Unsupported native command');
      const response = await fetch('/fixture-invoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      return result;
    } };
  });
  await page.goto('http://127.0.0.1:' + server.address().port, { timeout: 30000 });
  await page.getByText('Saved supervisor fixture response.').waitFor({ timeout: 30000 });
  await page.getByRole('button',{name:'Apps',exact:true}).click();
  await page.getByRole('combobox',{name:'Selected app',exact:true}).selectOption(app.id);
  const history=page.locator('.app-chat-archive');
  assert.equal(await history.getAttribute('open'),null);
  assert.equal(await page.getByRole('navigation',{name:'Conversations',exact:true}).getByRole('button').count(),1);
  await history.locator('summary').click();
  await history.getByRole('button',{name:'Historical supervisor',exact:true}).click();
  await page.getByText('Saved historical message',{exact:true}).waitFor();
  await page.getByText('Read-only history. Open supervisor to continue.',{exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Conversations',exact:true}).getByRole('button',{name:'supervisor',exact:true}).click();
  await page.getByText('Saved supervisor fixture response.').waitFor();
  receipt.compactHistoryVerified=true;
  await history.locator('summary').click();
  await page.screenshot({path:path.join(root,'.local/session-reuse-sidebar.png')});
  await history.locator('summary').click();
  await page.screenshot({path:path.join(root,'.local/session-reuse-history.png')});
  await history.locator('summary').click();
  stages.browser = 'passed';
  currentStage = 'approval';
  await page.getByRole('button', { name: 'Show coworker panel', exact: true }).click();
  assert.equal(await page.getByRole('button',{name:'Add coworker',exact:true}).isDisabled(),true);
  await page.getByRole('button', { name: 'Approve worker', exact: true }).waitFor();
  assert.equal(provider.calls, beforeCalls);
  await page.getByRole('button', { name: 'Approve worker', exact: true }).click();
  await waitFor(async () => { const row = (await pool.query('SELECT * FROM agent_operations WHERE id=$1', [task.id])).rows[0]; assert.equal(row.state, 'completed'); return row; });
  assert.equal(provider.calls, beforeCalls + 1);
  stages.approval = 'passed';
  currentStage = 'workspace';
  assert.ok(task.workspace.startsWith(options.appWorkspaceRoot + path.sep));
  assert.notEqual(task.workspace, repository);
  await fs.access(path.join(task.workspace, 'codeitz-full-app-fixture.mjs'));
  stages.workspace = 'passed';
  currentStage = 'progress';
  const activity = await runtime.activityPage(task.id);
  assert.ok(activity.items.some(item => item.data.message?.includes('Fixture progress')));
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await page.getByRole('tabpanel',{name:'Activity',exact:true}).getByText('Fixture progress from isolated provider.').waitFor();
  stages.progress = 'passed';
  currentStage = 'review';
  await page.getByRole('tab', { name: 'Changes', exact: true }).click();
  const reviewResponse=page.waitForResponse(response=>response.url().endsWith('/fixture-invoke')&&response.request().postDataJSON()?.path===`/api/runtime/workers/${task.id}/changes`);
  await page.getByRole('button', { name: 'Review repository changes' }).click();
  assert.equal((await reviewResponse).status(),200);
  const manifest = await runtime.changes(task.id);
  assert.ok(manifest.files.some(file => file.path === 'codeitz-full-app-fixture.mjs'));
  receipt.manifestDigest = manifest.digest;
  const saved = (await pool.query('SELECT * FROM agent_operations WHERE id=$1', [task.id])).rows[0];
  assert.equal(saved.completion_assessment?.status, 'reported-ready');
  assert.equal(saved.applied_at, null);
  assert.equal(await page.getByRole('button', { name: 'Apply reviewed changes' }).isDisabled(), true);
  receipt.reusedCoworkerId=coworker.id;
  const initialThread=(await pool.query('SELECT provider_thread_id FROM agent_coworkers WHERE id=$1',[coworker.id])).rows[0].provider_thread_id;
  provider.partial = true;
  const partial = await runtime.prepare({conversationId:conversation.id,coworkerId:coworker.id,goal:'Partial fixture requires more implementation',requestKey:'full-app-partial-fixture'});
  await page.reload();
  await page.getByRole('button', {name:'Show coworker panel',exact:true}).click();
  await page.getByRole('button',{name:'Tasks',exact:true}).click();
  await page.getByRole('button', {name:/Open task.*Partial fixture/}).click();
  await page.getByRole('button', {name:'Approve worker',exact:true}).click();
  await waitFor(async()=>{
    const row=(await pool.query('SELECT * FROM agent_operations WHERE id=$1',[partial.id])).rows[0];
    assert.equal(row.state,'completed');
    assert.equal(row.completion_assessment.status,'needs-work');
  });
  await page.getByRole('tab',{name:'Plan',exact:true}).click();
  await page.getByRole('region',{name:'Completion assessment'}).getByText('Required implementation is unfinished.').waitFor();
  await page.getByRole('tab',{name:'Changes',exact:true}).click();
  const partialReviewResponse=page.waitForResponse(response=>response.url().endsWith('/fixture-invoke')&&response.request().postDataJSON()?.path===`/api/runtime/workers/${partial.id}/changes`);
  await page.getByRole('button',{name:'Review repository changes'}).click();
  assert.equal((await partialReviewResponse).status(),200);
  const partialManifest=await runtime.changes(partial.id);
  await assert.rejects(runtime.apply(partial.id,partialManifest.digest),/Completion assessment needs work/);
  assert.equal(await page.getByRole('button',{name:'Apply reviewed changes'}).isDisabled(),true);
  assert.notEqual(partial.workspace,task.workspace);
  assert.equal((await pool.query('SELECT provider_thread_id FROM agent_coworkers WHERE id=$1',[coworker.id])).rows[0].provider_thread_id,initialThread);
  receipt.sameCoworkerSeparateWorkspaces=true;
  receipt.partialOutputRejected = true;
  const expectedCalls=provider.calls;
  stages.review = 'passed';
  currentStage = 'recovery';
  await runtime.close();
  pool = new pg.Pool(config);
  runtime = new Runtime(pool, provider, path.join(fixture, 'state'), options);
  await runtime.initialize();
  await page.reload();
  await page.getByText('Saved supervisor fixture response.').waitFor();
  const recovered = (await pool.query('SELECT * FROM agent_operations WHERE id=$1', [task.id])).rows[0];
  assert.equal(recovered.state, 'completed');
  assert.deepEqual(recovered.completion_assessment, saved.completion_assessment);
  assert.equal(provider.calls, expectedCalls);
  stages.recovery = 'passed';
  currentStage = 'preservation';
  assert.deepEqual((await pool.query('SELECT * FROM agent_apps ORDER BY id')).rows, protectedBefore.rows);
  for (const message of messagesBefore.rows) {
    assert.deepEqual((await pool.query('SELECT * FROM agent_messages WHERE id=$1', [message.id])).rows[0], message);
  }
  assert.deepEqual((await pool.query("SELECT table_name, privilege_type, grantee FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY 1,2,3")).rows, permissionsBefore.rows);
  assert.deepEqual(await runtime.inspectApp(app.id), before);
  stages.preservation = 'passed';
  receipt.profile = { id: 'full-app-fixture-v1', hash: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex') };
  const {build,...rest}=stages;
  receipt.acceptance=acceptanceReceipt({operationId:task.id,manifestDigest:receipt.manifestDigest,profileId:receipt.profile.id,profileHash:receipt.profile.hash,stages:{...rest,'desktop-ui':build}});
  receipt.coverage = receipt.acceptance.coverage;
  receipt.trustedApplyReceipt = false;
} catch (error) {
  failed = true;
  if (pool) {
    try {
      receipt.fixtureOperations = (await pool.query('SELECT kind,state,progress,execution_error FROM agent_operations ORDER BY created_at')).rows;
    } catch {}
  }
  if (stages[currentStage] === 'skipped') stages[currentStage] = 'failed';
  receipt.error = (error.stack ?? error.message).replaceAll(password, '[fixture password redacted]');
} finally {
  const cleanupErrors = [];
  if (browser) await browser.close().catch(error => cleanupErrors.push(error.message));
  if (server) await new Promise(resolve => server.close(resolve));
  if (runtime) await runtime.close().catch(error => cleanupErrors.push(error.message));
  else if (pool) await pool.end().catch(error => cleanupErrors.push(error.message));
  if (containerId) {
    try {
      const [identity]=JSON.parse((await command(docker,['inspect',containerId])).stdout);
      assert.equal(identity.Id,containerId);
      assert.equal(identity.Config.Labels['codeitz.full-app-fixture'],fixtureId);
      await command(docker, ['rm', '-f', containerId], 30000);
    } catch (error) { cleanupErrors.push(error.message.replaceAll(password, '[fixture password redacted]')); }
  }
  if (fixtureCreated) {
    try {
      assert.equal(path.dirname(fixture),fixtureParent);
      assert.match(path.basename(fixture),/^[a-f0-9-]{36}$/);
      assert.equal(await fs.realpath(fixture),fixture);
      assert.equal((await fs.lstat(fixture)).isSymbolicLink(),false);
      await fs.rm(fixture,{recursive:true,force:true});
    } catch(error) {cleanupErrors.push(error.message);}
  }
  receipt.cleanup = cleanupErrors.length ? 'failed' : 'verified';
  if (cleanupErrors.length) { receipt.cleanupErrors = cleanupErrors; failed = true; }
  if (Object.values(stages).some(status => status !== 'passed')) failed = true;
  if (failed) receipt.coverage = 'none';
  await fs.writeFile(path.join(root, '.local/session-reuse-full-app-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
  if (failed) process.exitCode = 1;
}
