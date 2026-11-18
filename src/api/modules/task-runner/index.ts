// Public read-only Codex integration. Task execution remains owned by the runner.
import { runCodex, codexStatus } from './infrastructure/codex.ts';
import { safeActivity } from './infrastructure/store.ts';
export const checkCodexConnection = codexStatus;
export function cleanCodexText(text: string) { return text.split('\n').map(line => safeActivity(line)).join('\n').slice(0, 30000); }
export function inspectWithCodex(input: Omit<Parameters<typeof runCodex>[0], 'mode'>) { return runCodex({ ...input, mode: 'plan' }); }

// Public interface for project coordination; coding approval remains with the runner.
export type ProjectTaskRunner = Pick<import('./application/service.ts').TaskRunner, 'list' | 'create' | 'review' | 'audit'>;
