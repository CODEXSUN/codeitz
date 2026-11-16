import { randomUUID } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import type { CodingTask, TaskEvent, TaskAudit } from '../../../../../contracts/task.ts';
import { activeTaskStatuses } from '../../../../../contracts/task.ts';
import { listProducts } from '../../governance-audit/index.ts';
import { runCodex } from '../infrastructure/codex.ts';
import { execute } from '../infrastructure/process.ts';
import { optionalText, readTasks, recordWork, saveTask, snapshot, appendEvent, allEvents, saveTasks } from '../infrastructure/store.ts';

import { completionResult } from './completion.ts';

type CodexConnector = typeof runCodex;
export class TaskRunner {
  private listeners = new Set<(update: { type: 'task'; task: CodingTask } | { type: 'activity'; event: TaskEvent }) => void>();
  subscribe(listener: (update: { type: 'task'; task: CodingTask } | { type: 'activity'; event: TaskEvent }) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private async persist(task: CodingTask) {
    await saveTask(this.records, task);
    for (const listener of this.listeners) listener({ type: 'task', task });
  }
  private activity(task: CodingTask, kind: TaskEvent['kind'], message: string) {
    const event = appendEvent(this.records, task.id, kind, message);
    for (const listener of this.listeners) listener({ type: 'activity', event });
  }
  private busy = false;
  private activeId: string | undefined;
  private controller: AbortController | undefined;
  private jobs = new Set<Promise<void>>();
  private workspace: string;
  private records: string;
  private codex: CodexConnector;
  constructor(workspace: string, records: string, codex: CodexConnector = runCodex) {
    this.workspace = workspace; this.records = records; this.codex = codex;
  }

  private reading: Promise<CodingTask[]> | undefined;
  async list() {
    if (this.reading) return this.reading;
    this.reading = this.recoverTasks();
    try { return await this.reading; } finally { this.reading = undefined; }
  }
  private async recoverTasks() {
    const tasks = await readTasks(this.records);
    for (const task of tasks) if (activeTaskStatuses.includes(task.status) && task.id !== this.activeId) {
      task.status = 'failed'; this.activity(task, 'phase', 'Previous worker run was interrupted.'); task.error = 'Previous run was interrupted. Review existing changes before creating a new task.';
      await recordWork((await this.target(task.owner)).directory, task);
      await this.persist(task);
    }
    for (const task of tasks) if (task.status === 'completed' && task.completionSummaryVersion !== 1) {
      task.codingResult ??= task.result;
      task.result = completionResult(task); task.completionSummaryVersion = 1;
      task.updatedAt = new Date().toISOString();
      await recordWork((await this.target(task.owner)).directory, task);
      this.activity(task, 'record', 'Final summary updated from saved check results. Original coding report preserved.');
      await this.persist(task);
    }
    return tasks;
  }
  private async target(owner: string) {
    const root = await realpath(this.workspace);
    if (!(await listProducts(root)).some(product => product.owner === owner)) throw new Error('Choose an app from the product list.');
    const directory = path.join(root, owner);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== directory) throw new Error('App must be a real workspace directory.');
    return { root, directory };
  }
  private async context(root: string, directory: string) {
    const documents = ['governance.md', 'coding-standard.md', 'app-structure.md', 'frontend-design-system.md', 'server-startup.md'];
    const rules = await Promise.all(documents.map(async name => `${name}\n${await readFile(path.join(root, 'mcp-governance/docs', name), 'utf8')}`));
    const instructions = await readFile(path.join(directory, 'AGENTS.md'), 'utf8');
    const work = await optionalText(path.join(directory, 'docs/work-record.md'));
    return `${rules.join('\n\n')}\n\nApp instructions:\n${instructions}\n\nPrevious work:\n${work}`;
  }
  private launch(task: CodingTask, job: (signal: AbortSignal) => Promise<void>) {
    this.activeId = task.id;
    this.controller = new AbortController();
    this.activity(task, 'phase', `${task.status} started. Local Codex worker assigned.`);
    const promise = (async () => {
      try { await job(this.controller!.signal); }
      catch (error) {
        task.status = 'failed'; task.error = error instanceof Error ? error.message : 'Task step failed.';
        this.activity(task, 'phase', task.error);
        await this.persist(task);
        try { await recordWork((await this.target(task.owner)).directory, task); } catch { /* Local task record remains the fallback. */ }
      }
      finally { this.busy = false; this.activeId = undefined; this.controller = undefined; }
    })();
    this.jobs.add(promise);
    void promise.finally(() => this.jobs.delete(promise)).catch(() => {});
  }
  private async planTask(task: CodingTask, directory: string, context: string, signal: AbortSignal) {
        task.plan = await this.codex({ directory, mode: 'plan', signal, onActivity: (kind, message) => this.activity(task, kind, message), prompt: `${context}\n\nUSER GOAL:\n${task.goal}\n\nPlan only. Do not change files or run installs, builds, Git mutations, or deployment. Inspect the selected app and return a short, module-owned implementation plan and appropriate checks. State blockers explicitly. Work only toward this goal; the user will separately authorize coding.` });
        task.status = 'planned'; await recordWork(directory, task); this.activity(task, 'record', 'Plan saved to the app work record. Waiting for coding approval.'); await this.persist(task);
  }
  async create(owner: string, goal: string) {
    if (this.busy) throw new Error('Another task step is running. Wait for it to finish.');
    this.busy = true;
    try {
      const { root, directory } = await this.target(owner);
      const context = await this.context(root, directory);
      const now = new Date().toISOString();
      const task: CodingTask = { id: randomUUID(), owner, goal, status: 'planning', createdAt: now, updatedAt: now, plan: '', result: '', checks: [], changedFiles: [] };
      this.activeId = task.id;
      await this.persist(task);
      this.launch(task, async signal => {
        await this.planTask(task, directory, context, signal);
      });
      return task;
    } catch (error) { this.busy = false; this.activeId = undefined; throw error; }
  }
  async step(id: string, action: 'plan' | 'code' | 'check') {
    if (this.busy) throw new Error('Another task step is running. Wait for it to finish.');
    this.busy = true;
    try {
      const task = (await readTasks(this.records)).find(task => task.id === id);
      if (!task || task.status !== (action === 'plan' ? 'draft' : action === 'code' ? 'planned' : 'coded')) throw new Error('This task is not ready for that step.');
      const { root, directory } = await this.target(task.owner);
      let context = action !== 'check' ? await this.context(root, directory) : '';
      if (task.parentTaskId && action !== 'check') {
        const parent = (await readTasks(this.records)).find(item => item.id === task.parentTaskId);
        if (!parent || parent.owner !== task.owner) throw new Error('Original task is unavailable.');
        context += `\n\nOriginal task reference: ${parent.id}\nOriginal goal: ${parent.goal}\nOriginal result: ${parent.result}\nRequested changes: ${task.goal}`;
      }
      task.status = action === 'plan' ? 'planning' : action === 'code' ? 'coding' : 'checking';
      this.activeId = task.id;
      await this.persist(task);
      this.launch(task, async signal => {
        if (action === 'plan') { await this.planTask(task, directory, context, signal); return; }
        if (action === 'code') {
          const before = await snapshot(directory);
          try {
            task.result = await this.codex({ directory, mode: 'code', signal, onActivity: (kind, message) => this.activity(task, kind, message), prompt: `${context}\n\nUSER GOAL:\n${task.goal}\n\nAPPROVED PLAN:\n${task.plan}\n\nImplement this goal only in the selected app. Preserve pre-existing work. Keep domain modules separate and reuse public framework/UI packages. Do not modify other repositories, read .env or credentials, change governance, install dependencies, run Git mutations, deploy, or broaden permissions. If shared packages need changes, report that blocker instead. The runner performs checks in a separate user-selected step. Summarize implemented work, remaining work, and any blockers; do not claim checks passed.` });
            task.codingResult = task.result;
            task.status = 'coded';
          } finally {
            const after = await snapshot(directory);
            task.changedFiles = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
          }
        } else {
          const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
          const checks = ['typecheck', 'build', 'test'].filter(name => typeof manifest.scripts?.[name] === 'string');
          if (!checks.length) throw new Error('No typecheck, build, or test scripts are declared for this app.');
          task.checks = [];
          for (const name of checks) {
            const args = process.platform === 'win32' ? ['/d', '/s', '/c', `npm run ${name}`] : ['run', name];
            this.activity(task, 'check', `Running ${name}…`);
            const result = await execute(process.platform === 'win32' ? 'cmd.exe' : 'npm', args, directory, undefined, signal, 120000);
            task.checks.push({ name, passed: result.code === 0, output: result.output.slice(-8000) });
            this.activity(task, 'check', `${name}: ${result.code === 0 ? 'passed' : 'failed'}.`);
            await this.persist(task);
            if (result.code !== 0) break;
          }
          task.status = task.checks.every(check => check.passed) ? 'completed' : 'failed';
          if (task.status === 'failed') task.error = 'An app check failed. Review its output and existing changes.';
          task.result = completionResult(task); task.completionSummaryVersion = 1;
        }
        await recordWork(directory, task); this.activity(task, 'record', `${task.status}: results saved to the app work record.`); await this.persist(task);
      });
      return task;
    } catch (error) { this.busy = false; this.activeId = undefined; throw error; }
  }
  async review(id: string, decision: 'accepted' | 'changes_requested', feedback = '') {
    if (this.busy) throw new Error('Wait for the current task step before reviewing.');
    this.busy = true;
    try {
      const task = (await this.list()).find(task => task.id === id);
      if (!task || task.status !== 'completed' || task.archivedAt || task.droppedAt) throw new Error('Review a completed, current task.');
      if (task.review) {
        if (task.review.decision !== decision || (decision === 'changes_requested' && task.review.feedback !== feedback.trim())) throw new Error('This result has already been reviewed.');
        return { task, followUpTaskId: task.review.followUpTaskId };
      }
      if (decision === 'accepted' && (!task.result || !task.checks.length || task.checks.some(check => !check.passed))) throw new Error('Only a result with passed checks can be accepted.');
      if (decision === 'changes_requested' && (!feedback.trim() || feedback.trim().length > 3000)) throw new Error('Describe the requested changes (up to 3000 characters).');
      const now = new Date().toISOString();
      const followUp: CodingTask | undefined = decision === 'changes_requested' ? {
        id: randomUUID(), owner: task.owner, parentTaskId: task.id, goal: feedback.trim(), status: 'draft',
        createdAt: now, updatedAt: now, plan: '', result: '', checks: [], changedFiles: [],
      } : undefined;
      task.review = { decision, reviewedAt: now, ...(followUp ? { feedback: feedback.trim(), followUpTaskId: followUp.id } : {}) };
      task.result = completionResult(task);
      await saveTasks(this.records, followUp ? [task, followUp] : [task]);
      for (const item of followUp ? [task, followUp] : [task]) for (const listener of this.listeners) listener({ type: 'task', task: item });
      this.activity(task, 'audit', decision === 'accepted' ? 'Result accepted by user.' : `Changes requested. Linked follow-up: ${followUp!.id}. ${feedback.trim()}`);
      if (followUp) this.activity(followUp, 'record', `Follow-up draft linked to original task ${task.id}. Planning and coding have not started.`);
      const { directory } = await this.target(task.owner);
      try { await recordWork(directory, task); }
      catch { this.activity(task, 'record', 'Review saved in SQLite; app work-record append failed.'); }
      return { task, followUpTaskId: followUp?.id };
    } finally { this.busy = false; }
  }
  async manage(id: string, action: 'archive' | 'restore' | 'drop') {
    if (this.busy) throw new Error('Wait for the current task step before changing records.');
    this.busy = true;
    try {
    const task = (await this.list()).find(task => task.id === id);
    if (!task) throw new Error('Task not found.');
    if (activeTaskStatuses.includes(task.status) || !['completed', 'failed'].includes(task.status)) throw new Error('Only finished tasks can be archived or restored.');
    if (action === 'drop' && task.status !== 'completed') throw new Error('Only completed tasks can be dropped.');
    if (action === 'archive') task.archivedAt = new Date().toISOString();
    if (action === 'drop') { task.archivedAt ??= new Date().toISOString(); task.droppedAt = new Date().toISOString(); }
    if (action === 'restore') { delete task.archivedAt; delete task.droppedAt; }
    this.activity(task, 'audit', `Task ${action === 'drop' ? 'moved to Dropped (recoverable)' : action === 'archive' ? 'archived' : 'restored'}.`);
    await this.persist(task); return task;
    } finally { this.busy = false; }
  }
  async audit(id: string): Promise<TaskAudit> {
    const task = (await this.list()).find(task => task.id === id);
    if (!task) throw new Error('Task not found.');
    if (activeTaskStatuses.includes(task.status)) throw new Error('Wait for the current step before auditing its record.');
    const { directory } = await this.target(task.owner);
    const work = await readFile(path.join(directory, 'docs/work-record.md'), 'utf8');
    let required: string[] = [];
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      required = ['typecheck', 'build', 'test'].filter(name => typeof manifest.scripts?.[name] === 'string');
    } catch { /* Missing manifest is reported by the completion finding. */ }
    const findings = [
      { label: 'Plan recorded', passed: !!task.plan, detail: task.plan ? 'Saved plan is available.' : 'No completed plan was saved.' },
      { label: 'App work record', passed: work.includes(task.id), detail: 'Checked the app work record for this task ID.' },
      { label: 'Activity history', passed: allEvents(this.records, task.id).some(event => event.kind !== 'audit'), detail: 'Legacy tasks may predate live activity recording.' },
      { label: 'Completion evidence', passed: task.status !== 'completed' || (!!task.result && required.length > 0 && required.every(name => task.checks.some(check => check.name === name && check.passed))), detail: task.status === 'completed' ? 'Compared saved results and passed checks with the app’s declared scripts.' : 'Task is not labelled completed.' },
    ];
    const audit = { passed: findings.every(finding => finding.passed), findings };
    this.activity(task, 'audit', `Record audit: ${audit.passed ? 'passed' : 'review needed'}. ${findings.filter(f => !f.passed).map(f => f.label).join(', ')}`);
    return audit;
  }
  async close() { this.controller?.abort(); await Promise.allSettled(this.jobs); }
}
