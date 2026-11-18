import type { ProjectTaskRunner } from '../../task-runner/index.ts';

// In-process public runner gateway: no second service or fresh Codex session.
export class CodeitzConnection {
  private runner: ProjectTaskRunner;
  constructor(runner: ProjectTaskRunner) { this.runner = runner; }
  link(query: Record<string, string> = {}) {
    if (query.task) return `/tasks/${encodeURIComponent(query.task)}`;
    if (query.view === 'records') return '/task-records' + (query.owner ? `?owner=${encodeURIComponent(query.owner)}` : '');
    return '/tasks/new';
  }
  async request(endpoint: '/api/tasks' | `/api/tasks/${string}/review` | `/api/tasks/${string}/audit`, body?: { owner: string; goal: string } | { decision: 'accepted' | 'changes_requested'; feedback?: string } | Record<string, never>): Promise<any> {
    if (endpoint === '/api/tasks') {
      if (body && 'owner' in body) return this.runner.create(body.owner, body.goal);
      return { tasks: await this.runner.list() };
    }
    const match = endpoint.match(/^\/api\/tasks\/([^/]+)\/(audit|review)$/);
    if (!match) throw new Error('Unsupported task operation.');
    if (match[2] === 'audit') return this.runner.audit(match[1]);
    if (!body || !('decision' in body)) throw new Error('Choose a review decision.');
    return this.runner.review(match[1], body.decision, body.feedback);
  }
}
