import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

const LOCAL_ORIGIN = 'http://127.0.0.1:14305';
const LOCAL_ORIGINS = new Set([LOCAL_ORIGIN, 'http://127.0.0.1:4305']);
const OWNER = /^(apps|devkit)\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PUBLIC_ID = /^[a-z0-9]{8}$/;
const bounded = (value, size = 2000) => typeof value === 'string' ? value.slice(0, size) : '';

/** Read-only view of the existing installed Codeitz through its original login/API. */
export class CodeitzSource {
  #credentialsPath;
  #origin;
  #fetch;
  #cookies = new Map();
  #tab = randomBytes(16).toString('hex');
  #csrf = '';
  #authenticated = false;
  #loginPending;
  #snapshotPending;
  #cached;
  #cachedAt = 0;

  constructor({ credentialsPath, origin = LOCAL_ORIGIN, fetchImpl = globalThis.fetch } = {}) {
    if (!LOCAL_ORIGINS.has(origin)) throw new Error('The existing source must be local Docker Codeitz on port 14305 or main-repo Codeitz on port 4305');
    if (typeof credentialsPath !== 'string' || !path.isAbsolute(credentialsPath)) throw new Error('Protected local source credential file is required');
    if (typeof fetchImpl !== 'function') throw new Error('HTTP transport unavailable');
    this.#origin = origin;
    this.#credentialsPath = credentialsPath;
    this.#fetch = fetchImpl;
  }

  async #request(route, method = 'GET', body) {
    const headers = { Origin: this.#origin, 'X-Platform-Tab': this.#tab };
    if (this.#cookies.size) headers.Cookie = [...this.#cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = this.#csrf; }
    const response = await this.#fetch(`${this.#origin}${route}`, {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const pair = cookie.split(';')[0];
      const separator = pair.indexOf('=');
      if (separator > 0) this.#cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    if (response.status >= 300 && response.status < 400) throw new Error('Source redirect was rejected');
    return response;
  }

  async #json(response) {
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error(`Source request denied (HTTP ${response.status})`), { status: response.status }); }
    const content = await response.text();
    if (Buffer.byteLength(content) > 4 * 1024 * 1024) throw new Error('Source response exceeds the read-only view limit');
    try { return JSON.parse(content); } catch { throw new Error('Source returned invalid JSON'); }
  }

  async #login() {
    if (this.#authenticated) return;
    if (this.#loginPending) return this.#loginPending;
    this.#loginPending = (async () => {
      const values = parseEnv(await fs.readFile(this.#credentialsPath, 'utf8'));
      const identifier = values.SUPER_ADMIN_USERNAME;
      const password = values.SUPER_ADMIN_PASSWORD;
      const corporateId = values.DEFAULT_TENANT_CORPORATE_ID;
      if (!identifier || !password || !corporateId) throw new Error('Existing approved source account settings are incomplete');
      await this.#json(await this.#request('/platform-api/v1/identity/login', 'POST', { identifier, password, corporateId, realm: 'sa' }));
      const session = await this.#json(await this.#request('/platform-api/v1/identity/session'));
      if (session.realm !== 'sa' || typeof session.csrfToken !== 'string' || !session.csrfToken || !session.user?.publicId) throw new Error('Source did not establish the approved original session');
      this.#csrf = session.csrfToken;
      this.#authenticated = true;
    })().finally(() => { this.#loginPending = undefined; });
    return this.#loginPending;
  }

  async #readRecords() {
    const [overview, runner, business, todos] = await Promise.all([
      this.#request('/api/v1/projects').then(response => this.#json(response)),
      this.#request('/api/v1/tasks').then(response => this.#json(response)),
      this.#request('/api/v1/work-tasks').then(response => this.#json(response)),
      this.#request('/api/v1/todos').then(response => this.#json(response)),
    ]);
    if (!Array.isArray(overview.projects) || !Array.isArray(runner.tasks) || !Array.isArray(business.tasks) || !Array.isArray(todos.todos)) throw new Error('Source list contract is incompatible');
    if ([overview.projects, runner.tasks, business.tasks, todos.todos].some(rows => rows.length > 5000)) throw new Error('Source list exceeds the read-only view limit');
    const projects = overview.projects.map(item => {
      if (!OWNER.test(item.owner)) throw new Error('Source project owner is invalid');
      return {
        owner: item.owner, name: bounded(item.name, 100), area: item.owner.split('/')[0], purpose: bounded(item.purpose),
        active: item.active === true, orderNo: Number.isSafeInteger(item.orderNo) ? item.orderNo : 0,
        state: bounded(item.state, 50), taskCount: Number.isSafeInteger(item.taskCount) ? item.taskCount : 0,
        activeTasks: Number.isSafeInteger(item.activeTasks) ? item.activeTasks : 0,
        completedTasks: Number.isSafeInteger(item.completedTasks) ? item.completedTasks : 0,
      };
    });
    if (new Set(projects.map(item => item.owner)).size !== projects.length) throw new Error('Source contains duplicate project owners');
    const owners = new Set(projects.map(item => item.owner));
    const runnerTasks = runner.tasks.map(item => {
      if (!UUID.test(item.id) || !OWNER.test(item.owner)) throw new Error('Source runner task identity is invalid');
      return { sourceKind: 'runner', id: item.id, owner: item.owner, projectAvailable: owners.has(item.owner), title: bounded(item.goal), status: bounded(item.status, 50), createdAt: bounded(item.createdAt, 50), updatedAt: bounded(item.updatedAt, 50) };
    });
    const businessTasks = business.tasks.map(item => {
      if (!PUBLIC_ID.test(item.id)) throw new Error('Source business task public ID is invalid');
      return { sourceKind: 'business', id: item.id, owner: null, title: bounded(item.title), status: bounded(item.status, 100), statusCode: bounded(item.statusCode, 50), assignedTo: bounded(item.assignedTo, 150), dueDate: bounded(item.dueDate, 20), revision: Number.isSafeInteger(item.revision) ? item.revision : null, updatedAt: bounded(item.updatedAt, 50) };
    });
    const todoTasks = todos.todos.map(item => {
      if (!PUBLIC_ID.test(item.id) && !UUID.test(item.id)) throw new Error('Source todo public ID is invalid');
      const owner = typeof item.projectId === 'string' && OWNER.test(item.projectId) ? item.projectId : null;
      return { sourceKind: 'todo', id: item.id, owner, projectAvailable: owner ? owners.has(owner) : false, title: bounded(item.title, 500), status: bounded(item.status, 50), priority: bounded(item.priority, 50), dueDate: bounded(item.dueDate, 20), revision: Number.isSafeInteger(todos.revision) ? todos.revision : null, updatedAt: bounded(item.updatedAt, 50) };
    });
    return { connection: { connected: true, origin: this.#origin, mode: 'read-only', message: 'Existing local Codeitz records; source actions are disabled.' }, projects, runnerTasks, businessTasks, todoTasks };
  }

  async snapshot({ refresh = false } = {}) {
    if (!refresh && this.#cached && Date.now() - this.#cachedAt < 3000) return structuredClone(this.#cached);
    if (this.#snapshotPending) return this.#snapshotPending;
    this.#snapshotPending = (async () => {
      try {
        await this.#login();
        let result;
        try { result = await this.#readRecords(); }
        catch (error) {
          if (error.status !== 401) throw error;
          this.#authenticated = false; this.#cookies.clear(); this.#csrf = '';
          await this.#login(); result = await this.#readRecords();
        }
        this.#cached = result; this.#cachedAt = Date.now();
        return structuredClone(result);
      } catch {
        this.#cached = undefined;
        return { connection: { connected: false, origin: this.#origin, mode: 'read-only', message: 'Existing local Codeitz is unavailable or access was denied. Source records were not changed.' }, projects: [], runnerTasks: [], businessTasks: [], todoTasks: [] };
      }
    })().finally(() => { this.#snapshotPending = undefined; });
    return this.#snapshotPending;
  }

  async close() {
    if (this.#snapshotPending) await this.#snapshotPending;
    if (this.#authenticated) {
      try { const response = await this.#request('/platform-api/v1/identity/logout', 'POST', {}); await response.body?.cancel(); } catch { /* Expired/unavailable session is not a source write. */ }
    }
    this.#authenticated = false; this.#cookies.clear(); this.#csrf = ''; this.#cached = undefined;
  }
}
